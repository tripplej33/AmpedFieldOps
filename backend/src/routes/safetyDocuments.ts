import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { generateDocumentPDF } from '../lib/pdfGenerator';
import path from 'path';
import fs from 'fs';

const router = Router();

// Get all safety documents with filters
router.get('/', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { project_id, cost_center_id, document_type, status } = req.query;
    
    let sql = `
      SELECT d.*,
        u1.name as created_by_name,
        u2.name as approved_by_name,
        p.code as project_code,
        p.name as project_name,
        c.name as client_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name
      FROM safety_documents d
      LEFT JOIN users u1 ON d.created_by = u1.id
      LEFT JOIN users u2 ON d.approved_by = u2.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN cost_centers cc ON d.cost_center_id = cc.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (project_id) {
      sql += ` AND d.project_id = $${paramCount++}`;
      params.push(project_id);
    }

    if (cost_center_id) {
      sql += ` AND d.cost_center_id = $${paramCount++}`;
      params.push(cost_center_id);
    }

    if (document_type) {
      sql += ` AND d.document_type = $${paramCount++}`;
      params.push(document_type);
    }

    if (status) {
      sql += ` AND d.status = $${paramCount++}`;
      params.push(status);
    }

    sql += ' ORDER BY d.created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get safety documents error:', error);
    res.status(500).json({ error: 'Failed to fetch safety documents' });
  }
});

// Get single safety document
router.get('/:id', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT d.*,
        u1.name as created_by_name,
        u2.name as approved_by_name,
        p.code as project_code,
        p.name as project_name,
        c.name as client_name,
        cc.code as cost_center_code,
        cc.name as cost_center_name
      FROM safety_documents d
      LEFT JOIN users u1 ON d.created_by = u1.id
      LEFT JOIN users u2 ON d.approved_by = u2.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN cost_centers cc ON d.cost_center_id = cc.id
      WHERE d.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Safety document not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get safety document error:', error);
    res.status(500).json({ error: 'Failed to fetch safety document' });
  }
});

// Create safety document
router.post(
  '/',
  authenticate,
  requirePermission('can_edit_projects'),
  [
    body('project_id').notEmpty().withMessage('Project ID is required'),
    body('document_type').isIn(['jsa', 'electrical_compliance', 'electrical_safety_certificate']).withMessage('Invalid document type'),
    body('title').notEmpty().withMessage('Title is required'),
    body('data').isObject().withMessage('Data must be an object'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { project_id, cost_center_id, document_type, title, data, status } = req.body;

      const result = await query(
        `INSERT INTO safety_documents (
          project_id, cost_center_id, document_type, title, data, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          project_id,
          cost_center_id || null,
          document_type,
          title,
          JSON.stringify(data),
          status || 'draft',
          req.user!.id
        ]
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'safety_document', result.rows[0].id, JSON.stringify({ document_type, title })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create safety document error:', error);
      res.status(500).json({ error: 'Failed to create safety document' });
    }
  }
);

// Update safety document
router.put(
  '/:id',
  authenticate,
  requirePermission('can_edit_projects'),
  [
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('data').optional().isObject().withMessage('Data must be an object'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, data, status } = req.body;

      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramCount++}`);
        params.push(title);
      }

      if (data !== undefined) {
        updates.push(`data = $${paramCount++}`);
        params.push(JSON.stringify(data));
      }

      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        params.push(status);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(req.params.id);

      const result = await query(
        `UPDATE safety_documents
         SET ${updates.join(', ')}
         WHERE id = $${paramCount}
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Safety document not found' });
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'update', 'safety_document', req.params.id, JSON.stringify({ changes: Object.keys(req.body) })]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update safety document error:', error);
      res.status(500).json({ error: 'Failed to update safety document' });
    }
  }
);

// Delete safety document
router.delete('/:id', authenticate, requirePermission('can_edit_projects'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT file_path FROM safety_documents WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Safety document not found' });
    }

    const filePath = result.rows[0].file_path;

    // Delete from database first
    await query('DELETE FROM safety_documents WHERE id = $1', [req.params.id]);

    // Delete PDF file if it exists
    if (filePath) {
      const fullPath = path.join(__dirname, '../../', filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'delete', 'safety_document', req.params.id]
    );

    res.json({ message: 'Safety document deleted successfully' });
  } catch (error) {
    console.error('Delete safety document error:', error);
    res.status(500).json({ error: 'Failed to delete safety document' });
  }
});

// Generate PDF from safety document
router.post('/:id/generate-pdf', authenticate, requirePermission('can_edit_projects'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, project_id, document_type, title, data FROM safety_documents WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Safety document not found' });
    }

    const doc = result.rows[0];
    const projectId = doc.project_id;

    // Parse JSON data
    const documentData = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;

    // Create output path: uploads/projects/{project_id}/safety-documents/{document_id}.pdf
    const outputDir = path.join(__dirname, '../../uploads/projects', projectId, 'safety-documents');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${doc.id}.pdf`);
    const relativePath = path.relative(path.join(__dirname, '../../'), outputPath).replace(/\\/g, '/');

    // Generate PDF
    await generateDocumentPDF(doc.document_type, documentData, outputPath);

    // Update document with file path
    await query(
      'UPDATE safety_documents SET file_path = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [relativePath, doc.id]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'generate_pdf', 'safety_document', doc.id, JSON.stringify({ document_type: doc.document_type })]
    );

    res.json({ message: 'PDF generated successfully', file_path: relativePath });
  } catch (error: any) {
    console.error('Generate PDF error:', error);
    const errorMessage = error?.message || 'Failed to generate PDF';
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Download generated PDF
router.get('/:id/pdf', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT file_path, title, document_type FROM safety_documents WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Safety document not found' });
    }

    const doc = result.rows[0];

    if (!doc.file_path) {
      return res.status(404).json({ error: 'PDF not generated yet. Please generate PDF first.' });
    }

    const filePath = path.join(__dirname, '../../', doc.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF file not found on disk' });
    }

    const fileName = `${doc.title || doc.document_type}_${req.params.id}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Download PDF error:', error);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
});

export default router;

