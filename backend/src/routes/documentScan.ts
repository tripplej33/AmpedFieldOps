import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { fileUpload } from '../middleware/upload';
import { validateProjectAccess } from '../middleware/validateProject';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError, ValidationError, FileError } from '../lib/errors';
import { log } from '../lib/logger';
import { ocrService, OCRResult } from '../lib/ocrService';
import { findMatches } from '../lib/documentMatcher';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { generatePartitionedPath, resolveStoragePath } from '../lib/storage/pathUtils';
import { bufferToStream } from '../middleware/upload';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * Upload and process document
 */
router.post(
  '/upload',
  authenticate,
  requirePermission('can_edit_projects'),
  validateProjectAccess,
  fileUpload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    // Extract project_id from body (FormData fields are parsed by multer)
    const project_id = req.body?.project_id || req.body?.projectId;
    const cost_center_id = req.body?.cost_center_id || req.body?.costCenterId;

    // Validate project_id - check for empty string, null, or undefined
    if (!project_id || (typeof project_id === 'string' && project_id.trim() === '')) {
      log.error('Document scan upload failed: project_id missing or empty', { 
        body: req.body, 
        hasFile: !!req.file,
        project_id: project_id,
        projectId: req.body?.projectId
      });
      throw new ValidationError('project_id is required and cannot be empty');
    }

    // Check if file is an image (validate before uploading)
    const isImage = req.file.mimetype.startsWith('image/');
    if (!isImage) {
      throw new FileError('Only image files can be processed for OCR');
    }

    // Get storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageInitError: any) {
      log.error('Failed to initialize storage provider for document scan', storageInitError, { project_id });
      throw new ValidationError(`Failed to initialize storage: ${storageInitError.message || 'Unknown error'}`);
    }

    const { sanitizeProjectId } = await import('../middleware/validateProject');
    let projectId: string;
    try {
      projectId = sanitizeProjectId(project_id);
    } catch (validationError: any) {
      log.error('Invalid project_id in document scan upload', validationError, { project_id });
      throw new ValidationError(validationError.message || 'Invalid project_id');
    }
    
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
        errorMessage: storageError.message,
        errorStack: storageError.stack
      });
      throw new ValidationError(`Failed to save file to storage: ${storageError.message}`);
    }

    // Determine file type from mime type
    let fileType = 'document';
    if (req.file.mimetype.startsWith('image/')) {
      fileType = 'image';
    }

    // Get file URL from storage provider
    const fileUrl = await storage.url(storagePath);
    
    // Store file in project_files table
    const fileResult = await query(
      `INSERT INTO project_files (
        project_id, cost_center_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        project_id,
        cost_center_id || null,
        req.file.originalname,
        fileUrl,
        fileType,
        req.file.size,
        req.file.mimetype,
        req.user!.id
      ]
    );

    const file = fileResult.rows[0];

    // Create document_scan record with pending status
    const scanResult = await query(
      `INSERT INTO document_scans (
        file_id, user_id, status
      ) VALUES ($1, $2, 'pending')
      RETURNING *`,
      [file.id, req.user!.id]
    );

    const scan = scanResult.rows[0];

    // Process OCR asynchronously (don't block response)
    // Pass storage path instead of local file path
    processDocumentScan(scan.id, storagePath).catch(error => {
      log.error('Background OCR processing failed', error, { scanId: scan.id });
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'scan_document', 'document_scan', scan.id, JSON.stringify({ file_name: req.file.originalname })]
    );

    res.status(201).json({
      scan: {
        id: scan.id,
        file_id: file.id,
        status: scan.status,
      },
      file: file,
    });
  })
);

/**
 * Process document scan in background
 */
async function processDocumentScan(scanId: string, filePath: string) {
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
    const ocrResult: OCRResult = await ocrService.processImage(filePath);

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

    log.info('Document scan completed', { scanId, matchesFound: matches.length });
  } catch (error: any) {
    log.error('Document scan processing error', error, { scanId });
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

/**
 * Get scan status and extracted data
 */
router.get('/:id', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT ds.*, 
      pf.file_name, pf.file_path, pf.mime_type,
      u.name as user_name
    FROM document_scans ds
    LEFT JOIN project_files pf ON ds.file_id = pf.id
    LEFT JOIN users u ON ds.user_id = u.id
    WHERE ds.id = $1`,
    [req.params.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Document scan', req.params.id);
  }

  res.json(result.rows[0]);
}));

/**
 * Get suggested matches for a scan
 */
router.get('/:id/matches', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const matches = await query(
    `SELECT dm.*,
      CASE 
        WHEN dm.entity_type = 'purchase_order' THEN (SELECT po_number FROM xero_purchase_orders WHERE id = dm.entity_id)
        WHEN dm.entity_type = 'invoice' THEN (SELECT invoice_number FROM xero_invoices WHERE id = dm.entity_id)
        WHEN dm.entity_type = 'bill' THEN (SELECT bill_number FROM xero_bills WHERE id = dm.entity_id)
        WHEN dm.entity_type = 'expense' THEN (SELECT description FROM xero_expenses WHERE id = dm.entity_id)
      END as entity_name,
      CASE 
        WHEN dm.entity_type = 'purchase_order' THEN (SELECT total_amount FROM xero_purchase_orders WHERE id = dm.entity_id)
        WHEN dm.entity_type = 'invoice' THEN (SELECT total FROM xero_invoices WHERE id = dm.entity_id)
        WHEN dm.entity_type = 'bill' THEN (SELECT amount FROM xero_bills WHERE id = dm.entity_id)
        WHEN dm.entity_type = 'expense' THEN (SELECT amount FROM xero_expenses WHERE id = dm.entity_id)
      END as entity_amount
    FROM document_matches dm
    WHERE dm.scan_id = $1 AND dm.confirmed = false
    ORDER BY dm.confidence_score DESC
    LIMIT 5`,
    [req.params.id]
  );

  res.json(matches.rows);
}));

