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
import { supabase as supabaseClient } from '../db/supabase';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

const router = Router();
const supabase = supabaseClient!;

// Get all settings (admin gets global, users get their own)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    
    // Get app settings
    const { data: appSettings, error } = await supabase
      .from('app_settings')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      log.warn('Failed to fetch app_settings', { error: error.message });
    }

    const result: Record<string, any> = {
      setup_complete: appSettings?.setup_complete || false,
      // Add other defaults as needed
    };
    

    res.json(result);
  } catch (error: any) {
    log.error('Failed to fetch settings', error, { userId: req.user?.id });
    res.status(500).json({ 
      error: 'Failed to fetch settings',
      details: env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get storage configuration (admin only) - MUST be before /:key route
router.get('/storage', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const storage = await StorageFactory.getInstance();
    const driver = storage.getDriver();
    const response: any = {
      driver,
      basePath: 'uploads',
    };
    if (driver === 'google-drive') {
      try {
        response.googleDriveConnected = await isGoogleDriveConnected();
      } catch (error: any) {
        log.error('Failed to check Google Drive connection status', error);
        response.googleDriveConnected = false;
      }
    }
    res.json(response);
  } catch (error: any) {
    log.error('Failed to fetch storage settings', error);
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

    if (driver && !['local', 's3', 'google-drive'].includes(driver)) {
      return res.status(400).json({ error: 'Invalid storage driver. Must be "local", "s3", or "google-drive"' });
    }

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

    if (driver === 'google-drive') {
      const isConnected = await isGoogleDriveConnected();
      if (!isConnected) {
        return res.status(400).json({ 
          error: 'Google Drive not connected',
          message: 'Please connect your Google Drive account in Settings → Integrations before using Google Drive storage.'
        });
      }
    }

    // Test connection before accepting config
    const testConfig: StorageConfig = {
      driver: (driver as any) || 'local',
      basePath: basePath || 'uploads',
      s3Bucket,
      s3Region: s3Region || 'us-east-1',
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      googleDriveFolderId,
    };

    try {
      const testProvider = await StorageFactory.createTestInstance(testConfig);
      const testResult = await testProvider.testConnection();
      if (!testResult.success) {
        return res.status(400).json({ error: 'Storage connection test failed', message: testResult.message });
      }
    } catch (testError: any) {
      return res.status(400).json({ error: 'Storage connection test failed', message: testError.message });
    }

    // Persist minimal config in Supabase settings table
    const { error: upsertError } = await supabase
      .from('settings')
      .upsert({
        key: 'storage_config',
        value: JSON.stringify(testConfig),
        description: 'Storage driver configuration',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });
    if (upsertError) {
      log.warn('Failed to persist storage_config to settings', upsertError);
    }

    StorageFactory.invalidateCache();
    res.json({ message: 'Storage configuration validated and saved (app_settings)', driver: testConfig.driver });
  } catch (error: any) {
    log.error('Failed to update storage settings', error);
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
    // Get setting from Supabase settings table
    const { data: setting, error } = await supabase
      .from('settings')
      .select('key, value')
      .eq('key', req.params.key)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      log.error('Failed to fetch setting from Supabase', error);
      return res.status(500).json({ error: 'Failed to fetch setting' });
    }

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key: setting.key, value: setting.value });
  } catch (error: any) {
    log.error('Failed to fetch setting', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update setting
router.put('/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { value } = req.body;

    // Only admins can update settings
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update settings' });
    }

    // Upsert setting to Supabase
    const { data: updatedSetting, error } = await supabase
      .from('settings')
      .upsert({
        key: req.params.key,
        value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      })
      .select('key, value')
      .single();

    if (error) {
      log.error('Failed to update setting in Supabase', error);
      return res.status(500).json({ error: 'Failed to update setting' });
    }

    // Clear email settings cache if an email setting was updated
    if (['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from'].includes(req.params.key)) {
      clearEmailSettingsCache();
    }

    res.json({ key: updatedSetting.key, value: updatedSetting.value });
  } catch (error: any) {
    log.error('Failed to update setting', error);
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
    // Only admins can delete settings
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete settings' });
    }

    // Delete from Supabase
    const { error } = await supabase
      .from('settings')
      .delete()
      .eq('key', req.params.key);

    if (error) {
      log.error('Failed to delete setting from Supabase', error);
      return res.status(500).json({ error: 'Failed to delete setting' });
    }

    res.json({ message: 'Setting deleted' });
  } catch (error: any) {
    log.error('Failed to delete setting', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// Upload company logo (admin only)
router.post('/logo', authenticate, requireRole('admin'), logoUpload.single('logo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageInitError: any) {
      log.error('Failed to initialize storage provider for logo upload', storageInitError, { userId: req.user!.id });
      return res.status(500).json({ 
        error: 'Failed to initialize storage',
        message: env.NODE_ENV === 'development' ? storageInitError.message : 'Storage initialization failed'
      });
    }

    // Upload logo to storage provider
    const basePath = 'logos';
    const storagePath = generatePartitionedPath(req.file.originalname, basePath);
    
    // Stream file from memory buffer to storage provider
    let logoUrl: string;
    try {
      const fileStream = bufferToStream(req.file.buffer);
      await storage.put(storagePath, fileStream, {
        contentType: req.file.mimetype,
      });
      
      // Get URL from storage provider
      logoUrl = await storage.url(storagePath);
    } catch (storageError: any) {
      log.error('Failed to upload logo to storage', storageError, {
        storagePath,
        userId: req.user!.id,
        errorMessage: storageError.message,
        errorStack: storageError.stack
      });
      return res.status(500).json({ 
        error: 'Failed to upload logo',
        message: env.NODE_ENV === 'development' ? storageError.message : 'An error occurred while uploading the logo'
      });
    }

    // Save logo URL to Supabase settings table
    try {
      const { error: updateError } = await supabase
        .from('settings')
        .upsert({ 
          key: 'company_logo', 
          value: logoUrl,
          description: 'Company logo path',
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      if (updateError) {
        throw updateError;
      }
    } catch (dbError: any) {
      log.error('Failed to save logo URL to settings', dbError, { logoUrl, userId: req.user!.id });
      // Still return success since file was uploaded, but log the error
    }

    res.json({ logo_url: logoUrl });
  } catch (error: any) {
    log.error('Logo upload error', error, {
      userId: req.user!.id,
      errorMessage: error.message,
      errorStack: error.stack
    });
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

    // Get storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageInitError: any) {
      log.error('Failed to initialize storage provider for favicon upload', storageInitError, { userId: req.user!.id });
      return res.status(500).json({ 
        error: 'Failed to initialize storage',
        message: env.NODE_ENV === 'development' ? storageInitError.message : 'Storage initialization failed'
      });
    }

    // Upload favicon to storage provider
    const basePath = 'logos';
    // For favicon, use a consistent name
    const isIco = path.extname(req.file.originalname).toLowerCase() === '.ico';
    const faviconFilename = isIco ? 'favicon.ico' : `favicon-${Date.now()}${path.extname(req.file.originalname)}`;
    const storagePath = generatePartitionedPath(faviconFilename, basePath);
    
    // Stream file from memory buffer to storage provider
    let faviconUrl: string;
    try {
      const fileStream = bufferToStream(req.file.buffer);
      await storage.put(storagePath, fileStream, {
        contentType: req.file.mimetype,
      });
      
      // Get URL from storage provider
      faviconUrl = await storage.url(storagePath);
    } catch (storageError: any) {
      log.error('Failed to upload favicon to storage', storageError, {
        storagePath,
        userId: req.user!.id,
        errorMessage: storageError.message,
        errorStack: storageError.stack
      });
      return res.status(500).json({ 
        error: 'Failed to upload favicon',
        message: env.NODE_ENV === 'development' ? storageError.message : 'An error occurred while uploading the favicon'
      });
    }

    // Save favicon URL to Supabase settings table
    try {
      const { error: updateError } = await supabase
        .from('settings')
        .upsert({ 
          key: 'company_favicon', 
          value: faviconUrl,
          description: 'Company favicon path',
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      if (updateError) {
        throw updateError;
      }
    } catch (dbError: any) {
      log.error('Failed to save favicon URL to settings', dbError, { faviconUrl, userId: req.user!.id });
      // Still return success since file was uploaded, but log the error
    }

    res.json({ favicon_url: faviconUrl });
  } catch (error: any) {
    log.error('Favicon upload error', error, {
      userId: req.user!.id,
      errorMessage: error.message,
      errorStack: error.stack
    });
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
