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
import { StorageFactory } from '../lib/storage/StorageFactory';
import { generatePartitionedPath, resolveStoragePath } from '../lib/storage/pathUtils';
import { createReadStream } from 'fs';
import path from 'path';
import fs from 'fs';
import { bufferToStream } from '../middleware/upload';
import { Readable } from 'stream';

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

  // Get storage provider
  const storage = await StorageFactory.getInstance();
  
  // Extract storage path from file_path
  // file_path could be: /uploads/projects/... (local) or https://... (S3 signed URL)
  let storagePath: string;
  let useOldPath = false;
  
  if (file.file_path.startsWith('http://') || file.file_path.startsWith('https://')) {
    // S3 signed URL - redirect directly
    return res.redirect(file.file_path);
  } else {
    // Local path - extract relative path
    storagePath = resolveStoragePath(file.file_path);
  }
  
  // Check if file exists in storage (new path)
  let exists = await storage.exists(storagePath);
  
  // Hybrid support: If not found in new storage, try old filesystem path
  if (!exists) {
    // Try old path format: /uploads/projects/{project_id}/files/{filename}
    const oldPath = file.file_path.startsWith('/') 
      ? file.file_path.substring(1) // Remove leading slash
      : file.file_path;
    
    // Check if old path exists in filesystem (only for local storage)
    if (storage.getDriver() === 'local') {
      const absoluteOldPath = path.join(process.cwd(), oldPath);
      if (fs.existsSync(absoluteOldPath)) {
        // File exists in old location - use it for now
        storagePath = oldPath;
        exists = true;
        useOldPath = true;
        log.info('File found in old location, serving from old path', { fileId: file.id, oldPath });
      }
    }
  }
  
  if (!exists) {
    throw new NotFoundError('File', 'in storage');
  }
  
  // Get file stream from storage
  const fileStream = useOldPath && storage.getDriver() === 'local'
    ? fs.createReadStream(path.join(process.cwd(), storagePath))
    : await storage.getStream(storagePath);
  
  const metadata = useOldPath && storage.getDriver() === 'local'
    ? { mimeType: file.mime_type, name: file.file_name, size: 0 }
    : await storage.getMetadata(storagePath);
  
  // Set headers
  res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
  res.setHeader('Content-Type', metadata.mimeType || file.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  // Stream file to response
  fileStream.pipe(res);
}));

// Upload file with validation and content checking
router.post(
  '/',
  authenticate,
  requirePermission('can_edit_projects'),
  fileUpload.single('file'), // Multer must run first to parse FormData into req.body
  validateProjectAccess, // Then validate project_id from parsed body
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    // Extract project_id from body (FormData fields are parsed by multer)
    const project_id = req.body?.project_id || req.body?.projectId;
    const cost_center_id = req.body?.cost_center_id || req.body?.costCenterId;

    if (!project_id) {
      log.error('File upload failed: project_id missing', { body: req.body, hasFile: !!req.file });
      throw new ValidationError('project_id is required');
    }

    // Validate file extension matches MIME type (before uploading to storage)
    if (!validateFileExtension(req.file.originalname, req.file.mimetype)) {
      throw new FileError('File extension does not match declared file type');
    }

    // Validate file content (magic number validation) - using buffer
    const isValidContent = await validateFileContent(req.file.buffer, req.file.mimetype, true);
    if (!isValidContent) {
      throw new FileError('File content does not match declared file type. The file may be corrupted or malicious.');
    }

    // Get storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageInitError: any) {
      log.error('Failed to initialize storage provider', storageInitError, { project_id });
      throw new ValidationError(`Failed to initialize storage: ${storageInitError.message || 'Unknown error'}`);
    }

    const { sanitizeProjectId } = await import('../middleware/validateProject');
    const projectId = sanitizeProjectId(project_id);
    
    // Generate partitioned path for storage
    const basePath = `projects/${projectId}/files${cost_center_id ? `/${cost_center_id}` : ''}`;
    const storagePath = generatePartitionedPath(req.file.originalname, basePath);
    
    // Stream file from memory buffer to storage provider
    try {
      const fileStream = bufferToStream(req.file.buffer);
      await storage.put(storagePath, fileStream, {
        contentType: req.file.mimetype,
      });
    } catch (storageError: any) {
      log.error('Failed to upload file to storage', storageError, { 
        project_id, 
        storagePath,
        storageDriver: storage?.getDriver(),
        errorMessage: storageError.message,
        errorStack: storageError.stack
      });
      const errorMessage = storageError.message || 'Unknown storage error';
      throw new ValidationError(`Failed to save file to storage: ${errorMessage}`);
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

    // Generate file URL for database storage
    // Use storage provider to get the URL (will be signed URL for S3, regular path for local)
    const fileUrl = await storage.url(storagePath);
    
    const result = await query(
      `INSERT INTO project_files (
        project_id, cost_center_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        project_id,
        cost_center_id || null,
        req.file.originalname,
        fileUrl, // Storage provider URL (signed for S3, /uploads/... for local)
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
        // For OCR, we need to get the file from storage
        // For now, use the storage path - OCR service will need to be updated to use storage provider
        processDocumentOCR(scanResult.rows[0].id, storagePath).catch(error => {
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

  // Get storage provider
  const storage = await StorageFactory.getInstance();
  
  // Extract storage path from file_path
  let storagePath: string | undefined;
  if (file.file_path.startsWith('http://') || file.file_path.startsWith('https://')) {
    // S3 signed URL - extract key from URL or use file_path as-is for deletion
    // For S3, we need the key, not the URL. Store key separately or extract from URL
    // For now, if it's a URL, we can't delete it (would need to store S3 key separately)
    log.warn('Cannot delete file with S3 URL - key not stored', { fileId: req.params.id, filePath: file.file_path });
    storagePath = undefined;
  } else {
    // Local path - extract relative path
    storagePath = resolveStoragePath(file.file_path);
  }
  
  // Delete from database first
  await query('DELETE FROM project_files WHERE id = $1', [req.params.id]);

  // Delete file from storage (if we have a valid path)
  if (storagePath && !storagePath.startsWith('http')) {
    try {
      await storage.delete(storagePath);
    } catch (deleteError: any) {
      log.error('Failed to delete file from storage', deleteError, {
        fileId: req.params.id,
        storagePath,
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
                     (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));

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
                     (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));

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
  try {
    const storage = await StorageFactory.getInstance();
    const basePath = 'logos';
    
    // List all files in the logos directory
    const files = await storage.list(basePath);
    
    // Filter to only files (not directories) and map to response format
    // Use storage.url() to get proper URLs (signed URLs for S3, /uploads/... for local)
    const logos = await Promise.all(
      files
        .filter((file) => !file.isDirectory)
        .map(async (file) => {
          // Get proper URL from storage provider
          // For S3, this will be a signed URL; for local, it will be /uploads/...
          const url = await storage.url(file.path);
          return {
            url,
            filename: file.name,
            upload_date: file.lastModified || new Date(),
            file_size: file.size || 0
          };
        })
    );
    
    // Sort by upload date (newest first)
    logos.sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());

    res.json(logos);
  } catch (error: any) {
    log.error('Failed to list logos', error);
    // Return empty array on error
    res.json([]);
  }
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
