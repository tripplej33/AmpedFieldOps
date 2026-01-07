#!/usr/bin/env tsx
/**
 * File Migration Script
 * 
 * Migrates existing files from old filesystem paths to the new storage abstraction layer.
 * This script is idempotent and can be run multiple times safely.
 * 
 * Usage:
 *   npm run migrate:files
 *   or
 *   tsx src/scripts/migrate-files-to-storage.ts
 */

import { query } from '../db';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { generatePartitionedPath, resolveStoragePath } from '../lib/storage/pathUtils';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { log } from '../lib/logger';

interface MigrationRecord {
  id: string;
  file_id?: string;
  entity_type: string;
  entity_id?: string;
  source_path: string;
  destination_path: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error_message?: string;
  file_size?: number;
  checksum?: string;
}

/**
 * Calculate SHA-256 checksum of a file
 */
async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Check if a file has already been migrated
 */
async function isAlreadyMigrated(
  entityType: string,
  entityId: string | undefined,
  sourcePath: string
): Promise<boolean> {
  const result = await query(
    `SELECT id FROM file_migrations 
     WHERE entity_type = $1 
     AND (entity_id = $2 OR ($2 IS NULL AND entity_id IS NULL))
     AND source_path = $3 
     AND status = 'completed'`,
    [entityType, entityId || null, sourcePath]
  );
  
  return result.rows.length > 0;
}

/**
 * Check if destination path already exists in storage
 */
async function destinationExists(destinationPath: string): Promise<boolean> {
  try {
    const storage = await StorageFactory.getInstance();
    return await storage.exists(destinationPath);
  } catch (error) {
    log.error('Error checking if destination exists', error);
    return false;
  }
}

/**
 * Create or update migration record
 */
async function createMigrationRecord(
  fileId: string | undefined,
  entityType: string,
  entityId: string | undefined,
  sourcePath: string,
  destinationPath: string,
  status: MigrationRecord['status'],
  fileSize?: number,
  checksum?: string,
  errorMessage?: string
): Promise<string> {
  // Check if migration record already exists
  const existing = await query(
    `SELECT id FROM file_migrations 
     WHERE entity_type = $1 
     AND (entity_id = $2 OR ($2 IS NULL AND entity_id IS NULL))
     AND source_path = $3`,
    [entityType, entityId || null, sourcePath]
  );

  if (existing.rows.length > 0) {
    // Update existing record
    await query(
      `UPDATE file_migrations 
       SET status = $1, 
           destination_path = $2,
           file_size = $3,
           checksum = $4,
           error_message = $5,
           updated_at = CURRENT_TIMESTAMP,
           migrated_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE migrated_at END
       WHERE id = $6`,
      [status, destinationPath, fileSize || null, checksum || null, errorMessage || null, existing.rows[0].id]
    );
    return existing.rows[0].id;
  } else {
    // Create new record
    const result = await query(
      `INSERT INTO file_migrations (
        file_id, entity_type, entity_id, source_path, destination_path, 
        status, file_size, checksum, error_message, migrated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $6 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
      RETURNING id`,
      [fileId || null, entityType, entityId || null, sourcePath, destinationPath, status, fileSize || null, checksum || null, errorMessage || null]
    );
    return result.rows[0].id;
  }
}

/**
 * Migrate a single file
 */
