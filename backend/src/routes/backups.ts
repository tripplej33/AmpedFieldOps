import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { query } from '../db';
import { createBackup, cleanupOldBackups, getBackupFileStream } from '../lib/backup';
import { 
  getAuthUrl, 
  exchangeCodeForTokens, 
  uploadToGoogleDrive, 
  deleteFromGoogleDrive,
  downloadFromGoogleDrive,
  isGoogleDriveConnected
} from '../lib/googleDrive';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const router = Router();

// Get all backups
router.get('/', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT b.*, u.name as created_by_name
       FROM backups b
       LEFT JOIN users u ON b.created_by = u.id
       ORDER BY b.created_at DESC
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error('Failed to get backups:', error);
    res.status(500).json({ error: 'Failed to get backups' });
  }
});

// Get single backup
router.get('/:id', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT b.*, u.name as created_by_name
       FROM backups b
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Failed to get backup:', error);
    res.status(500).json({ error: 'Failed to get backup' });
  }
});

// Create backup
router.post('/', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { type = 'full', storage_type = 'local' } = req.body;

    if (!['full', 'database', 'files'].includes(type)) {
      return res.status(400).json({ error: 'Invalid backup type' });
    }

    if (!['local', 'google_drive'].includes(storage_type)) {
      return res.status(400).json({ error: 'Invalid storage type' });
    }

    // Create backup
    const backupResult = await createBackup({
      type: type as 'full' | 'database' | 'files',
      userId: req.user!.id,
      storageType: storage_type as 'local' | 'google_drive'
    });

    if (!backupResult.success) {
      return res.status(500).json({ 
        error: 'Backup creation failed', 
        details: backupResult.error 
      });
    }

    // If Google Drive storage, upload the file
    if (storage_type === 'google_drive' && backupResult.filePath) {
      try {
        const fileName = path.basename(backupResult.filePath);
        const fileId = await uploadToGoogleDrive(
          backupResult.filePath,
          fileName,
          req.user!.id
        );

        // Update backup record with Google Drive file ID
        await query(
          'UPDATE backups SET google_drive_file_id = $1 WHERE id = $2',
          [fileId, backupResult.backupId]
        );

        // Optionally delete local file after upload
        // await fs.unlink(backupResult.filePath);
      } catch (error: any) {
        console.error('Failed to upload to Google Drive:', error);
        // Update backup with error but don't fail the request
        await query(
          'UPDATE backups SET status = $1, error_message = $2 WHERE id = $3',
          ['failed', `Google Drive upload failed: ${error.message}`, backupResult.backupId]
        );
      }
    }

    // Get updated backup record
    const updatedResult = await query(
      'SELECT * FROM backups WHERE id = $1',
      [backupResult.backupId]
    );

    res.json(updatedResult.rows[0]);
  } catch (error: any) {
    console.error('Backup creation error:', error);
    res.status(500).json({ error: 'Failed to create backup', details: error.message });
  }
});

// Download backup
router.get('/:id/download', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT * FROM backups WHERE id = $1 AND status = $2',
      [id, 'completed']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found or not completed' });
    }

    const backup = result.rows[0];

    // If Google Drive backup, download first
    if (backup.storage_type === 'google_drive' && backup.google_drive_file_id) {
      const tempPath = path.join(process.cwd(), 'backups', `temp-${id}.tar.gz`);
      try {
        await downloadFromGoogleDrive(
          backup.google_drive_file_id,
          tempPath,
          req.user!.id
        );
        backup.file_path = tempPath;
      } catch (error: any) {
        return res.status(500).json({ error: 'Failed to download from Google Drive', details: error.message });
      }
    }

    if (!backup.file_path) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    // Check if file exists
    try {
      await fs.access(backup.file_path);
    } catch {
      return res.status(404).json({ error: 'Backup file not found on disk' });
    }

    const fileName = path.basename(backup.file_path);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const fileStream = await getBackupFileStream(id);
    fileStream.pipe(res);

    // Clean up temp file after download if it was from Google Drive
    if (backup.storage_type === 'google_drive') {
      fileStream.on('end', () => {
        fs.unlink(backup.file_path).catch(() => {});
      });
    }
  } catch (error: any) {
    console.error('Backup download error:', error);
    res.status(500).json({ error: 'Failed to download backup', details: error.message });
  }
});

// Delete backup
router.delete('/:id', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM backups WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    const backup = result.rows[0];

    // Delete from Google Drive if applicable
    if (backup.storage_type === 'google_drive' && backup.google_drive_file_id) {
      try {
        await deleteFromGoogleDrive(backup.google_drive_file_id, req.user!.id);
      } catch (error: any) {
        console.error('Failed to delete from Google Drive:', error);
        // Continue with local deletion even if Google Drive deletion fails
      }
    }

    // Delete local file if exists
    if (backup.file_path) {
      try {
        await fs.unlink(backup.file_path);
      } catch (error) {
        console.error('Failed to delete local backup file:', error);
      }
    }

    // Delete database record
    await query('DELETE FROM backups WHERE id = $1', [id]);

    res.json({ message: 'Backup deleted successfully' });
  } catch (error: any) {
    console.error('Backup deletion error:', error);
    res.status(500).json({ error: 'Failed to delete backup', details: error.message });
  }
});

