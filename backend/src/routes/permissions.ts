import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { log } from '../lib/logger';

const router = Router();
const supabase = supabaseClient!;

// Get all permissions (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('is_system', { ascending: false })
      .order('label', { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    log.error('Get permissions error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Get single permission (admin only)
router.get('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Permission not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    log.error('Get permission error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch permission' });
  }
});

// Create custom permission (admin only)
router.post('/', authenticate, requireRole('admin'),
  body('key').trim().notEmpty().matches(/^[a-z_]+$/).withMessage('Key must be lowercase with underscores'),
  body('label').trim().notEmpty(),
  body('description').optional().trim(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { key, label, description } = req.body;

    try {
      // Check if permission key already exists
      const { count } = await supabase
        .from('permissions')
        .select('*', { count: 'exact', head: true })
        .eq('key', key);

      if ((count || 0) > 0) {
        return res.status(400).json({ error: 'Permission key already exists' });
      }

      const { data, error } = await supabase
        .from('permissions')
        .insert({ key, label, description: description || '', is_system: false, is_custom: true, is_active: true })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create', 'permission', data.id, JSON.stringify({ key, label })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.status(201).json(data);
    } catch (error) {
      log.error('Create permission error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to create permission' });
    }
  }
);

// Update permission (admin only)
router.put('/:id', authenticate, requireRole('admin'),
  body('label').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('is_active').optional().isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { label, description, is_active } = req.body;

    try {
      // Check if permission exists
      const { data: existing, error: getError } = await supabase
        .from('permissions')
        .select('id, is_system')
        .eq('id', req.params.id)
        .single();

      if (getError) {
        if (getError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Permission not found' });
        }
        throw getError;
      }

      const permission = existing as any;

      // System permissions can only have label/description updated
      if (permission.is_system) {
        const updates: any = {};
        
        if (label !== undefined) updates.label = label;
        if (description !== undefined) updates.description = description;

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update for system permission' });
        }

        const { data, error } = await supabase
          .from('permissions')
          .update(updates)
          .eq('id', req.params.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        // Log activity (skipped - activity_logs table not yet migrated)
        // TODO: Implement activity logging in Supabase
        /*
        try {
          await query(
            `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user!.id, 'update', 'permission', req.params.id, JSON.stringify({ label, description })]
          );
        } catch (logError) {
          log.warn('Failed to log activity', { error: logError });
        }
        */

        return res.json(data);
      }

      // Custom permissions can be fully updated
      const updates: any = {};
      
      if (label !== undefined) updates.label = label;
      if (description !== undefined) updates.description = description;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const { data, error } = await supabase
        .from('permissions')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update', 'permission', req.params.id, JSON.stringify({ label, description, is_active })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.json(data);
    } catch (error) {
      log.error('Update permission error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to update permission' });
    }
  }
);

// Delete custom permission (admin only, cannot delete system permissions)
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if permission exists and is custom
    const { data: existing, error: getError } = await supabase
      .from('permissions')
      .select('id, is_system, key')
      .eq('id', req.params.id)
      .single();

    if (getError) {
      if (getError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Permission not found' });
      }
      throw getError;
    }

    const permission = existing as any;

    if (permission.is_system) {
      return res.status(400).json({ error: 'Cannot delete system permissions' });
    }

    // Check if permission is assigned to any users
    const { count } = await supabase
      .from('user_permissions')
      .select('*', { count: 'exact', head: true })
      .eq('permission', permission.key);

    if ((count || 0) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete permission that is assigned to users. Remove assignments first.' 
      });
    }

    const { error: deleteError } = await supabase
      .from('permissions')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) {
      throw deleteError;
    }

    // Log activity (skipped - activity_logs table not yet migrated)
    // TODO: Implement activity logging in Supabase
    /*
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'delete', 'permission', req.params.id, JSON.stringify({ key: permission.key })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }
    */

    res.json({ message: 'Permission deleted' });
  } catch (error) {
    log.error('Delete permission error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete permission' });
  }
});

export default router;