async function migrateFile(
  fileId: string | undefined,
  entityType: string,
  entityId: string | undefined,
  sourcePath: string,
  basePath: string,
  filename: string
): Promise<{ success: boolean; destinationPath?: string; error?: string }> {
  try {
    // Check if already migrated
    if (await isAlreadyMigrated(entityType, entityId, sourcePath)) {
      log.info(`File already migrated: ${sourcePath}`);
      return { success: true };
    }

    // Resolve absolute path if relative
    const absoluteSourcePath = sourcePath.startsWith('/') 
      ? sourcePath 
      : path.join(process.cwd(), 'uploads', sourcePath.replace(/^\/?uploads\//, ''));

    // Check if source file exists
    if (!fs.existsSync(absoluteSourcePath)) {
      const errorMsg = `Source file not found: ${absoluteSourcePath}`;
      log.warn(errorMsg);
      await createMigrationRecord(fileId, entityType, entityId, sourcePath, '', 'failed', undefined, undefined, errorMsg);
      return { success: false, error: errorMsg };
    }

    // Generate destination path
    const destinationPath = generatePartitionedPath(filename, basePath);

    // Check if destination already exists (from previous partial migration)
    if (await destinationExists(destinationPath)) {
      log.info(`Destination already exists, skipping copy: ${destinationPath}`);
      // Update database reference and mark as completed
      await updateDatabaseReference(entityType, entityId, fileId, sourcePath, destinationPath);
      await createMigrationRecord(fileId, entityType, entityId, sourcePath, destinationPath, 'completed');
      return { success: true, destinationPath };
    }

    // Get file stats
    const stats = fs.statSync(absoluteSourcePath);
    const fileSize = stats.size;

    // Calculate checksum
    log.info(`Calculating checksum for: ${absoluteSourcePath}`);
    const checksum = await calculateChecksum(absoluteSourcePath);

    // Create migration record as 'in_progress'
    await createMigrationRecord(fileId, entityType, entityId, sourcePath, destinationPath, 'in_progress', fileSize, checksum);

    // Get storage provider
    const storage = await StorageFactory.getInstance();

    // Copy file to storage
    log.info(`Migrating file: ${sourcePath} -> ${destinationPath}`);
    const fileStream = createReadStream(absoluteSourcePath);
    await storage.put(destinationPath, fileStream, {
      contentType: getContentType(filename),
    });

    // Update database reference
    await updateDatabaseReference(entityType, entityId, fileId, sourcePath, destinationPath);

    // Mark migration as completed
    await createMigrationRecord(fileId, entityType, entityId, sourcePath, destinationPath, 'completed', fileSize, checksum);

    log.info(`Successfully migrated: ${sourcePath} -> ${destinationPath}`);
    return { success: true, destinationPath };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    log.error(`Failed to migrate file: ${sourcePath}`, error);
    await createMigrationRecord(fileId, entityType, entityId, sourcePath, '', 'failed', undefined, undefined, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Get content type from filename
 */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Update database reference to point to new storage path
 */
async function updateDatabaseReference(
  entityType: string,
  entityId: string | undefined,
  fileId: string | undefined,
  oldPath: string,
  newPath: string
): Promise<void> {
  const storage = await StorageFactory.getInstance();
  const newUrl = await storage.url(newPath);

  switch (entityType) {
    case 'project_file':
      if (fileId) {
        await query(
          `UPDATE project_files SET file_path = $1 WHERE id = $2`,
          [newUrl, fileId]
        );
      }
      break;

    case 'timesheet_image':
      if (entityId) {
        // Update timesheet image_urls array
        const timesheet = await query(
          `SELECT image_urls FROM timesheets WHERE id = $1`,
          [entityId]
        );
        if (timesheet.rows.length > 0) {
          const imageUrls = timesheet.rows[0].image_urls || [];
          const updatedUrls = imageUrls.map((url: string) => 
            url === oldPath ? newUrl : url
          );
          await query(
            `UPDATE timesheets SET image_urls = $1 WHERE id = $2`,
            [updatedUrls, entityId]
          );
        }
      }
      break;

    case 'safety_document':
      if (entityId) {
        await query(
          `UPDATE safety_documents SET file_path = $1 WHERE id = $2`,
          [newUrl, entityId]
        );
      }
      break;

    case 'logo':
    case 'favicon':
      // Settings table - update the value JSON
      const settingKey = entityType === 'logo' ? 'company_logo' : 'company_favicon';
      const settings = await query(
        `SELECT id, value FROM settings WHERE key = $1 AND user_id IS NULL`,
        [settingKey]
      );
      for (const setting of settings.rows) {
        const value = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        if (value && (value.url === oldPath || value.path === oldPath)) {
          value.url = newUrl;
          value.path = newPath;
          await query(
            `UPDATE settings SET value = $1 WHERE id = $2`,
            [JSON.stringify(value), setting.id]
          );
        }
      }
      break;
  }
}

/**
 * Migrate project files
 */
async function migrateProjectFiles(): Promise<{ success: number; failed: number }> {
  log.info('Starting migration of project files...');
  const files = await query(
    `SELECT id, project_id, file_path, file_name 
     FROM project_files 
     WHERE file_path IS NOT NULL 
     AND file_path != ''
     AND NOT (file_path LIKE 'http://%' OR file_path LIKE 'https://%')`
  );

  let success = 0;
  let failed = 0;

  for (const file of files.rows) {
    const basePath = `projects/${file.project_id}/files`;
    const result = await migrateFile(
      file.id,
      'project_file',
      file.id,
      file.file_path,
      basePath,
      file.file_name
    );
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  log.info(`Project files migration complete: ${success} succeeded, ${failed} failed`);
  return { success, failed };
}

/**
 * Migrate timesheet images
 */
async function migrateTimesheetImages(): Promise<{ success: number; failed: number }> {
  log.info('Starting migration of timesheet images...');
  const timesheets = await query(
    `SELECT id, project_id, image_urls 
     FROM timesheets 
     WHERE image_urls IS NOT NULL 
     AND array_length(image_urls, 1) > 0`
  );

  let success = 0;
  let failed = 0;

  for (const timesheet of timesheets.rows) {
    const imageUrls = timesheet.image_urls || [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      // Skip HTTP URLs (already in cloud storage)
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        continue;
      }

      const basePath = `projects/${timesheet.project_id}/timesheets`;
      const filename = path.basename(imageUrl) || `image_${i}.jpg`;
      const result = await migrateFile(
        undefined,
        'timesheet_image',
        timesheet.id,
        imageUrl,
        basePath,
        filename
      );
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }
  }

  log.info(`Timesheet images migration complete: ${success} succeeded, ${failed} failed`);
  return { success, failed };
}

/**
 * Migrate safety documents
 */
async function migrateSafetyDocuments(): Promise<{ success: number; failed: number }> {
  log.info('Starting migration of safety documents...');
  const documents = await query(
    `SELECT id, project_id, file_path, title, document_type 
     FROM safety_documents 
     WHERE file_path IS NOT NULL 
     AND file_path != ''
     AND NOT (file_path LIKE 'http://%' OR file_path LIKE 'https://%')`
  );

  let success = 0;
  let failed = 0;

  for (const doc of documents.rows) {
    const basePath = `projects/${doc.project_id}/safety-documents`;
    const filename = path.basename(doc.file_path) || `${doc.document_type}_${doc.id}.pdf`;
    const result = await migrateFile(
      undefined,
      'safety_document',
      doc.id,
      doc.file_path,
      basePath,
      filename
    );
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  log.info(`Safety documents migration complete: ${success} succeeded, ${failed} failed`);
  return { success, failed };
}

/**
 * Migrate logo and favicon
 */
async function migrateLogosAndFavicons(): Promise<{ success: number; failed: number }> {
  log.info('Starting migration of logos and favicons...');
  const settings = await query(
    `SELECT key, value FROM settings 
     WHERE key IN ('company_logo', 'company_favicon') 
     AND user_id IS NULL`
  );

  let success = 0;
  let failed = 0;

  for (const setting of settings.rows) {
    try {
      const value = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      if (!value || (!value.url && !value.path)) {
        continue;
      }

      const filePath = value.path || value.url;
      // Skip HTTP URLs
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        continue;
      }

      const entityType = setting.key === 'company_logo' ? 'logo' : 'favicon';
      const basePath = 'settings';
      const filename = path.basename(filePath) || (entityType === 'logo' ? 'logo.png' : 'favicon.ico');
      
      const result = await migrateFile(
        undefined,
        entityType,
        undefined,
        filePath,
        basePath,
        filename
      );
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      log.error(`Failed to process ${setting.key}`, error);
      failed++;
    }
  }

  log.info(`Logos and favicons migration complete: ${success} succeeded, ${failed} failed`);
  return { success, failed };
}

/**
 * Main migration function
 */
async function migrateFiles(): Promise<void> {
  log.info('=== Starting File Migration ===');
  
  try {
    // Ensure file_migrations table exists
    const migrationTableCheck = await query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'file_migrations'
      )`
    );

    if (!migrationTableCheck.rows[0].exists) {
      log.error('file_migrations table does not exist. Please run the migration SQL first.');
      process.exit(1);
    }

    // Run migrations
    const projectFilesResult = await migrateProjectFiles();
    const timesheetImagesResult = await migrateTimesheetImages();
    const safetyDocumentsResult = await migrateSafetyDocuments();
    const logosResult = await migrateLogosAndFavicons();

    // Summary
    const totalSuccess = projectFilesResult.success + timesheetImagesResult.success + 
                         safetyDocumentsResult.success + logosResult.success;
    const totalFailed = projectFilesResult.failed + timesheetImagesResult.failed + 
                       safetyDocumentsResult.failed + logosResult.failed;

    log.info('=== Migration Summary ===');
    log.info(`Project Files: ${projectFilesResult.success} succeeded, ${projectFilesResult.failed} failed`);
    log.info(`Timesheet Images: ${timesheetImagesResult.success} succeeded, ${timesheetImagesResult.failed} failed`);
    log.info(`Safety Documents: ${safetyDocumentsResult.success} succeeded, ${safetyDocumentsResult.failed} failed`);
    log.info(`Logos/Favicons: ${logosResult.success} succeeded, ${logosResult.failed} failed`);
    log.info(`Total: ${totalSuccess} succeeded, ${totalFailed} failed`);

    if (totalFailed > 0) {
      log.warn('Some files failed to migrate. Check the file_migrations table for details.');
      process.exit(1);
    } else {
      log.info('All files migrated successfully!');
      process.exit(0);
    }
  } catch (error) {
    log.error('Migration failed', error);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateFiles();
}

export { migrateFiles };
