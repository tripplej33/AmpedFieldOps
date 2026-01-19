import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { parsePaginationParams, createPaginatedResponse } from '../lib/pagination';
import { log } from '../lib/logger';

const router = Router();
const supabase = supabaseClient!;

// Get all clients
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, sort = 'name', order = 'asc', client_type } = req.query;
    
    // Parse pagination parameters
    const { page, limit, offset } = parsePaginationParams(req.query);

    // Build base query
    let query_builder = supabase
      .from('clients')
      .select(
        `id, name, email, phone, address, city, state, postal_code, country, website, is_active, created_at, updated_at, created_by`,
        { count: 'exact' }
      );

    // Apply filters
    if (status) {
      query_builder = query_builder.eq('status', status);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query_builder = query_builder.or(
        `name.ilike.${searchTerm},address.ilike.${searchTerm}`
      );
    }

    // client_type filter removed - column doesn't exist in Supabase schema

    // Apply sorting
    const validSorts = ['name', 'created_at'];
    const sortStr = typeof sort === 'string' ? sort : 'name';
    const sortColumn = validSorts.includes(sortStr) ? sortStr : 'name';
    const orderStr = typeof order === 'string' ? order : 'asc';
    const sortOrder = orderStr === 'desc' ? false : true;
    query_builder = query_builder.order(sortColumn, { ascending: sortOrder });

    // Apply pagination
    const { data: clients, error, count: total } = await query_builder
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Get clients error', error, { userId: req.user?.id });
      return res.status(500).json({ 
        error: 'Failed to fetch clients',
        details: env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Enhance client data with aggregations (these require additional queries)
    // For now, keeping it simple - aggregations could be added back if needed
    const paginatedResponse = createPaginatedResponse(
      clients || [], 
      total || 0, 
      page, 
      limit
    );
    
    res.json(paginatedResponse);
  } catch (error: any) {
    log.error('Get clients error', error, { userId: req.user?.id });
    const errorMessage = error.message || 'Failed to fetch clients';
    res.status(500).json({ 
      error: 'Failed to fetch clients',
      details: env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Get single client
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Client not found' });
      }
      throw error;
    }

    // Get related projects
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, status, budget, actual_cost')
      .eq('client_id', req.params.id)
      .order('created_at', { ascending: false });

    if (projectsError) {
      log.warn('Failed to fetch projects for client', { 
        clientId: req.params.id, 
        error: projectsError.message 
      });
    }

    res.json({
      ...client,
      projects: projects || []
    });
  } catch (error: any) {
    log.error('Get client error', error, { userId: req.user?.id, clientId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create client
router.post('/', authenticate, requirePermission('can_manage_clients'),
  body('name').trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, notes } = req.body;

    try {
      const { data: client, error } = await supabase
        .from('clients')
        .insert([{
          name,
          contact_name,
          email,
          phone,
          address,
          location,
          billing_address,
          billing_email,
          client_type: client_type || 'customer',
          notes
        }])
        .select()
        .single();

      if (error) {
        log.error('Create client error', error, { userId: req.user?.id });
        return res.status(500).json({ error: 'Failed to create client' });
      }

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create', 'client', client.id, JSON.stringify({ name })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.status(201).json(client);
    } catch (error: any) {
      log.error('Create client unexpected error', error, { userId: req.user?.id });
      res.status(500).json({ error: 'Failed to create client' });
    }
  }
);

// Update client
router.put('/:id', authenticate, requirePermission('can_manage_clients'),
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  async (req: AuthRequest, res: Response) => {
    const { name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, status, notes, xero_contact_id } = req.body;

    try {
      const updates: any = {};
      const fields = { name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, status, notes, xero_contact_id };
      
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const { data: client, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {  // not found
          return res.status(404).json({ error: 'Client not found' });
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
          [req.user!.id, 'update', 'client', req.params.id, JSON.stringify(updates)]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.json(client);
    } catch (error: any) {
      log.error('Update client error', error, { userId: req.user?.id, clientId: req.params.id });
      res.status(500).json({ error: 'Failed to update client' });
    }
  }
);

// Delete client
router.delete('/:id', authenticate, requirePermission('can_manage_clients'), async (req: AuthRequest, res: Response) => {
  try {
    // Check for related projects
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id', { count: 'exact' })
      .eq('client_id', req.params.id);

    if (projectError) {
      throw projectError;
    }

    if ((projects?.length || 0) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete client with existing projects. Deactivate instead.' 
      });
    }

    // Get client info before deletion for logging
    const { data: clientToDelete } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', req.params.id)
      .single();

    if (!clientToDelete) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id);

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
        [req.user!.id, 'delete', 'client', req.params.id, JSON.stringify({ client_id: req.params.id })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }
    */

    res.json({ message: 'Client deleted' });
  } catch (error: any) {
    log.error('Delete client error', error, { userId: req.user?.id, clientId: req.params.id });
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
