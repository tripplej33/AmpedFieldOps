import cron from 'node-cron';
import { query } from '../db';
import { createBackup, cleanupOldBackups } from '../lib/backup';
import { uploadToGoogleDrive } from '../lib/googleDrive';
import path from 'path';
import fs from 'fs/promises';

let scheduledJob: cron.ScheduledTask | null = null;

// Get backup schedule from database
async function getBackupSchedule(): Promise<{
  enabled: boolean;
  frequency: string;
  retention_days: number;
  backup_type: 'full' | 'database' | 'files';
  storage_type: 'local' | 'google_drive';
} | null> {
  try {
    const result = await query(
      "SELECT value FROM settings WHERE key = 'backup_schedule' ORDER BY updated_at DESC LIMIT 1"
    );

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].value);
  } catch (error) {
    console.error('Failed to get backup schedule:', error);
    return null;
  }
}

// Get cron expression based on frequency
function getCronExpression(frequency: string): string {
  switch (frequency.toLowerCase()) {
    case 'daily':
      return '0 2 * * *'; // 2 AM daily
    case 'weekly':
      return '0 2 * * 0'; // 2 AM every Sunday
    case 'monthly':
      return '0 2 1 * *'; // 2 AM on the 1st of every month
    default:
      return '0 2 * * *'; // Default to daily
  }
}

// Run scheduled backup
async function runScheduledBackup() {
  console.log('[Backup Scheduler] Starting scheduled backup...');
  
  try {
    const schedule = await getBackupSchedule();
    
    if (!schedule || !schedule.enabled) {
      console.log('[Backup Scheduler] Backup schedule is disabled');
      return;
    }

    // Create backup
    const backupResult = await createBackup({
      type: schedule.backup_type,
      storageType: schedule.storage_type,
      userId: undefined // System backup
    });

    if (!backupResult.success || !backupResult.backupId) {
      console.error('[Backup Scheduler] Backup creation failed:', backupResult.error);
      return;
    }

    console.log(`[Backup Scheduler] Backup created: ${backupResult.backupId}`);

    // If Google Drive storage, upload the file
    if (schedule.storage_type === 'google_drive' && backupResult.filePath) {
      try {
        const fileName = path.basename(backupResult.filePath);
        const fileId = await uploadToGoogleDrive(
          backupResult.filePath,
          fileName
        );

        // Update backup record with Google Drive file ID
        await query(
          'UPDATE backups SET google_drive_file_id = $1 WHERE id = $2',
          [fileId, backupResult.backupId]
        );

        console.log(`[Backup Scheduler] Backup uploaded to Google Drive: ${fileId}`);

        // Optionally delete local file after upload to save space
        // await fs.unlink(backupResult.filePath);
      } catch (error: any) {
        console.error('[Backup Scheduler] Failed to upload to Google Drive:', error);
        // Update backup with error but don't fail
        await query(
          'UPDATE backups SET status = $1, error_message = $2 WHERE id = $3',
          ['failed', `Google Drive upload failed: ${error.message}`, backupResult.backupId]
        );
      }
    }

    // Cleanup old backups
    if (schedule.retention_days > 0) {
      const deletedCount = await cleanupOldBackups(schedule.retention_days);
      if (deletedCount > 0) {
        console.log(`[Backup Scheduler] Cleaned up ${deletedCount} old backups`);
      }
    }

    console.log('[Backup Scheduler] Scheduled backup completed successfully');
  } catch (error: any) {
    console.error('[Backup Scheduler] Scheduled backup failed:', error);
  }
}

// Start backup scheduler
export function startBackupScheduler() {
  console.log('[Backup Scheduler] Initializing backup scheduler...');

  // Stop existing job if any
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
  }

  // Check schedule and start job
  getBackupSchedule().then((schedule) => {
    if (!schedule || !schedule.enabled) {
      console.log('[Backup Scheduler] Backup schedule is disabled, scheduler not started');
      return;
    }

    const cronExpression = getCronExpression(schedule.frequency);
    console.log(`[Backup Scheduler] Starting scheduler with frequency: ${schedule.frequency} (${cronExpression})`);

    scheduledJob = cron.schedule(cronExpression, async () => {
      await runScheduledBackup();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('[Backup Scheduler] Backup scheduler started successfully');
  }).catch((error) => {
    console.error('[Backup Scheduler] Failed to start scheduler:', error);
  });
}

// Stop backup scheduler
export function stopBackupScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('[Backup Scheduler] Backup scheduler stopped');
  }
}

// Reload backup scheduler (useful when schedule changes)
export function reloadBackupScheduler() {
  stopBackupScheduler();
  startBackupScheduler();
}

