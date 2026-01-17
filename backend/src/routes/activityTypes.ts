import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { log } from '../lib/logger';

const router = Router();
const supabase = supabaseClient!;

// Get all activity types
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { active_only } = req.query;
    
    let query_builder = supabase
      .from('activity_types')
      .select('*');

    if (active_only === 'true') {
      query_builder = query_builder.eq('is_active', true);
    }

    const { data, error } = await query_builder.order('name', { ascending: true });

    if (error) {
      log.error('Get activity types error', error, { userId: req.user?.id });
      return res.status(500).json({ error: 'Failed to fetch activity types' });
    }

    // Add usage count for each activity type
    const activityTypesWithUsage = await Promise.all(
      (data || []).map(async (at) => {
        const { count } = await supabase
          .from('timesheets')
          .select('*', { count: 'exact', head: true })
          .eq('activity_type_id', at.id);
        
        return {
          ...at,
          usage_count: count || 0
        };
      })
    );

    res.json(activityTypesWithUsage);
  } catch (error) {
    log.error('Get activity types error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch activity types' });
  }
});

// Get single activity type
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('activity_types')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Activity type not found' });
      }
      throw error;
    }

    const { count } = await supabase
      .from('timesheets')
      .select('*', { count: 'exact', head: true })
      .eq('activity_type_id', req.params.id);

    res.json({
      ...(data as any),
      usage_count: count || 0
    });
  } catch (error) {
    log.error('Get activity type error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch activity type' });
  }
});

// Create activity type (admin only)
router.post('/', authenticate, requirePermission('can_edit_activity_types'),
  body('name').trim().notEmpty(),
  body('icon').trim().notEmpty(),
  body('color').trim().notEmpty(),
  body('hourly_rate').optional().isFloat({ min: 0 }),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, icon, color, hourly_rate = 0 } = req.body;

    try {
      const { data, error } = await supabase
        .from('activity_types')
        .insert({ name, icon, color, hourly_rate })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Log activity (skipped - activity_logs table not yet migrated to Supabase)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create', 'activity_type', data.id, JSON.stringify({ name })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.status(201).json(data);
    } catch (error) {
      log.error('Create activity type error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to create activity type' });
    }
  }
);

// Update activity type (admin only)
router.put('/:id', authenticate, requirePermission('can_edit_activity_types'),
  async (req: AuthRequest, res: Response) => {
    const { name, icon, color, hourly_rate, is_active } = req.body;

    try {
      const updates: any = {};
      
      if (name !== undefined) updates.name = name;
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;
      if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const { data, error } = await supabase
        .from('activity_types')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {  // not found
          return res.status(404).json({ error: 'Activity type not found' });
        }
        throw error;
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update', 'activity_type', req.params.id, JSON.stringify(updates)]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.json(data);
    } catch (error) {
      log.error('Update activity type error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to update activity type' });
    }
  }
);

// Delete activity type (admin only)
router.delete('/:id', authenticate, requirePermission('can_edit_activity_types'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if activity type is in use
    const { count } = await supabase
      .from('timesheets')
      .select('*', { count: 'exact', head: true })
      .eq('activity_type_id', req.params.id);

    if ((count || 0) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete activity type with existing timesheets. Deactivate instead.',
        usage_count: count || 0
      });
    }

    const { data, error } = await supabase
      .from('activity_types')
      .delete()
      .eq('id', req.params.id)
      .select('id, name')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Activity type not found' });
      }
      throw error;
    }

    // Log activity (skipped - activity_logs table not yet migrated)
    // TODO: Implement activity logging in Supabase
    /*
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'delete', 'activity_type', req.params.id, JSON.stringify({ name: data.name })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }
    */

    res.json({ message: 'Activity type deleted' });
  } catch (error) {
    log.error('Delete activity type error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete activity type' });
  }
});

export default router;
