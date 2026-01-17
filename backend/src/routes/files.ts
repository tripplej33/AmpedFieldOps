import { Router, Response } from 'express';
import { supabase as supabaseClient } from '../db/supabase';
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
const supabase = supabaseClient!;

// Helpers to encode/decode storage paths as opaque IDs for API compatibility
function encodeId(storagePath: string): string {
  const b64 = Buffer.from(storagePath).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeId(id: string): string {
  const pad = id.length % 4 === 0 ? '' : '='.repeat(4 - (id.length % 4));
  const b64 = id.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function parseProjectPath(storagePath: string): { project_id?: string; cost_center_id?: string } {
  const m = storagePath.match(/^projects\/([^/]+)\/files(?:\/([^/]+))?\//);
  if (!m) return {};
  return { project_id: m[1], cost_center_id: m[2] };
}

// Get all files with filters
router.get('/', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { project_id, cost_center_id } = req.query as Record<string, string>;

  try {
    const storage = await StorageFactory.getInstance();

    // If a project_id is provided, list files under that project's folder
    if (project_id) {
      const basePath = `projects/${project_id}/files${cost_center_id ? `/${cost_center_id}` : ''}`;
      const entries = await storage.list(basePath);

      const files = await Promise.all(
        entries
          .filter((e) => !e.isDirectory)
          .map(async (e) => ({
            id: encodeId(e.path),
            file_name: e.name,
            file_path: e.path,
            file_type: 'document',
            file_size: e.size || 0,
            mime_type: e.mimeType || 'application/octet-stream',
            uploaded_by_name: null,
            project_id,
            cost_center_id: cost_center_id || null,
            project_name: null,
            client_name: null,
            cost_center_code: null,
            cost_center_name: null,
            url: await storage.url(e.path),
            created_at: (e.lastModified || new Date()).toISOString(),
            updated_at: (e.lastModified || new Date()).toISOString(),
          }))
      );

      return res.json(files);
    }

    // Without project_id, return empty list (no DB table for global file index)
    return res.json([]);
  } catch (error: any) {
    log.error('Failed to list files', error);
    return res.json([]);
  }
}));

// Get all logo files (must be before /:id route)
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

// Get all timesheet images across all projects (summary) - must be before /:id route
router.get('/timesheet-images', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  // Check if user can view all timesheets
  const canViewAll = req.user!.role === 'admin' || 
                     req.user!.role === 'manager' || 
                     (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));

  // Use Supabase to aggregate images from timesheets
  const { data: timesheets, error } = await supabase
    .from('timesheets')
    .select('project_id, image_urls, user_id')
    .neq('image_urls', null);

  if (error) {
    log.error('Failed to load timesheet images summary', error);
    return res.json([]);
  }

  const filtered = (timesheets || []).filter(t => canViewAll || t.user_id === req.user!.id);
  const summaryMap = new Map<string, { project_id: string; timesheets_with_images: number; total_images: number }>();
  for (const t of filtered) {
    const key = String(t.project_id);
    const entry = summaryMap.get(key) || { project_id: key, timesheets_with_images: 0, total_images: 0 };
    entry.timesheets_with_images += 1;
    entry.total_images += Array.isArray((t as any).image_urls) ? (t as any).image_urls.length : 0;
    summaryMap.set(key, entry);
  }
  res.json(Array.from(summaryMap.values()));
}));

// Get timesheet images for a specific project - must be before /:id route
router.get('/timesheet-images/:projectId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  // Check if user can view all timesheets
  const canViewAll = req.user!.role === 'admin' || 
                     req.user!.role === 'manager' || 
                     (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));

  const { data: rows, error } = await supabase
    .from('timesheets')
    .select('id, user_id, date, image_urls, created_at')
    .eq('project_id', req.params.projectId)
    .neq('image_urls', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to load project timesheet images', error);
    return res.json([]);
  }

  const images: any[] = [];
  (rows || []).forEach((row: any) => {
    if (row.image_urls && Array.isArray(row.image_urls)) {
      row.image_urls.forEach((url: string, index: number) => {
        const filename = url.split('/').pop() || '';
        images.push({
          url,
          filename,
          timesheet_id: row.id,
          timesheet_date: row.date,
          upload_date: row.created_at,
          user_name: null,
          project_code: null,
          project_name: null,
          image_index: index
        });
      });
    }
  });

  res.json(images);
}));

// Get single file metadata (must be after specific routes)
router.get('/:id', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const storage = await StorageFactory.getInstance();
  const storagePath = decodeId(req.params.id);
  const exists = await storage.exists(storagePath);
  if (!exists) {
    throw new NotFoundError('File', req.params.id);
  }
  const meta = await storage.getMetadata(storagePath);
  const url = await storage.url(storagePath);
  const { project_id, cost_center_id } = parseProjectPath(storagePath);
  return res.json({
    id: req.params.id,
    project_id: project_id || null,
    cost_center_id: cost_center_id || null,
    file_name: meta.name || storagePath.split('/').pop(),
    file_path: storagePath,
    file_type: (meta.mimeType || 'application/octet-stream').startsWith('image/') ? 'image' : (meta.mimeType === 'application/pdf' ? 'pdf' : 'document'),
    file_size: meta.size || 0,
    mime_type: meta.mimeType || 'application/octet-stream',
    uploaded_by: null,
    uploaded_by_name: null,
    project_code: null,
    project_name: null,
    client_name: null,
    cost_center_code: null,
    cost_center_name: null,
    created_at: (meta.lastModified || new Date()).toISOString(),
    updated_at: (meta.lastModified || new Date()).toISOString(),
    url,
  });
}));

