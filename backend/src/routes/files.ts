import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { fileUpload } from '../middleware/upload';
import { validateProjectAccess } from '../middleware/validateProject';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError, ValidationError, FileError, ForbiddenError } from '../lib/errors';
import { log } from '../lib/logger';
import { validateFileContent, validateFileExtension } from '../lib/fileValidator';
import { ocrService } from '../lib/ocrService';
import { findMatches } from '../lib/documentMatcher';
import path from 'path';
import fs from 'fs';

const router = Router();

// Get all files with filters
router.get('/', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// Get single file metadata
router.get('/:id', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
    throw new NotFoundError('File', req.params.id);
  }

  res.json(result.rows[0]);
}));

// Download file with access control
router.get('/:id/download', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT f.*, p.id as project_id, p.client_id
     FROM project_files f
     LEFT JOIN projects p ON f.project_id = p.id
     WHERE f.id = $1`,
    [req.params.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('File', req.params.id);
  }

  const file = result.rows[0];

  // Verify user has access to the project
  if (file.project_id) {
    // Admins and managers can access all files
    if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
      // Check if user has access to this project
      const accessResult = await query(
        'SELECT 1 FROM timesheets WHERE project_id = $1 AND user_id = $2 LIMIT 1',
        [file.project_id, req.user!.id]
      );

      if (accessResult.rows.length === 0) {
        throw new ForbiddenError('You do not have access to this file');
      }
    }
  }

  // Sanitize file path to prevent directory traversal
  const baseDir = path.resolve(__dirname, '../../uploads');
  const filePath = path.resolve(path.join(__dirname, '../../', file.file_path));

  // Ensure file is within the uploads directory
  if (!filePath.startsWith(baseDir)) {
    log.error('Path traversal attempt detected', null, {
      userId: req.user!.id,
      fileId: req.params.id,
      filePath: file.file_path,
      requestedPath: filePath,
    });
    throw new FileError('Invalid file path');
  }

  if (!fs.existsSync(filePath)) {
    throw new NotFoundError('File', 'on disk');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
  if (file.mime_type) {
    res.setHeader('Content-Type', file.mime_type);
  }
  res.sendFile(filePath);
}));

// Upload file with validation and content checking
router.post(
  '/',
  authenticate,
  requirePermission('can_edit_projects'),
  validateProjectAccess,
  fileUpload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { project_id, cost_center_id } = req.body;

    if (!project_id) {
      // Delete uploaded file if validation fails
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          log.error('Failed to delete uploaded file after validation failure', unlinkError);
        }
      }
      throw new ValidationError('project_id is required');
    }

    // Validate file extension matches MIME type
    if (!validateFileExtension(req.file.originalname, req.file.mimetype)) {
      // Delete uploaded file
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          log.error('Failed to delete uploaded file after extension validation failure', unlinkError);
        }
      }
      throw new FileError('File extension does not match declared file type');
    }

    // Validate file content (magic number validation)
    const isValidContent = await validateFileContent(req.file.path, req.file.mimetype);
    if (!isValidContent) {
      // Delete uploaded file
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          log.error('Failed to delete uploaded file after content validation failure', unlinkError);
        }
      }
      throw new FileError('File content does not match declared file type. The file may be corrupted or malicious.');
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

    // Generate proper relative file path for storage
    // req.file.path is absolute, we need relative from uploads root
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const relativePath = path.relative(uploadsRoot, req.file.path).replace(/\\/g, '/'); // Normalize to forward slashes
    
    const result = await query(
      `INSERT INTO project_files (
        project_id, cost_center_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        project_id,
        cost_center_id || null,
        req.file.originalname,
        `/uploads/${relativePath}`, // Ensure it starts with /uploads
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

    // Check if user wants OCR processing (optional parameter)
    const processOCR = req.body.process_ocr === 'true' || req.body.process_ocr === true;
    
    if (processOCR && req.file.mimetype.startsWith('image/')) {
      // Create document_scan record and process in background
      try {
        const scanResult = await query(
          `INSERT INTO document_scans (file_id, user_id, status)
           VALUES ($1, $2, 'pending')
           RETURNING id`,
          [result.rows[0].id, req.user!.id]
        );

        // Process OCR in background
        processDocumentOCR(scanResult.rows[0].id, req.file.path).catch(error => {
          log.error('Background OCR processing failed', error, { fileId: result.rows[0].id });
        });
      } catch (ocrError) {
        // Don't fail file upload if OCR setup fails
        log.error('Failed to initiate OCR processing', ocrError);
      }
    }

    res.status(201).json(result.rows[0]);
  })
);

