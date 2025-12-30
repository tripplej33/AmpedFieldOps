import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { logoUpload } from '../middleware/upload';
import { clearEmailSettingsCache, sendTestEmail } from '../lib/email';
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
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

    // Ensure the logos directory exists
    const logosDir = path.join(__dirname, '../../uploads/logos');
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;

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

export default router;
