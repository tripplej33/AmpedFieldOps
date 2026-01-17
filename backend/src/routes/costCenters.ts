import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { log } from '../lib/logger';

const router = Router();
const supabase = supabaseClient!;

// Get all cost centers
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { active_only } = req.query;
    
    let query_builder = supabase
      .from('cost_centers')
      .select('*');

    if (active_only === 'true') {
      query_builder = query_builder.eq('is_active', true);
    }

    const { data, error } = await query_builder.order('code', { ascending: true });

    if (error) {
      log.error('Get cost centers error', error, { userId: req.user?.id });
      return res.status(500).json({ error: 'Failed to fetch cost centers' });
    }

    // Add aggregations for each cost center
    const costCentersWithAgg = await Promise.all(
      (data || []).map(async (cc) => {
        const { count: projectCount } = await supabase
          .from('project_cost_centers')
          .select('*', { count: 'exact', head: true })
          .eq('cost_center_id', cc.id);

        const { data: timesheetData } = await supabase
          .from('timesheets')
          .select('hours, activity_types(hourly_rate)')
          .eq('cost_center_id', cc.id);

        const totalHours = (timesheetData || []).reduce((sum: number, t: any) => sum + (t.hours || 0), 0);
        const totalCost = (timesheetData || []).reduce((sum: number, t: any) => {
          const rate = Array.isArray(t.activity_types) ? (t.activity_types[0]?.hourly_rate || 0) : (t.activity_types?.hourly_rate || 0);
          return sum + ((t.hours || 0) * rate);
        }, 0);

        return {
          ...cc,
          project_count: projectCount || 0,
          total_hours: totalHours,
          total_cost: totalCost
        };
      })
    );

    res.json(costCentersWithAgg);
  } catch (error) {
    log.error('Get cost centers error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch cost centers' });
  }
});

// Get single cost center
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('cost_centers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Cost center not found' });
      }
      throw error;
    }

    // Get related projects
    const { data: projectData } = await supabase
      .from('project_cost_centers')
      .select('projects(id, code, name, status)')
      .eq('cost_center_id', req.params.id);

    const { count: projectCount } = await supabase
      .from('project_cost_centers')
      .select('*', { count: 'exact', head: true })
      .eq('cost_center_id', req.params.id);

    const { data: timesheetData } = await supabase
      .from('timesheets')
      .select('hours')
      .eq('cost_center_id', req.params.id);

    const totalHours = (timesheetData || []).reduce((sum: number, t) => sum + (t.hours || 0), 0);

    res.json({
      ...(data as any),
      project_count: projectCount || 0,
      projects: (projectData || []).map((p: any) => Array.isArray(p.projects) ? p.projects[0] : p.projects).filter(Boolean),
      total_hours: totalHours
    });
  } catch (error) {
    log.error('Get cost center error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch cost center' });
  }
});

// Create cost center (admin only)
router.post('/', authenticate, requirePermission('can_manage_cost_centers'),
  body('code').trim().notEmpty(),
  body('name').trim().notEmpty(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, description, budget = 0, xero_tracking_category_id, client_po_number } = req.body;

    try {
      // Check for duplicate code
      const { count } = await supabase
        .from('cost_centers')
        .select('*', { count: 'exact', head: true })
        .eq('code', code);

      if ((count || 0) > 0) {
        return res.status(400).json({ error: 'Cost center code already exists' });
      }

      const { data, error } = await supabase
        .from('cost_centers')
        .insert({ 
          code, 
          name, 
          description, 
          budget, 
          xero_tracking_category_id, 
          client_po_number: client_po_number || null 
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Log activity
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create', 'cost_center', data.id, JSON.stringify({ code, name })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }

      res.status(201).json(data);
    } catch (error) {
      log.error('Create cost center error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to create cost center' });
    }
  }
);

// Update cost center (admin only)
router.put('/:id', authenticate, requirePermission('can_manage_cost_centers'),
  async (req: AuthRequest, res: Response) => {
    const { code, name, description, budget, is_active, xero_tracking_category_id, client_po_number } = req.body;

    try {
      const updates: any = {};
      
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (budget !== undefined) updates.budget = budget;
      if (is_active !== undefined) updates.is_active = is_active;
      if (xero_tracking_category_id !== undefined) updates.xero_tracking_category_id = xero_tracking_category_id;
      if (client_po_number !== undefined) updates.client_po_number = client_po_number || null;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      // Check for duplicate code if updating code
      if (code) {
        const { count } = await supabase
          .from('cost_centers')
          .select('*', { count: 'exact', head: true })
          .eq('code', code)
          .neq('id', req.params.id);

        if ((count || 0) > 0) {
          return res.status(400).json({ error: 'Cost center code already exists' });
        }
      }

      const { data, error } = await supabase
        .from('cost_centers')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {  // not found
          return res.status(404).json({ error: 'Cost center not found' });
        }
        throw error;
      }

      res.json(data);
    } catch (error) {
      log.error('Update cost center error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to update cost center' });
    }
  }
);

// Delete cost center (admin only)
router.delete('/:id', authenticate, requirePermission('can_manage_cost_centers'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if cost center is in use
    const { count } = await supabase
      .from('timesheets')
      .select('*', { count: 'exact', head: true })
      .eq('cost_center_id', req.params.id);

    if ((count || 0) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete cost center with existing timesheets. Deactivate instead.' 
      });
    }

    const { data, error } = await supabase
      .from('cost_centers')
      .delete()
      .eq('id', req.params.id)
      .select('id, code, name')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Cost center not found' });
      }
      throw error;
    }

    res.json({ message: 'Cost center deleted' });
  } catch (error) {
    log.error('Delete cost center error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete cost center' });
  }
});

export default router;
