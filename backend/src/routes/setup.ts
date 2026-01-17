import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { logoUpload, bufferToStream } from '../middleware/upload';
import { env } from '../config/env';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { generatePartitionedPath } from '../lib/storage/pathUtils';
import { log } from '../lib/logger';

const router = Router();

// Check setup status
router.get('/status', async (req, res) => {
  try {
    // Check if setup is completed
    const setupCompleted = await query(
      `SELECT value FROM settings WHERE key = 'setup_completed' AND user_id IS NULL`
    );

    if (setupCompleted.rows.length > 0 && setupCompleted.rows[0].value === 'true') {
      return res.json({ 
        completed: true,
        step: null
      });
    }

    // Check for existing admin user
    const adminUser = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    
    if (adminUser.rows.length === 0) {
      return res.json({ 
        completed: false, 
        step: 1,
        message: 'Create admin account'
      });
    }

    // Mark setup as completed after admin is created (company name prompt removed)
    // Company name can be changed later in Settings
    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('setup_completed', 'true', NULL)
       ON CONFLICT (key, user_id) DO UPDATE SET value = 'true', updated_at = CURRENT_TIMESTAMP`
    );

    return res.json({ 
      completed: true,
      step: null
    });

  } catch (error) {
    console.error('Setup status error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// Check if default admin exists
router.get('/default-admin-status', async (req, res) => {
  try {
    const defaultAdmin = await query(
      `SELECT id, email FROM users WHERE email = 'admin@ampedfieldops.com' AND role = 'admin' LIMIT 1`
    );
    
    res.json({ hasDefaultAdmin: defaultAdmin.rows.length > 0 });
  } catch (error) {
    console.error('Failed to check default admin status:', error);
    res.status(500).json({ error: 'Failed to check default admin status' });
  }
});

// Delete default admin user (only if another admin exists)
router.delete('/default-admin', async (req, res) => {
  try {
    // Check if default admin exists
    const defaultAdmin = await query(
      `SELECT id FROM users WHERE email = 'admin@ampedfieldops.com' AND role = 'admin' LIMIT 1`
    );

    if (defaultAdmin.rows.length === 0) {
      return res.json({ message: 'Default admin does not exist' });
    }

    // Check if there's at least one other admin
    const otherAdmins = await query(
      `SELECT id FROM users WHERE role = 'admin' AND email != 'admin@ampedfieldops.com' LIMIT 1`
    );

    if (otherAdmins.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Cannot delete default admin: No other admin exists. Please create a new admin first.' 
      });
    }

    // Delete default admin
    await query(
      `DELETE FROM users WHERE email = 'admin@ampedfieldops.com' AND role = 'admin'`
    );

    res.json({ message: 'Default admin deleted successfully' });
  } catch (error) {
    console.error('Failed to delete default admin:', error);
    res.status(500).json({ error: 'Failed to delete default admin' });
  }
});

// Step 1: Create admin account via Supabase Auth
router.post('/admin',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  body('company_name').optional().trim(),
  body('timezone').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, company_name, timezone } = req.body;

    try {
      // Import Supabase client
      const { supabase } = require('../db/supabase');
      
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase client not initialized' });
      }

      // Check if admin already exists
      const { data: existingUsers } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      if (existingUsers && existingUsers.length > 0) {
        return res.status(400).json({ error: 'Admin account already exists' });
      }

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          name,
          role: 'admin'
        },
        email_confirm: true
      });

      if (authError || !authData.user) {
        console.error('Supabase auth error:', authError);
        return res.status(400).json({ error: authError?.message || 'Failed to create auth user' });
      }

      const userId = authData.user.id;

      // Create user profile in public.users
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email,
          password_hash: '', // Empty since Supabase Auth handles password
          name,
          role: 'admin',
          is_active: true
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Try to delete the auth user if profile creation fails
        await supabase.auth.admin.deleteUser(userId);
        return res.status(400).json({ error: 'Failed to create user profile' });
      }

      // Generate Supabase session token (use admin API to create session)
      const { data: sessionData } = await supabase.auth.admin.getUserById(userId);
      
      // Get the user's session token by signing them in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError || !signInData.session) {
        console.error('Sign in error:', signInError);
        return res.status(400).json({ error: 'Failed to create session' });
      }

      const token = signInData.session.access_token;

      // Set company settings if provided
      if (company_name) {
        await supabase
          .from('app_settings')
          .upsert({
            key: 'company_name',
            value: company_name,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
      }

      if (timezone) {
        await supabase
          .from('app_settings')
          .upsert({
            key: 'timezone',
            value: timezone,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
      }

      // Mark setup as completed
      await supabase
        .from('app_settings')
        .upsert({
          key: 'setup_completed',
          value: 'true',
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      res.status(201).json({
        user: {
          id: userId,
          email,
          name,
          role: 'admin'
        },
        token,
        completed: true
      });
    } catch (error) {
      console.error('Admin creation error:', error);
      res.status(500).json({ error: 'Failed to create admin account' });
    }
  }
);

// Step 2: Upload company logo
router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageInitError: any) {
      log.error('Failed to initialize storage provider for setup logo', storageInitError);
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
        errorMessage: storageError.message,
        errorStack: storageError.stack
      });
      return res.status(500).json({ 
        error: 'Failed to upload logo',
        message: env.NODE_ENV === 'development' ? storageError.message : 'An error occurred while uploading the logo'
      });
    }

    // Save logo URL to settings
    await query(
      `UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE key = 'company_logo' AND user_id IS NULL`,
      [logoUrl]
    );

    // Insert if doesn't exist
    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('company_logo', $1, NULL)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [logoUrl]
    );

    res.json({ logo_url: logoUrl });
  } catch (error: any) {
    log.error('Setup logo upload error', error, {
      errorMessage: error.message,
      errorStack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to upload logo',
      message: env.NODE_ENV === 'development' ? error.message : 'An error occurred while uploading the logo'
    });
  }
});

// Step 2: Update company details
router.post('/company',
  body('company_name').trim().notEmpty(),
  body('timezone').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { company_name, timezone } = req.body;

    try {
      await query(
        `INSERT INTO settings (key, value, user_id)
         VALUES ('company_name', $1, NULL)
         ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [company_name]
      );

      if (timezone) {
        await query(
          `INSERT INTO settings (key, value, user_id)
           VALUES ('timezone', $1, NULL)
           ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
          [timezone]
        );
      }

      res.json({ message: 'Company details updated', step: 3 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update company details' });
    }
  }
);

// Step 3: Add initial client (optional)
router.post('/client',
  body('name').trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, contact_name, email, phone, address } = req.body;

    try {
      const result = await query(
        `INSERT INTO clients (name, contact_name, email, phone, address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, contact_name, email, phone, address]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create client' });
    }
  }
);

// Complete setup
router.post('/complete', async (req, res) => {
  try {
    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('setup_completed', 'true', NULL)
       ON CONFLICT (key, user_id) DO UPDATE SET value = 'true', updated_at = CURRENT_TIMESTAMP`
    );

    res.json({ message: 'Setup completed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

// Get company settings (public - for login page branding)
router.get('/branding', async (req, res) => {
  try {
    const settings = await query(
      `SELECT key, value FROM settings 
       WHERE key IN ('company_name', 'company_logo', 'company_favicon') AND user_id IS NULL`
    );

    const result: any = {};
    settings.rows.forEach(row => {
      result[row.key] = row.value;
    });

    res.json({
      company_name: result.company_name || 'AmpedFieldOps',
      company_logo: result.company_logo || null,
      company_favicon: result.company_favicon || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

export default router;