// Download file with access control
router.get('/:id/download', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const storage = await StorageFactory.getInstance();
  const storagePath = decodeId(req.params.id);
  const { project_id } = parseProjectPath(storagePath);
  // Access control: allow admins/managers; otherwise require project context
  if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
    if (!project_id) {
      throw new ForbiddenError('You do not have access to this file');
    }
  }
  const exists = await storage.exists(storagePath);
  if (!exists) throw new NotFoundError('File', req.params.id);
  const meta = await storage.getMetadata(storagePath);
  res.setHeader('Content-Disposition', `attachment; filename="${meta.name || 'file'}"`);
  res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const fileStream = await storage.getStream(storagePath);
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
    
    // Check if user wants OCR processing (optional parameter)
    const processOCR = req.body.process_ocr === 'true' || req.body.process_ocr === true;
    
    if (processOCR && req.file.mimetype.startsWith('image/')) {
      // Trigger OCR processing asynchronously without DB dependency
      ocrService.processImage(storagePath).catch(err => log.error('OCR processing failed', err));
    }
    const meta = await storage.getMetadata(storagePath);
    const id = encodeId(storagePath);
    res.status(201).json({
      id,
      project_id: projectId,
      cost_center_id: cost_center_id || null,
      file_name: req.file.originalname,
      file_path: storagePath,
      file_type: fileType,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      uploaded_by: req.user!.id,
      uploaded_by_name: req.user!.name || null,
      project_code: null,
      project_name: null,
      client_name: null,
      cost_center_code: null,
      cost_center_name: null,
      created_at: (meta.lastModified || new Date()).toISOString(),
      updated_at: (meta.lastModified || new Date()).toISOString(),
      url: await storage.url(storagePath),
    });
  })
);

// Delete file
router.delete('/:id', authenticate, requirePermission('can_edit_projects'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const storage = await StorageFactory.getInstance();
  const storagePath = decodeId(req.params.id);
  const exists = await storage.exists(storagePath);
  if (!exists) throw new NotFoundError('File', req.params.id);
  // Admin/manager can delete; others blocked for now until ACLs are defined
  if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
    throw new ForbiddenError('You do not have permission to delete this file');
  }
  try {
    await storage.delete(storagePath);
  } catch (err: any) {
    log.error('Failed to delete file from storage', err, { storagePath });
    throw new FileError('Failed to delete file from storage');
  }
  res.json({ message: 'File deleted successfully' });
}));

// Get files for a project
router.get('/projects/:projectId', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const storage = await StorageFactory.getInstance();
  const basePath = `projects/${req.params.projectId}/files`;
  const entries = await storage.list(basePath);
  const files: any[] = [];
  // List direct files
  for (const e of entries.filter(e => !e.isDirectory)) {
    files.push({
      id: encodeId(e.path),
      project_id: req.params.projectId,
      cost_center_id: null,
      file_name: e.name,
      file_path: e.path,
      file_type: 'document',
      file_size: e.size || 0,
      mime_type: e.mimeType || 'application/octet-stream',
      uploaded_by_name: null,
      project_name: null,
      client_name: null,
      cost_center_code: null,
      cost_center_name: null,
      url: await storage.url(e.path),
      created_at: (e.lastModified || new Date()).toISOString(),
      updated_at: (e.lastModified || new Date()).toISOString(),
    });
  }
  // List nested cost center directories
  for (const dir of entries.filter(e => e.isDirectory)) {
    const nested = await storage.list(`${basePath}/${dir.name}`);
    for (const e of nested.filter(n => !n.isDirectory)) {
      files.push({
        id: encodeId(e.path),
        project_id: req.params.projectId,
        cost_center_id: dir.name,
        file_name: e.name,
        file_path: e.path,
        file_type: 'document',
        file_size: e.size || 0,
        mime_type: e.mimeType || 'application/octet-stream',
        uploaded_by_name: null,
        project_name: null,
        client_name: null,
        cost_center_code: null,
        cost_center_name: null,
        url: await storage.url(e.path),
        created_at: (e.lastModified || new Date()).toISOString(),
        updated_at: (e.lastModified || new Date()).toISOString(),
      });
    }
  }
  res.json(files);
}));

// Get files for a cost center
router.get('/cost-centers/:costCenterId', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const storage = await StorageFactory.getInstance();
  // Without project context, we cannot reliably list cost-center files; return empty
  res.json([]);
}));

// Get timesheet images for a specific project
// (Removed duplicate route: handled earlier with Supabase)

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
