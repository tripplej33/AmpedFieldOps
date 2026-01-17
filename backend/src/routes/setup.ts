import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { createClient } from '@supabase/supabase-js';
import { logoUpload, bufferToStream } from '../middleware/upload';
import { env } from '../config/env';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { generatePartitionedPath } from '../lib/storage/pathUtils';
import { log } from '../lib/logger';

const router = Router();

// Initialize Supabase client for setup operations
const supabase = createClient(
  env.SUPABASE_URL || 'http://127.0.0.1:54321',
  env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsajd4NHBob3dvcHp1dmprZ3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5ODY5NDMyMiwiZXhwIjoyMDE0MjcwMzIyfQ.DKvHYXBJVyNKKZuUpbJnjAqgx6w6NZCbcD-qPvKH9_w'
);

// Also initialize an anon client for certain operations that need to go through auth
const supabaseAnon = createClient(
  env.SUPABASE_URL || 'http://127.0.0.1:54321',
  env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsajd4NHBob3dvcHp1dmprZ3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTg2OTQzMjIsImV4cCI6MjAxNDI3MDMyMn0.VtQgVXMx20H2sFXyb1XYSZZS_7hFI7fzvM8rr0TfvZc'
);

// Check setup status
router.get('/status', async (req, res) => {
  try {
    // Check if any admin users exist in Supabase Auth
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      throw authError;
    }

    // Check if setup is marked as complete in Supabase
    const { data: setupSettings, error: setupError } = await supabase
      .from('app_settings')
      .select('setup_complete')
      .single();

    if (setupSettings?.setup_complete) {
      return res.json({ 
        completed: true,
        step: null
      });
    }

    if (!authUsers || authUsers.length === 0) {
      return res.json({ 
        completed: false, 
        step: 1,
        message: 'Create admin account'
      });
    }

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
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (error) {
      log.warn('Database error checking admins', error);
      return res.json({ hasDefaultAdmin: false });
    }

    log.info('Admin count check', { count });
    const hasAdminUsers = (count ?? 0) > 0;
    res.json({ hasDefaultAdmin: hasAdminUsers });
  } catch (error) {
    log.error('Failed to check default admin status', error as any);
    res.json({ hasDefaultAdmin: false });
  }
});

// Delete default admin user (only if another admin exists)
router.delete('/default-admin', async (req, res) => {
  try {
    // Note: This endpoint is deprecated with Supabase migration
    // Default admin management now handled via Supabase Auth
    res.json({ message: 'Default admin management handled via Supabase Auth' });
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

      // Cleanup: remove stale admin profiles in public.users without matching auth.users
      try {
        const { data: publicAdmins } = await supabase
          .from('users')
          .select('id,email')
          .eq('role', 'admin');

        const { data: authUsersList } = await supabase.auth.admin.listUsers();
        const authUsersArr = (authUsersList?.users || []) as Array<{ email?: string }>;
        const authEmails = new Set(authUsersArr.map((u) => ((u.email ?? '').toLowerCase())));

        const publicAdminsArr = (publicAdmins || []) as Array<{ id: string; email?: string }>;
        const staleAdmins = publicAdminsArr.filter((u) => !authEmails.has((u.email ?? '').toLowerCase()));
        for (const stale of staleAdmins) {
          await supabase.from('users').delete().eq('id', stale.id);
        }
      } catch (cleanupErr) {
        log.warn('Setup cleanup: failed to remove stale admin(s)', cleanupErr as any);
      }

      // Check if any admin exists in Supabase Auth (source of truth)
      const { data: authUsersList2, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) {
        return res.status(500).json({ error: 'Failed to query auth users' });
      }
      const authUsersArr2 = (authUsersList2?.users || []) as Array<{ user_metadata?: any }>;
      const hasAdminInAuth = authUsersArr2.some((u) => (u.user_metadata?.role === 'admin'));
      if (hasAdminInAuth) {
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

      // Profile is auto-created by DB trigger on auth.users insert.
      // Optionally update profile fields to ensure consistency.
      const { error: profileUpdateError } = await supabase
        .from('users')
        .update({
          name,
          role: 'admin',
          is_active: true
        })
        .eq('id', userId);

      if (profileUpdateError) {
        console.error('Profile update error:', profileUpdateError);
        // Not fatal; proceed since trigger should have created the profile
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

    // Save logo URL to Supabase app_settings
    const { error: updateError } = await supabase
      .from('app_settings')
      .update({ company_logo: logoUrl, updated_at: new Date().toISOString() })
      .is('id', null);  // Ensure we update the single row

    if (updateError) {
      // Try to insert if update fails (table might be empty)
      const { error: insertError } = await supabase
        .from('app_settings')
        .insert({ company_logo: logoUrl });
      
      if (insertError && !insertError.message.includes('duplicate')) {
        throw insertError;
      }
    }

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
      const { error: updateError } = await supabase
        .from('app_settings')
        .update({ 
          company_name, 
          timezone,
          updated_at: new Date().toISOString()
        })
        .is('id', null);

      if (updateError && !updateError.message.includes('no rows')) {
        throw updateError;
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
      const { data: client, error: insertError } = await supabase
        .from('clients')
        .insert({
          name,
          contact_name,
          email,
          phone,
          address
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      res.status(201).json(client);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create client' });
    }
  }
);

// Complete setup
router.post('/complete', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!existing) {
      return res.status(400).json({ error: 'app_settings not initialized' });
    }

    const { error: updateError } = await supabase
      .from('app_settings')
      .update({ setup_complete: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ message: 'Setup completed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

// Get company settings (public - for login page branding)
router.get('/branding', async (req, res) => {
  try {
    const { data: appSettings, error: settingsError } = await supabase
      .from('app_settings')
      .select('company_name, company_logo, company_favicon')
      .single();

    res.json({
      company_name: appSettings?.company_name || 'AmpedFieldOps',
      company_logo: appSettings?.company_logo || null,
      company_favicon: appSettings?.company_favicon || null
    });
  } catch (error) {
    // Return defaults if Supabase is unavailable
    res.json({
      company_name: 'AmpedFieldOps',
      company_logo: null,
      company_favicon: null
    });
  }
});

export default router;