// Delete file
router.delete('/:id', authenticate, requirePermission('can_edit_projects'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT f.*, p.id as project_id
     FROM project_files f
     LEFT JOIN projects p ON f.project_id = p.id
     WHERE f.id = $1`,
    [req.params.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('File', req.params.id);
  }

  const file = result.rows[0];

  // Verify user has access to delete this file (must have access to the project)
  if (file.project_id) {
    if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
      const accessResult = await query(
        'SELECT 1 FROM timesheets WHERE project_id = $1 AND user_id = $2 LIMIT 1',
        [file.project_id, req.user!.id]
      );

      if (accessResult.rows.length === 0) {
        throw new ForbiddenError('You do not have permission to delete this file');
      }
    }
  }

  // Sanitize file path
  const baseDir = path.resolve(__dirname, '../../uploads');
  const filePath = path.resolve(path.join(__dirname, '../../', file.file_path));

  if (!filePath.startsWith(baseDir)) {
    log.error('Path traversal attempt detected in file delete', null, {
      userId: req.user!.id,
      fileId: req.params.id,
      filePath: file.file_path,
    });
    throw new FileError('Invalid file path');
  }

  // Delete from database first
  await query('DELETE FROM project_files WHERE id = $1', [req.params.id]);

  // Delete file from disk
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      log.error('Failed to delete file from disk', unlinkError, {
        fileId: req.params.id,
        filePath,
      });
      // Continue even if file deletion fails - it's already removed from DB
    }
  }

  // Log activity
  await query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
     VALUES ($1, $2, $3, $4)`,
    [req.user!.id, 'delete', 'file', req.params.id]
  );

  res.json({ message: 'File deleted successfully' });
}));

// Get files for a project
router.get('/projects/:projectId', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// Get files for a cost center
router.get('/cost-centers/:costCenterId', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// Get timesheet images for a specific project
router.get('/timesheet-images/:projectId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// Get all timesheet images across all projects (summary)
router.get('/timesheet-images', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// Get all logo files
router.get('/logos', authenticate, requirePermission('can_manage_settings'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
    log.error('Failed to read logos directory', readError);
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
        log.error(`Failed to get stats for ${filename}`, statError);
        return null;
      }
    })
  );

  // Filter out null values and sort by upload date (newest first)
  const validLogos = logos.filter((logo): logo is NonNullable<typeof logo> => logo !== null);
  validLogos.sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());

  res.json(validLogos);
}));

// Delete a logo file
router.delete('/logos/:filename', authenticate, requirePermission('can_manage_settings'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const filename = req.params.filename;
  // Sanitize filename to prevent directory traversal
  const safeFilename = path.basename(filename);
  const baseDir = path.resolve(__dirname, '../../uploads/logos');
  const filePath = path.resolve(path.join(baseDir, safeFilename));

  // Ensure file is within the logos directory
  if (!filePath.startsWith(baseDir)) {
    log.error('Path traversal attempt detected in logo delete', null, {
      userId: req.user!.id,
      filename,
    });
    throw new FileError('Invalid file path');
  }

  if (!fs.existsSync(filePath)) {
    throw new NotFoundError('Logo file', filename);
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
}));

/**
 * Process document OCR in background
 */
async function processDocumentOCR(scanId: string, filePath: string) {
  try {
    // Update status to processing
    await query(
      'UPDATE document_scans SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['processing', scanId]
    );

    // Check OCR service availability
    const isAvailable = await ocrService.healthCheck();
    if (!isAvailable) {
      throw new Error('OCR service is not available');
    }

    // Process image through OCR
    const ocrResult = await ocrService.processImage(filePath);

    if (!ocrResult.success) {
      await query(
        `UPDATE document_scans 
         SET status = 'failed', 
             error_message = $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [ocrResult.error || 'OCR processing failed', scanId]
      );
      return;
    }

    // Store extracted data
    await query(
      `UPDATE document_scans 
       SET status = 'completed',
           document_type = $1,
           extracted_data = $2,
           confidence = $3,
           processed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [
        ocrResult.document_type,
        JSON.stringify(ocrResult.extracted_data),
        ocrResult.confidence,
        scanId
      ]
    );

    // Find matches
    const matches = await findMatches(
      scanId,
      ocrResult.extracted_data,
      ocrResult.document_type
    );

    // Store matches
    for (const match of matches) {
      await query(
        `INSERT INTO document_matches (
          scan_id, entity_type, entity_id, confidence_score, match_reasons
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          scanId,
          match.entity_type,
          match.entity_id,
          match.confidence_score,
          JSON.stringify(match.match_reasons)
        ]
      );
    }

    log.info('Document OCR completed', { scanId, matchesFound: matches.length });
  } catch (error: any) {
    log.error('Document OCR processing error', error, { scanId });
    await query(
      `UPDATE document_scans 
       SET status = 'failed', 
           error_message = $1, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [error.message || 'Processing failed', scanId]
    );
  }
}

export default router;
