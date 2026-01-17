import { Router, Response } from 'express';
import { supabase as supabaseClient } from '../db/supabase';
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
import { query } from '../db';

const router = Router();
const supabase = supabaseClient!;

/**
 * Upload and process document
 */
// Support both POST / and POST /upload for frontend compatibility
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

    const project_id = req.body?.project_id || req.body?.projectId;
    const cost_center_id = req.body?.cost_center_id || req.body?.costCenterId;
    if (!project_id || (typeof project_id === 'string' && project_id.trim() === '')) {
      log.error('Document scan upload failed: project_id missing or empty', {
        body: req.body,
        hasFile: !!req.file,
      });
      throw new ValidationError('project_id is required and cannot be empty');
    }

    // Save to storage
    const storage = await StorageFactory.getInstance();
    const { sanitizeProjectId } = await import('../middleware/validateProject');
    const projectId = sanitizeProjectId(project_id);
    const basePath = `projects/${projectId}/files/document-scans${cost_center_id ? `/${cost_center_id}` : ''}`;
    const storagePath = generatePartitionedPath(req.file.originalname, basePath);
    const fileStream = bufferToStream(req.file.buffer);
    await storage.put(storagePath, fileStream, { contentType: req.file.mimetype });
    const fileUrl = await storage.url(storagePath);

    // Determine file type
    let fileType: 'image' | 'pdf' | 'document' = 'document';
    if (req.file.mimetype.startsWith('image/')) fileType = 'image';
    else if (req.file.mimetype === 'application/pdf') fileType = 'pdf';

    // OCR processing
    try {
      const ocrResult: OCRResult = await ocrService.processImage(storagePath);
      return res.status(201).json({
        file: {
          project_id: projectId,
          cost_center_id: cost_center_id || null,
          file_name: req.file.originalname,
          file_url: fileUrl,
          file_type: fileType,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
        },
        ocr: ocrResult,
      });
    } catch (ocrError: any) {
      log.error('OCR processing failed', ocrError, { project_id: projectId, storagePath });
      return res.status(500).json({ error: 'OCR processing failed', details: ocrError.message });
    }

  })
);

// Keep legacy '/upload' path working by delegating to root handler
router.post('/upload', authenticate, requirePermission('can_edit_projects'), validateProjectAccess, fileUpload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  req.url = '/';
  return (router as any).handle(req, res);
}));

// Middleware: Disable remaining document-scan endpoints (GET/PUT/DELETE)
// POST endpoints above for upload/OCR are functional
router.use((req, res) => {
  return res.status(501).json({
    error: 'Document scan history not implemented',
    message: 'Document OCR upload is available via POST /api/document-scan. Historical scan data and matching features are not yet implemented in Supabase.',
    status: 'not_implemented'
  });
});

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
  processDocumentScan(scanId, storagePath).catch((error: any) => {
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

// Minimal stub to satisfy compilation; legacy scan processing relies on non-existent tables.
async function processDocumentScan(scanId: string, storagePath: string): Promise<void> {
  const isAvailable = await ocrService.healthCheck();
  if (!isAvailable) {
    throw new Error('OCR service is not available');
  }
  await ocrService.processImage(storagePath);
}

export default router;
