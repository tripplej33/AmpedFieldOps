import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getDefaultPermissions } from '../lib/permissions';
import { log } from '../lib/logger';

const router = Router();
const supabase = supabaseClient!;

// Get all users (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, role, avatar_url, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      log.error('Get users error', error, { userId: req.user?.id });
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Get permissions for each user
    const usersWithPermissions = await Promise.all(
      (users || []).map(async (user) => {
        const { data: userPerms, error: permError } = await supabase
          .from('user_permissions')
          .select('permission_id')
          .eq('user_id', user.id);

        if (permError) {
          log.warn('Failed to load permissions for user', { 
            userId: user.id, 
            error: permError.message 
          });
        }

        // Map permission IDs to names
        let permissions: any[] = [];
        if (userPerms && userPerms.length > 0) {
          const { data: permNames } = await supabase
            .from('permissions')
            .select('id, name')
            .in('id', userPerms.map((p) => p.permission_id));

          if (permNames) {
            permissions = permNames.map((p) => ({ 
              id: p.id, 
              name: p.name 
            }));
          }
        }

        return {
          ...user,
          permissions
        };
      })
    );

    res.json(usersWithPermissions);
  } catch (error: any) {
    log.error('Unexpected error fetching users', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user
router.get('/:id', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, avatar_url, created_at, updated_at')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    const { data: userPerms, error: permError } = await supabase
      .from('user_permissions')
      .select('permission_id')
      .eq('user_id', req.params.id);

    if (permError) {
      log.warn('Failed to load permissions', { userId: req.params.id });
    }

    // Map permission IDs to names
    let permissions: any[] = [];
    if (userPerms && userPerms.length > 0) {
      const { data: permNames } = await supabase
        .from('permissions')
        .select('id, name')
        .in('id', userPerms.map((p) => p.permission_id));

      if (permNames) {
        permissions = permNames.map((p) => ({ id: p.id, name: p.name }));
      }
    }

    res.json({
      ...user,
      permissions
    });
  } catch (error: any) {
    log.error('Get user error', error, { userId: req.user?.id, targetUserId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (admin only)
router.post('/', authenticate, requireRole('admin'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  body('role').isIn(['admin', 'manager', 'user']),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role } = req.body;

    try {
      // Check if user already exists in public.users
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Create auth user via admin API
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          name,
          role
        }
      });

      if (authError) {
        log.error('Failed to create auth user', authError, { email });
        return res.status(500).json({ error: 'Failed to create user' });
      }

      // Create user profile in public.users (linked to auth user via id)
      const { data: newUser, error: profileError } = await supabase
        .from('users')
        .insert([{
          id: authUser.user.id,
          email,
          name,
          role
        }])
        .select()
        .single();

      if (profileError) {
        log.error('Failed to create user profile', profileError, { authUserId: authUser.user.id });
        return res.status(500).json({ error: 'Failed to create user profile' });
      }

      // Set default permissions based on role
      const defaultPermissions = getDefaultPermissions(role);
      if (defaultPermissions.length > 0) {
        const permInserts = defaultPermissions.map((permId: string) => ({
          user_id: newUser.id,
          permission_id: permId
        }));

        const { error: permError } = await supabase
          .from('user_permissions')
          .insert(permInserts);

        if (permError) {
          log.warn('Failed to set default permissions', { error: permError.message });
        }
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create_user', 'user', newUser.id, JSON.stringify({ email, role })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.status(201).json({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        created_at: newUser.created_at
      });
    } catch (error: any) {
      log.error('Create user unexpected error', error, { userId: req.user?.id, email });
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user (admin only)
router.put('/:id', authenticate, requireRole('admin'),
  body('name').optional().trim().notEmpty(),
  body('role').optional().isIn(['admin', 'manager', 'user']),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, role } = req.body;

    try {
      // Check if user exists and get current role
      const { data: user, error: notFoundError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', id)
        .single();

      if (notFoundError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Build update object
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (role !== undefined) updateData.role = role;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      // Update user profile
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        log.error('Failed to update user', updateError, { userId: id });
        return res.status(500).json({ error: 'Failed to update user' });
      }

      // If role changed, reset permissions to default for new role
      if (role && role !== user.role) {
        // Delete existing permissions
        const { error: deleteError } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', id);

        if (deleteError) {
          log.warn('Failed to delete old permissions', { error: deleteError.message, userId: id });
        }

        // Set default permissions for new role
        const defaultPermissions = getDefaultPermissions(role);
        if (defaultPermissions.length > 0) {
          const permInserts = defaultPermissions.map((permId: string) => ({
            user_id: id,
            permission_id: permId
          }));

          const { error: permError } = await supabase
            .from('user_permissions')
            .insert(permInserts);

          if (permError) {
            log.warn('Failed to set new permissions', { error: permError.message, userId: id });
          }
        }
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update_user', 'user', id, JSON.stringify({ name, role })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.json(updatedUser);
    } catch (error: any) {
      log.error('Update user unexpected error', error, { userId: req.user?.id, targetId: id });
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Update user permissions (admin only)
router.put('/:id/permissions', authenticate, requireRole('admin'),
  body('permissions').isArray(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { permissions } = req.body;
    const { id } = req.params;

    try {
      // Validate user exists
      const { data: user, error: notFoundError } = await supabase
        .from('users')
        .select('id')
        .eq('id', id)
        .single();

      if (notFoundError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Delete existing permissions
      const { error: deleteError } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', id);

      if (deleteError) {
        log.error('Failed to delete permissions', deleteError, { userId: id });
        return res.status(500).json({ error: 'Failed to update permissions' });
      }

      // Insert new permissions
      if (permissions.length > 0) {
        const permInserts = permissions.map((perm: any) => ({
          user_id: id,
          permission_id: perm.permission_id || perm.id  // Support both formats
        }));

        const { error: insertError } = await supabase
          .from('user_permissions')
          .insert(permInserts);

        if (insertError) {
          log.error('Failed to insert permissions', insertError, { userId: id });
          return res.status(500).json({ error: 'Failed to update permissions' });
        }
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update_permissions', 'user', id, JSON.stringify({ permissions })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.json({ message: 'Permissions updated', permissions_count: permissions.length });
    } catch (error: any) {
      log.error('Update permissions unexpected error', error, { userId: req.user?.id, targetId: id });
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  }
);

// Delete user (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    // Prevent self-deletion
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const { data: user, error: notFoundError } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    if (notFoundError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user permissions first (foreign key constraint)
    const { error: permDeleteError } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', id);

    if (permDeleteError) {
      log.warn('Failed to delete permissions', { error: permDeleteError.message, userId: id });
    }

    // Delete user
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteError) {
      log.error('Failed to delete user', deleteError, { userId: id });
      return res.status(500).json({ error: 'Failed to delete user' });
    }

    // Log activity (skipped - activity_logs table not yet migrated)
    // TODO: Implement activity logging in Supabase
    /*
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'delete_user', 'user', id, JSON.stringify({ deleted_user_id: id })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }
    */

    res.json({ message: 'User deleted' });
  } catch (error: any) {
    log.error('Delete user unexpected error', error, { userId: req.user?.id, targetId: id });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
