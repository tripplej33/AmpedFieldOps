import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { logoUpload, faviconUpload } from '../middleware/upload';
import { clearEmailSettingsCache, sendTestEmail } from '../lib/email';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { StorageConfig } from '../lib/storage/types';
import { generatePartitionedPath } from '../lib/storage/pathUtils';
import { bufferToStream } from '../middleware/upload';
import { log } from '../lib/logger';
import { isGoogleDriveConnected } from '../lib/googleDrive';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

const router = Router();

// Get all settings (admin gets global, users get their own)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    
    // Get user-specific settings
    const userSettings = await query(
      `SELECT key, value FROM settings WHERE user_id = $1`,
      [req.user!.id]
    );

    // Get global settings if admin
    let globalSettings: any[] = [];
    if (isAdmin) {
      const global = await query(
        `SELECT key, value FROM settings WHERE user_id IS NULL`
      );
      globalSettings = global.rows;
    } else {
      // Non-admins only get public global settings
      const publicGlobal = await query(
        `SELECT key, value FROM settings 
         WHERE user_id IS NULL AND key IN ('company_name', 'company_logo', 'timezone')`
      );
      globalSettings = publicGlobal.rows;
    }

    const result: Record<string, any> = {};
    
    globalSettings.forEach(row => {
      result[row.key] = row.value;
    });
    
    userSettings.rows.forEach(row => {
      result[`user_${row.key}`] = row.value;
    });

    res.json(result);
  } catch (error: any) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch settings',
      details: env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get storage configuration (admin only) - MUST be before /:key route