// Restore from backup
router.post('/:id/restore', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { confirm } = req.body;

    if (!confirm) {
      return res.status(400).json({ error: 'Restore confirmation required. Set confirm: true' });
    }

    const result = await query(
      'SELECT * FROM backups WHERE id = $1 AND status = $2',
      [id, 'completed']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found or not completed' });
    }

    const backup = result.rows[0];
    let backupPath = backup.file_path;

    // If Google Drive backup, download first
    if (backup.storage_type === 'google_drive' && backup.google_drive_file_id) {
      const tempPath = path.join(process.cwd(), 'backups', `restore-${id}.tar.gz`);
      try {
        await downloadFromGoogleDrive(
          backup.google_drive_file_id,
          tempPath,
          req.user!.id
        );
        backupPath = tempPath;
      } catch (error: any) {
        return res.status(500).json({ error: 'Failed to download from Google Drive', details: error.message });
      }
    }

    if (!backupPath) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    // Extract and restore based on backup type
    if (backup.backup_type === 'database' || backup.backup_type === 'full') {
      // Extract database backup file
      const extractDir = path.join(process.cwd(), 'backups', `restore-${id}`);
      await fs.mkdir(extractDir, { recursive: true });

      // Extract tar.gz
      await execAsync(`tar -xzf "${backupPath}" -C "${extractDir}"`);

      // Find database dump file
      const files = await fs.readdir(extractDir);
      const dbFile = files.find(f => f.startsWith('database-') && f.endsWith('.sql'));

      if (dbFile) {
        const dbConfig = getDatabaseConfig();
        const restoreCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${path.join(extractDir, dbFile)}"`;
        const envVars = { ...process.env, PGPASSWORD: dbConfig.password };

        await execAsync(restoreCmd, { env: envVars });
      }

      // Cleanup extract directory
      await fs.rm(extractDir, { recursive: true, force: true });
    }

    if (backup.backup_type === 'files' || backup.backup_type === 'full') {
      // Extract files backup
      const uploadsDir = path.join(process.cwd(), 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });

      // Extract tar.gz to uploads directory
      await execAsync(`tar -xzf "${backupPath}" -C "${path.dirname(uploadsDir)}"`);
    }

    // Clean up temp file if from Google Drive
    if (backup.storage_type === 'google_drive' && backupPath !== backup.file_path) {
      await fs.unlink(backupPath).catch(() => {});
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'restore_backup', 'backup', $2, $3)`,
      [req.user!.id, id, JSON.stringify({ backup_type: backup.backup_type })]
    );

    res.json({ message: 'Backup restored successfully' });
  } catch (error: any) {
    console.error('Backup restore error:', error);
    res.status(500).json({ error: 'Failed to restore backup', details: error.message });
  }
});

// Get Google Drive OAuth URL
router.get('/google-drive/auth', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const state = req.user!.id; // Use user ID as state
    const authUrl = getAuthUrl(state);
    res.json({ url: authUrl });
  } catch (error: any) {
    console.error('Failed to get Google Drive auth URL:', error);
    res.status(500).json({ error: 'Failed to get Google Drive auth URL', details: error.message });
  }
});

// Handle Google Drive OAuth callback
router.get('/google-drive/callback', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    await exchangeCodeForTokens(code, req.user!.id);

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?tab=backups&google_drive_connected=true`);
  } catch (error: any) {
    console.error('Google Drive callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?tab=backups&google_drive_error=${encodeURIComponent(error.message)}`);
  }
});

// Get Google Drive connection status
router.get('/google-drive/status', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const connected = await isGoogleDriveConnected();
    res.json({ connected });
  } catch (error: any) {
    console.error('Failed to get Google Drive status:', error);
    res.status(500).json({ error: 'Failed to get Google Drive status' });
  }
});

// Configure scheduled backups
router.post('/schedule', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { enabled, frequency, retention_days, backup_type, storage_type } = req.body;

    const scheduleConfig = {
      enabled: enabled !== false,
      frequency: frequency || 'daily', // daily, weekly, monthly
      retention_days: retention_days || 30,
      backup_type: backup_type || 'full',
      storage_type: storage_type || 'local'
    };

    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('backup_schedule', $1, $2)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(scheduleConfig), req.user!.id]
    );

    res.json({ message: 'Backup schedule configured', schedule: scheduleConfig });
  } catch (error: any) {
    console.error('Failed to configure backup schedule:', error);
    res.status(500).json({ error: 'Failed to configure backup schedule', details: error.message });
  }
});

// Get backup schedule
router.get('/schedule', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      "SELECT value FROM settings WHERE key = 'backup_schedule' AND user_id = $1",
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        enabled: false,
        frequency: 'daily',
        retention_days: 30,
        backup_type: 'full',
        storage_type: 'local'
      });
    }

    res.json(JSON.parse(result.rows[0].value));
  } catch (error: any) {
    console.error('Failed to get backup schedule:', error);
    res.status(500).json({ error: 'Failed to get backup schedule' });
  }
});

// Cleanup old backups
router.post('/cleanup', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { retention_days = 30 } = req.body;
    const deletedCount = await cleanupOldBackups(retention_days);
    res.json({ message: `Cleaned up ${deletedCount} old backups` });
  } catch (error: any) {
    console.error('Backup cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup backups', details: error.message });
  }
});

// Helper function to get database config
function getDatabaseConfig() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  const url = new URL(dbUrl);
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.slice(1),
    user: url.username,
    password: url.password
  };
}

export default router;