/**
 * Confirm and link a match
 */
router.post('/:id/match/:matchId/confirm', authenticate, requirePermission('can_edit_projects'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: scanId, matchId } = req.params;

  // Get match details
  const matchResult = await query(
    'SELECT * FROM document_matches WHERE id = $1 AND scan_id = $2',
    [matchId, scanId]
  );

  if (matchResult.rows.length === 0) {
    throw new NotFoundError('Document match', matchId);
  }

  const match = matchResult.rows[0];

  // Update match as confirmed
  await query(
    `UPDATE document_matches 
     SET confirmed = true, 
         confirmed_by = $1, 
         confirmed_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [req.user!.id, matchId]
  );

  // Link document scan to entity
  const updateColumn = `${match.entity_type}_scanned_document_id`;
  const tableName = match.entity_type === 'purchase_order' ? 'xero_purchase_orders' :
                    match.entity_type === 'invoice' ? 'xero_invoices' :
                    match.entity_type === 'bill' ? 'xero_bills' :
                    'xero_expenses';

  // Use scanned_document_id column (we added this to all tables)
  await query(
    `UPDATE ${tableName} 
     SET scanned_document_id = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [scanId, match.entity_id]
  );

  // Update document_scan to link to entity
  await query(
    `UPDATE document_scans 
     SET updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1`,
    [scanId]
  );

  // Reject all other matches for this scan
  await query(
    `UPDATE document_matches 
     SET confirmed = false 
     WHERE scan_id = $1 AND id != $2`,
    [scanId, matchId]
  );

  // Log activity
  await query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      req.user!.id,
      'confirm_document_match',
      match.entity_type,
      match.entity_id,
      JSON.stringify({ scan_id: scanId, match_id: matchId })
    ]
  );

  res.json({
    success: true,
    message: 'Match confirmed and document linked',
    match: {
      ...match,
      confirmed: true,
      confirmed_by: req.user!.id,
      confirmed_at: new Date().toISOString(),
    }
  });
}));

/**
 * Reject all matches (manual linking)
 */
router.post('/:id/match/reject', authenticate, requirePermission('can_edit_projects'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: scanId } = req.params;

  // Mark all matches as rejected (we'll delete them or mark as rejected)
  await query(
    `DELETE FROM document_matches WHERE scan_id = $1 AND confirmed = false`,
    [scanId]
  );

  // Log activity
  await query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user!.id, 'reject_document_matches', 'document_scan', scanId, JSON.stringify({})]
  );

  res.json({
    success: true,
    message: 'All matches rejected. You can manually link the document.'
  });
}));

/**
 * List all scanned documents
 */
router.get('/', authenticate, requirePermission('can_view_financials'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { project_id, status, document_type } = req.query;

  let sql = `
    SELECT ds.*,
      pf.file_name, pf.file_path, pf.project_id,
      u.name as user_name,
      p.code as project_code, p.name as project_name
    FROM document_scans ds
    LEFT JOIN project_files pf ON ds.file_id = pf.id
    LEFT JOIN users u ON ds.user_id = u.id
    LEFT JOIN projects p ON pf.project_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (project_id) {
    sql += ` AND pf.project_id = $${paramCount++}`;
    params.push(project_id);
  }

  if (status) {
    sql += ` AND ds.status = $${paramCount++}`;
    params.push(status);
  }

  if (document_type) {
    sql += ` AND ds.document_type = $${paramCount++}`;
    params.push(document_type);
  }

  sql += ' ORDER BY ds.created_at DESC';

  const result = await query(sql, params);
  res.json(result.rows);
}));

/**
 * Retry failed scan
 */
router.post('/:id/retry', authenticate, requirePermission('can_edit_projects'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: scanId } = req.params;

  // Get scan and file info
  const scanResult = await query(
    `SELECT ds.*, pf.file_path 
     FROM document_scans ds
     LEFT JOIN project_files pf ON ds.file_id = pf.id
     WHERE ds.id = $1`,
    [scanId]
  );

  if (scanResult.rows.length === 0) {
    throw new NotFoundError('Document scan', scanId);
  }

  const scan = scanResult.rows[0];
  // Extract storage path from file_path (could be URL or path)
  let storagePath: string;
  if (scan.file_path.startsWith('http://') || scan.file_path.startsWith('https://')) {
    // For S3/Google Drive URLs, we need to extract the storage path
    // The URL format depends on the storage provider
    // For now, we'll use the file_path as-is and let the OCR service handle it
    storagePath = scan.file_path;
  } else {
    // Local path - extract relative path
    storagePath = scan.file_path.startsWith('/') 
      ? scan.file_path.substring(1) // Remove leading slash
      : scan.file_path;
  }

  // Reset scan status and clear previous matches
  await query(
    `UPDATE document_scans 
     SET status = 'pending', 
         error_message = NULL, 
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1`,
    [scanId]
  );

  await query('DELETE FROM document_matches WHERE scan_id = $1', [scanId]);

  // Process in background (pass storage path)
  processDocumentScan(scanId, storagePath).catch(error => {
    log.error('Retry OCR processing failed', error, { scanId });
  });

  res.json({
    success: true,
    message: 'Scan retry initiated',
    scan: {
      id: scanId,
      status: 'pending'
    }
  });
}));

export default router;