router.get('/storage', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT key, value FROM settings 
       WHERE user_id IS NULL 
       AND key IN ('storage_driver', 'storage_base_path', 'storage_s3_bucket', 'storage_s3_region', 'storage_s3_access_key_id', 'storage_s3_secret_access_key', 'storage_s3_endpoint', 'storage_google_drive_folder_id')`
    );

    const settings: Record<string, string> = {};
    result.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });

    // Don't return secret access key in response (security)
    const response: any = {
      driver: settings.storage_driver || 'local',
      basePath: settings.storage_base_path || 'uploads',
    };

    if (settings.storage_driver === 's3') {
      response.s3Bucket = settings.storage_s3_bucket || '';
      response.s3Region = settings.storage_s3_region || 'us-east-1';
      response.s3AccessKeyId = settings.storage_s3_access_key_id || '';
      // Only return masked secret key
      if (settings.storage_s3_secret_access_key) {
        const secret = settings.storage_s3_secret_access_key;
        response.s3SecretAccessKey = secret.length > 8 
          ? `${secret.substring(0, 4)}${'*'.repeat(secret.length - 8)}${secret.substring(secret.length - 4)}`
          : '****';
      }
      response.s3Endpoint = settings.storage_s3_endpoint || '';
    } else if (settings.storage_driver === 'google-drive') {
      response.googleDriveFolderId = settings.storage_google_drive_folder_id || '';
      // Check OAuth connection status
      try {
        response.googleDriveConnected = await isGoogleDriveConnected();
      } catch (error: any) {
        log.error('Failed to check Google Drive connection status', error);
        response.googleDriveConnected = false;
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error('Failed to fetch storage settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch storage settings',
      details: env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update storage configuration (admin only) - MUST be before /:key route
router.put('/storage', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { driver, basePath, s3Bucket, s3Region, s3AccessKeyId, s3SecretAccessKey, s3Endpoint, googleDriveFolderId } = req.body;

    // Validate driver
    if (driver && !['local', 's3', 'google-drive'].includes(driver)) {
      return res.status(400).json({ error: 'Invalid storage driver. Must be "local", "s3", or "google-drive"' });
    }

    // Validate S3 configuration if switching to S3
    if (driver === 's3') {
      if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
        return res.status(400).json({ 
          error: 'S3 configuration incomplete',
          missing: [
            !s3Bucket && 'bucket',
            !s3AccessKeyId && 'accessKeyId',
            !s3SecretAccessKey && 'secretAccessKey'
          ].filter(Boolean)
        });
      }
    }

    // Validate Google Drive configuration if switching to Google Drive
    if (driver === 'google-drive') {
      // Check OAuth connection
      const isConnected = await isGoogleDriveConnected();
      if (!isConnected) {
        return res.status(400).json({ 
          error: 'Google Drive not connected',
          message: 'Please connect your Google Drive account in Settings → Integrations before using Google Drive storage.'
        });
      }
    }

    // Test connection before saving (if switching to S3/Google Drive or updating config)
    if (driver === 's3' || driver === 'google-drive' || (driver && driver !== 'local')) {
      try {
        const testConfig: StorageConfig = {
          driver: driver || 's3',
          basePath: basePath || 'uploads',
          s3Bucket,
          s3Region: s3Region || 'us-east-1',
          s3AccessKeyId,
          s3SecretAccessKey,
          s3Endpoint,
          googleDriveFolderId,
        };

        const testProvider = await StorageFactory.createTestInstance(testConfig);
        const testResult = await testProvider.testConnection();

        if (!testResult.success) {
          return res.status(400).json({ 
            error: 'Storage connection test failed',
            message: testResult.message
          });
        }
      } catch (testError: any) {
        return res.status(400).json({ 
          error: 'Storage connection test failed',
          message: testError.message
        });
      }
    }

    // Save settings
    const settingsToSave = [
      { key: 'storage_driver', value: driver || 'local' },
      { key: 'storage_base_path', value: basePath || 'uploads' },
    ];

    if (driver === 's3') {
      settingsToSave.push(
        { key: 'storage_s3_bucket', value: s3Bucket },
        { key: 'storage_s3_region', value: s3Region || 'us-east-1' },
        { key: 'storage_s3_access_key_id', value: s3AccessKeyId },
        { key: 'storage_s3_secret_access_key', value: s3SecretAccessKey }, // TODO: Encrypt this
        ...(s3Endpoint ? [{ key: 'storage_s3_endpoint', value: s3Endpoint }] : [])
      );
    } else if (driver === 'google-drive') {
      // Save Google Drive folder ID if provided
      if (googleDriveFolderId) {
        settingsToSave.push(
          { key: 'storage_google_drive_folder_id', value: googleDriveFolderId }
        );
      } else {
        // Clear folder ID if not provided
        await query('DELETE FROM settings WHERE key = $1 AND user_id IS NULL', ['storage_google_drive_folder_id']);
      }
    }

    // Clear settings for other drivers when switching
    if (driver === 'local') {
      // Clear S3 and Google Drive settings
      const otherSettings = ['storage_s3_bucket', 'storage_s3_region', 'storage_s3_access_key_id', 'storage_s3_secret_access_key', 'storage_s3_endpoint', 'storage_google_drive_folder_id'];
      for (const key of otherSettings) {
        await query('DELETE FROM settings WHERE key = $1 AND user_id IS NULL', [key]);
      }
    } else if (driver === 's3') {
      // Clear Google Drive settings
      await query('DELETE FROM settings WHERE key = $1 AND user_id IS NULL', ['storage_google_drive_folder_id']);
    } else if (driver === 'google-drive') {
      // Clear S3 settings
      const s3Settings = ['storage_s3_bucket', 'storage_s3_region', 'storage_s3_access_key_id', 'storage_s3_secret_access_key', 'storage_s3_endpoint'];
      for (const key of s3Settings) {
        await query('DELETE FROM settings WHERE key = $1 AND user_id IS NULL', [key]);
      }
    }

    // Save all settings
    for (const { key, value } of settingsToSave) {
      await query(
        `INSERT INTO settings (key, value, user_id)
         VALUES ($1, $2, NULL)
         ON CONFLICT (key, user_id) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }

    // Invalidate storage factory cache
    StorageFactory.invalidateCache();

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'update', 'storage_settings', JSON.stringify({ driver })]
    );

    res.json({ message: 'Storage configuration updated successfully' });
  } catch (error: any) {
    console.error('Failed to update storage settings:', error);
    res.status(500).json({ 
      error: 'Failed to update storage settings',
      details: env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Test storage connection without saving (admin only) - MUST be before /:key route
router.post('/storage/test', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { driver, basePath, s3Bucket, s3Region, s3AccessKeyId, s3SecretAccessKey, s3Endpoint, googleDriveFolderId } = req.body;

    // Validate driver
    if (!driver || !['local', 's3', 'google-drive'].includes(driver)) {
      return res.status(400).json({ error: 'Invalid storage driver. Must be "local", "s3", or "google-drive"' });
    }

    // Validate S3 configuration
    if (driver === 's3') {
      if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
        return res.status(400).json({ 
          error: 'S3 configuration incomplete',
          missing: [
            !s3Bucket && 'bucket',
            !s3AccessKeyId && 'accessKeyId',
            !s3SecretAccessKey && 'secretAccessKey'
          ].filter(Boolean)
        });
      }
    }

    // Validate Google Drive - check OAuth connection
    if (driver === 'google-drive') {
      const isConnected = await isGoogleDriveConnected();
      if (!isConnected) {
        return res.status(400).json({ 
          success: false,
          message: 'Google Drive not connected. Please connect your Google Drive account in Settings → Integrations first.'
        });
      }
    }

    // Create test instance
    const testConfig: StorageConfig = {
      driver,
      basePath: basePath || 'uploads',
      s3Bucket,
      s3Region: s3Region || 'us-east-1',
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      googleDriveFolderId,
    };

    const testProvider = await StorageFactory.createTestInstance(testConfig);
    const testResult = await testProvider.testConnection();

    res.json(testResult);
  } catch (error: any) {
    console.error('Storage connection test error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Connection test failed'
    });
  }
});

