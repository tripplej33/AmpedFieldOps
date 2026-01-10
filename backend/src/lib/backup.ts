import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { query } from '../db';
import dotenv from 'dotenv';
// Suppress dotenv parsing warnings
dotenv.config({ debug: false, override: false });

const env = {
  DATABASE_URL: process.env.DATABASE_URL || ''
};

const execAsync = promisify(exec);

interface BackupOptions {
  type: 'full' | 'database' | 'files';
  userId?: string;
  storageType?: 'local' | 'google_drive';
}

interface BackupResult {
  success: boolean;
  backupId?: string;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure backup directory exists
async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    // Verify directory was created and is writable
    await fs.access(BACKUP_DIR, fs.constants.W_OK);
  } catch (error: any) {
    const errorMsg = `Failed to create or access backup directory (${BACKUP_DIR}): ${error.message}`;
    console.error(errorMsg, error);
    throw new Error(errorMsg);
  }
}

// Extract database connection details from DATABASE_URL
export function getDatabaseConfig() {
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not configured. Required for database backups. Set it in your environment variables or get it from `supabase status` for local development.');
  }

  // Parse PostgreSQL connection string
  // Format: postgresql://user:password@host:port/database
  const url = new URL(dbUrl);
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.slice(1), // Remove leading /
    user: url.username,
    password: url.password
  };
}

// Create database backup using pg_dump
async function backupDatabase(): Promise<string> {
  const config = getDatabaseConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpFile = path.join(BACKUP_DIR, `database-${timestamp}.sql`);

  // Build pg_dump command
  const pgDumpCmd = [
    'pg_dump',
    `-h ${config.host}`,
    `-p ${config.port}`,
    `-U ${config.user}`,
    `-d ${config.database}`,
    '-F c', // Custom format (compressed)
    `-f ${dumpFile}`
  ].join(' ');

  // Set PGPASSWORD environment variable
  const envVars = { ...process.env, PGPASSWORD: config.password };

  try {
    await execAsync(pgDumpCmd, { env: envVars, maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
    // Verify file was created
    await fs.access(dumpFile);
    return dumpFile;
  } catch (error: any) {
    // Check if pg_dump is available
    if (error.message.includes('pg_dump') || error.message.includes('not found') || error.message.includes('ENOENT')) {
      throw new Error('pg_dump command not found. Please ensure PostgreSQL client tools are installed on the server.');
    }
    
    // Try alternative: plain SQL format
    const plainDumpCmd = [
      'pg_dump',
      `-h ${config.host}`,
      `-p ${config.port}`,
      `-U ${config.user}`,
      `-d ${config.database}`,
      `-f ${dumpFile}`
    ].join(' ');

    try {
      await execAsync(plainDumpCmd, { env: envVars, maxBuffer: 10 * 1024 * 1024 });
      // Verify file was created
      await fs.access(dumpFile);
      return dumpFile;
    } catch (retryError: any) {
      // Provide more detailed error message
      const errorDetails = retryError.stderr || retryError.message || 'Unknown error';
      throw new Error(`Database backup failed: ${errorDetails}. Check database connection and permissions.`);
    }
  }
}

// Create files backup (archive uploads directory)
async function backupFiles(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveFile = path.join(BACKUP_DIR, `files-${timestamp}.tar.gz`);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(archiveFile);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 }
    });

    output.on('close', () => {
      resolve(archiveFile);
    });

    archive.on('error', (err) => {
      reject(new Error(`File backup failed: ${err.message}`));
    });

    archive.pipe(output);

    // Check if uploads directory exists
    fs.access(UPLOADS_DIR)
      .then(() => {
        archive.directory(UPLOADS_DIR, false);
        archive.finalize();
      })
      .catch(() => {
        // If uploads directory doesn't exist, create empty archive
        archive.finalize();
      });
  });
}

// Compress multiple backup files into a single archive
async function compressBackup(files: string[], outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 }
    });

    output.on('close', () => {
      resolve(outputPath);
    });

    archive.on('error', (err: any) => {
      reject(new Error(`Compression failed: ${err.message || 'Unknown error'}`));
    });

    output.on('error', (err: any) => {
      reject(new Error(`Compression failed: ${err.message || 'Unknown error'}`));
    });

    archive.pipe(output);

    for (const file of files) {
      const fileName = path.basename(file);
      archive.file(file, { name: fileName });
    }

    archive.finalize();
  });
}

// Create backup based on type
export async function createBackup(options: BackupOptions): Promise<BackupResult> {
  const { type, userId, storageType = 'local' } = options;

  try {
    await ensureBackupDir();

    // Create backup record in database
    const backupResult = await query(
      `INSERT INTO backups (backup_type, storage_type, status, created_by)
       VALUES ($1, $2, 'pending', $3)
       RETURNING id`,
      [type, storageType, userId || null]
    );

    const backupId = backupResult.rows[0].id;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let backupFileList: string[] = [];
    let finalBackupPath: string;

    try {
      if (type === 'database' || type === 'full') {
        const dbBackup = await backupDatabase();
        backupFileList.push(dbBackup);
      }

      if (type === 'files' || type === 'full') {
        const filesBackup = await backupFiles();
        backupFileList.push(filesBackup);
      }

      // If multiple files, compress into single archive
      if (backupFileList.length > 1) {
        finalBackupPath = path.join(BACKUP_DIR, `backup-${backupId}-${timestamp}.tar.gz`);
        await compressBackup(backupFileList, finalBackupPath);
        // Clean up individual files
        for (const file of backupFileList) {
          await fs.unlink(file).catch(() => {});
        }
      } else {
        finalBackupPath = backupFileList[0];
      }

      // Get file size
      const stats = await fs.stat(finalBackupPath);
      const fileSize = stats.size;

      // Update backup record
      await query(
        `UPDATE backups 
         SET file_path = $1, file_size = $2, status = 'completed'
         WHERE id = $3`,
        [finalBackupPath, fileSize, backupId]
      );

      return {
        success: true,
        backupId,
        filePath: finalBackupPath,
        fileSize
      };
    } catch (error: any) {
      // Update backup record with error
      await query(
        `UPDATE backups 
         SET status = 'failed', error_message = $1
         WHERE id = $2`,
        [error.message, backupId]
      );

      return {
        success: false,
        backupId,
        error: error.message
      };
    }
  } catch (error: any) {
    console.error('Backup creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Cleanup old backups based on retention period
export async function cleanupOldBackups(retentionDays: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Find backups to delete
    const backupsResult = await query(
      `SELECT id, file_path FROM backups 
       WHERE created_at < $1 AND storage_type = 'local'`,
      [cutoffDate]
    );

    let deletedCount = 0;

    for (const backup of backupsResult.rows) {
      try {
        // Delete file if it exists
        if (backup.file_path) {
          await fs.unlink(backup.file_path).catch(() => {});
        }

        // Delete database record
        await query('DELETE FROM backups WHERE id = $1', [backup.id]);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete backup ${backup.id}:`, error);
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('Backup cleanup error:', error);
    return 0;
  }
}

// Get backup file stream for download
export async function getBackupFileStream(backupId: string) {
  const result = await query(
    'SELECT file_path FROM backups WHERE id = $1 AND status = $2',
    [backupId, 'completed']
  );

  if (result.rows.length === 0) {
    throw new Error('Backup not found or not completed');
  }

  const filePath = result.rows[0].file_path;
  if (!filePath) {
    throw new Error('Backup file path not found');
  }

  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Backup file not found on disk');
  }

  return createReadStream(filePath);
}

