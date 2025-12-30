import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { fileUpload } from '../middleware/upload';
import { env } from '../config/env';
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

// Get timesheet images for a specific project
router.get('/timesheet-images/:projectId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Check if user can view all timesheets
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       req.user!.permissions.includes('can_view_all_timesheets');

    let sql = `
      SELECT 
        t.id as timesheet_id,
        t.user_id,
        t.date as timesheet_date,
        t.image_urls,
        t.created_at,
        u.name as user_name,
        p.code as project_code,
        p.name as project_name
      FROM timesheets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.project_id = $1 
        AND t.image_urls IS NOT NULL 
        AND array_length(t.image_urls, 1) > 0
    `;
    const params: any[] = [req.params.projectId];

    // If user can't view all, only show their own timesheet images
    if (!canViewAll) {
      sql += ` AND t.user_id = $2`;
      params.push(req.user!.id);
    }

    sql += ` ORDER BY t.date DESC, t.created_at DESC`;

    const result = await query(sql, params);

    // Flatten image_urls into individual image objects
    const images: any[] = [];
    result.rows.forEach((row: any) => {
      if (row.image_urls && Array.isArray(row.image_urls)) {
        row.image_urls.forEach((url: string, index: number) => {
          const filename = url.split('/').pop() || '';
          images.push({
            url,
            filename,
            timesheet_id: row.timesheet_id,
            timesheet_date: row.timesheet_date,
            upload_date: row.created_at,
            user_name: row.user_name,
            project_code: row.project_code,
            project_name: row.project_name,
            image_index: index
          });
        });
      }
    });

    res.json(images);
  } catch (error: any) {
    console.error('Get timesheet images error:', error);
    const errorMessage = error.message || 'Failed to fetch timesheet images';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    res.status(500).json({ 
      error: isTableError ? 'Database tables not found. Please run migrations.' : 'Failed to fetch timesheet images',
      details: env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Get all timesheet images across all projects (summary)
router.get('/timesheet-images', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Check if user can view all timesheets
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       req.user!.permissions.includes('can_view_all_timesheets');

    let sql = `
      SELECT 
        t.project_id,
        p.code as project_code,
        p.name as project_name,
        c.name as client_name,
        COUNT(*) FILTER (WHERE t.image_urls IS NOT NULL AND array_length(t.image_urls, 1) > 0) as timesheets_with_images,
        SUM(array_length(t.image_urls, 1)) FILTER (WHERE t.image_urls IS NOT NULL) as total_images
      FROM timesheets t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE t.image_urls IS NOT NULL AND array_length(t.image_urls, 1) > 0
    `;
    const params: any[] = [];

    // If user can't view all, only show their own timesheet images
    if (!canViewAll) {
      sql += ` AND t.user_id = $1`;
      params.push(req.user!.id);
    }

    sql += ` GROUP BY t.project_id, p.code, p.name, c.name ORDER BY c.name, p.code`;

    const result = await query(sql, params);

    // Convert numeric strings to numbers
    const rows = result.rows.map((row: any) => ({
      ...row,
      timesheets_with_images: parseInt(row.timesheets_with_images) || 0,
      total_images: parseInt(row.total_images) || 0
    }));

    res.json(rows);
  } catch (error: any) {
    console.error('Get timesheet images summary error:', error);
    const errorMessage = error.message || 'Failed to fetch timesheet images summary';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    res.status(500).json({ 
      error: isTableError ? 'Database tables not found. Please run migrations.' : 'Failed to fetch timesheet images summary',
      details: env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Get all logo files
router.get('/logos', authenticate, requirePermission('can_manage_settings'), async (req: AuthRequest, res: Response) => {
  try {
    const logosDir = path.join(__dirname, '../../uploads/logos');
    
    // Check if directory exists, create it if it doesn't
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
      return res.json([]);
    }

    // Read directory and get file stats
    let files: string[];
    try {
      files = fs.readdirSync(logosDir);
    } catch (readError) {
      console.error('Failed to read logos directory:', readError);
      return res.json([]);
    }

    const logos = await Promise.all(
      files.map(async (filename: string) => {
        try {
          const filePath = path.join(logosDir, filename);
          const stats = fs.statSync(filePath);
          // Skip directories
          if (stats.isDirectory()) {
            return null;
          }
          return {
            url: `/uploads/logos/${filename}`,
            filename,
            upload_date: stats.birthtime || stats.mtime,
            file_size: stats.size
          };
        } catch (statError) {
          console.error(`Failed to get stats for ${filename}:`, statError);
          return null;
        }
      })
    );

    // Filter out null values and sort by upload date (newest first)
    const validLogos = logos.filter((logo): logo is NonNullable<typeof logo> => logo !== null);
    validLogos.sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());

    res.json(validLogos);
  } catch (error: any) {
    console.error('Get logos error:', error);
    const errorMessage = error.message || 'Failed to fetch logos';
    res.status(500).json({ 
      error: 'Failed to fetch logos',
      details: env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Delete a logo file
router.delete('/logos/:filename', authenticate, requirePermission('can_manage_settings'), async (req: AuthRequest, res: Response) => {
  try {
    const filename = req.params.filename;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../../uploads/logos', safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Logo file not found' });
    }

    // Delete file from filesystem
    fs.unlinkSync(filePath);

    // Check if this logo is set as company_logo in settings and remove it
    await query(
      `UPDATE settings 
       SET value = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE key = 'company_logo' AND value = $1`,
      [`/uploads/logos/${safeFilename}`]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'logo', JSON.stringify({ filename: safeFilename })]
    );

    res.json({ message: 'Logo deleted successfully' });
  } catch (error) {
    console.error('Delete logo error:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

export default router;