// Get specific setting
router.get('/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Try user-specific first
    let result = await query(
      `SELECT value FROM settings WHERE key = $1 AND user_id = $2`,
      [req.params.key, req.user!.id]
    );

    if (result.rows.length === 0) {
      // Try global
      result = await query(
        `SELECT value FROM settings WHERE key = $1 AND user_id IS NULL`,
        [req.params.key]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key: req.params.key, value: result.rows[0].value });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update setting
router.put('/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { value, global = false } = req.body;

    // Only admins can update global settings
    if (global && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update global settings' });
    }

    const userId = global ? null : req.user!.id;

    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [req.params.key, value, userId]
    );

    // Clear email settings cache if an email setting was updated
    if (global && ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from'].includes(req.params.key)) {
      clearEmailSettingsCache();
    }

    res.json({ key: req.params.key, value });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Bulk update settings
router.put('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { settings, global = false } = req.body;

    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'Settings must be an array' });
    }

    if (global && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update global settings' });
    }

    const userId = global ? null : req.user!.id;

    for (const { key, value } of settings) {
      await query(
        `INSERT INTO settings (key, value, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, user_id) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value, userId]
      );
    }

    // Clear email settings cache if any email settings were updated
    if (global) {
      const emailSettings = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from'];
      if (settings.some((s: any) => emailSettings.includes(s.key))) {
        clearEmailSettingsCache();
      }
    }

    res.json({ message: 'Settings updated', count: settings.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Delete setting
router.delete('/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { global = false } = req.query;

    if (global === 'true' && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete global settings' });
    }

    const userId = global === 'true' ? null : req.user!.id;

    await query(
      `DELETE FROM settings WHERE key = $1 AND user_id ${userId ? '= $2' : 'IS NULL'}`,
      userId ? [req.params.key, userId] : [req.params.key]
    );

    res.json({ message: 'Setting deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// Upload company logo (admin only)
router.post('/logo', authenticate, requireRole('admin'), logoUpload.single('logo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload logo to storage provider
    const storage = await StorageFactory.getInstance();
    const basePath = 'logos';
    const storagePath = generatePartitionedPath(req.file.originalname, basePath);
    
    // Stream file from memory buffer to storage provider
    const fileStream = bufferToStream(req.file.buffer);
    await storage.put(storagePath, fileStream, {
      contentType: req.file.mimetype,
    });
    
    // Get URL from storage provider
    const logoUrl = await storage.url(storagePath);

    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('company_logo', $1, NULL)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [logoUrl]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'update', 'settings', JSON.stringify({ key: 'company_logo', value: logoUrl })]
    );

    res.json({ logo_url: logoUrl });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload logo',
      message: env.NODE_ENV === 'development' ? error.message : 'An error occurred while uploading the logo'
    });
  }
});

// Upload favicon (admin only)
router.post('/favicon', authenticate, requireRole('admin'), faviconUpload.single('favicon'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload favicon to storage provider
    const storage = await StorageFactory.getInstance();
    const basePath = 'logos';
    // For favicon, use a consistent name
    const isIco = path.extname(req.file.originalname).toLowerCase() === '.ico';
    const faviconFilename = isIco ? 'favicon.ico' : `favicon-${Date.now()}${path.extname(req.file.originalname)}`;
    const storagePath = generatePartitionedPath(faviconFilename, basePath);
    
    // Stream file from memory buffer to storage provider
    const fileStream = bufferToStream(req.file.buffer);
    await storage.put(storagePath, fileStream, {
      contentType: req.file.mimetype,
    });
    
    // Get URL from storage provider
    const faviconUrl = await storage.url(storagePath);

    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('company_favicon', $1, NULL)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [faviconUrl]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'update', 'settings', JSON.stringify({ key: 'company_favicon', value: faviconUrl })]
    );

    res.json({ favicon_url: faviconUrl });
  } catch (error: any) {
    console.error('Favicon upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload favicon',
      message: env.NODE_ENV === 'development' ? error.message : 'An error occurred while uploading the favicon'
    });
  }
});

// Send test email (admin only)
router.post('/email/test', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    await sendTestEmail(email);
    res.json({ message: 'Test email sent successfully' });
  } catch (error: any) {
    console.error('[Settings] Test email error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to send test email',
      details: error.message 
    });
  }
});

// Get activity logs (admin only)
router.get('/logs/activity', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, action, entity_type, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (user_id) {
      sql += ` AND al.user_id = $${paramCount++}`;
      params.push(user_id);
    }

    if (action) {
      sql += ` AND al.action = $${paramCount++}`;
      params.push(action);
    }

    if (entity_type) {
      sql += ` AND al.entity_type = $${paramCount++}`;
      params.push(entity_type);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM activity_logs al WHERE 1=1 
       ${user_id ? `AND al.user_id = '${user_id}'` : ''}
       ${action ? `AND al.action = '${action}'` : ''}
       ${entity_type ? `AND al.entity_type = '${entity_type}'` : ''}`
    );

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Test S3 connection
router.post('/test-s3', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { accessKeyId, secretAccessKey, region, bucket } = req.body;

    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      return res.status(400).json({ error: 'Missing required S3 configuration fields' });
    }

    // Dynamic import to avoid requiring AWS SDK if not using S3
    const { S3Client, ListBucketsCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');

    const s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    // Test connection by checking if bucket exists and is accessible
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      res.json({ message: 'S3 connection successful! Bucket is accessible.' });
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: 'Bucket not found. Please verify the bucket name.' });
      } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
        res.status(403).json({ error: 'Access denied. Please verify your credentials and bucket permissions.' });
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    console.error('S3 connection test error:', error);
    res.status(500).json({ 
      error: 'Failed to test S3 connection',
      message: error.message || 'Unknown error'
    });
  }
});

export default router;
