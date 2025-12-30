import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { fileUpload } from '../middleware/upload';
import path from 'path';
import fs from 'fs';

const router = Router();

// Get all files with filters
router.get('/', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { project_id, cost_center_id, file_type } = req.query;
    
    let sql = `
      SELECT f.*,
        u.name as uploaded_by_name,
        p.code as project_code,
        p.name as project_name,
        c.name as client_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name
      FROM project_files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN cost_centers cc ON f.cost_center_id = cc.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (project_id) {
      sql += ` AND f.project_id = $${paramCount++}`;
      params.push(project_id);
    }

    if (cost_center_id) {
      sql += ` AND f.cost_center_id = $${paramCount++}`;
      params.push(cost_center_id);
    }

    if (file_type) {
      sql += ` AND f.file_type = $${paramCount++}`;
      params.push(file_type);
    }

    sql += ' ORDER BY f.created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Get single file metadata
router.get('/:id', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT f.*,
        u.name as uploaded_by_name,
        p.code as project_code,
        p.name as project_name,
        c.name as client_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name
      FROM project_files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN cost_centers cc ON f.cost_center_id = cc.id
      WHERE f.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// Download file
router.get('/:id/download', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT file_path, file_name, mime_type FROM project_files WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    const filePath = path.join(__dirname, '../../', file.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    if (file.mime_type) {
      res.setHeader('Content-Type', file.mime_type);
    }
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Upload file
router.post('/', authenticate, requirePermission('can_edit_projects'), fileUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { project_id, cost_center_id } = req.body;

    if (!project_id) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Determine file type from mime type
    let fileType = 'document';
    if (req.file.mimetype.startsWith('image/')) {
      fileType = 'image';
    } else if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('document') || req.file.mimetype.includes('spreadsheet')) {
      fileType = 'document';
    }

    const result = await query(
      `INSERT INTO project_files (
        project_id, cost_center_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        project_id,
        cost_center_id || null,
        req.file.originalname,
        req.file.path.replace(path.join(__dirname, '../../'), ''),
        fileType,
        req.file.size,
        req.file.mimetype,
        req.user!.id
      ]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'upload', 'file', result.rows[0].id, JSON.stringify({ file_name: req.file.originalname })]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Upload file error:', error);
    // Delete uploaded file if database insert fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Delete file
router.delete('/:id', authenticate, requirePermission('can_edit_projects'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT file_path FROM project_files WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(__dirname, '../../', result.rows[0].file_path);

    // Delete from database first
    await query('DELETE FROM project_files WHERE id = $1', [req.params.id]);

    // Delete file from disk
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'file', req.params.id]
    );

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get files for a project
router.get('/projects/:projectId', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT f.*,
        u.name as uploaded_by_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name
      FROM project_files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN cost_centers cc ON f.cost_center_id = cc.id
      WHERE f.project_id = $1
      ORDER BY f.created_at DESC`,
      [req.params.projectId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get project files error:', error);
    res.status(500).json({ error: 'Failed to fetch project files' });
  }
});

// Get files for a cost center
router.get('/cost-centers/:costCenterId', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT f.*,
        u.name as uploaded_by_name,
        p.code as project_code,
        p.name as project_name
      FROM project_files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE f.cost_center_id = $1
      ORDER BY f.created_at DESC`,
      [req.params.costCenterId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get cost center files error:', error);
    res.status(500).json({ error: 'Failed to fetch cost center files' });
  }
});

export default router;

