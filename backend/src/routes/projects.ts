import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, getClient } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { parsePaginationParams, createPaginatedResponse } from '../lib/pagination';
import { log } from '../lib/logger';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { resolveStoragePath } from '../lib/storage/pathUtils';

const router = Router();
const supabase = supabaseClient!;

// Get all projects
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, client_id, search, sort = 'created_at', order = 'desc' } = req.query;
    
    // Parse pagination parameters
    const { page, limit, offset } = parsePaginationParams(req.query);

    // Build base query with client info
    let query_builder = supabase
      .from('projects')
      .select(`
        id, name, description, client_id, status, budget, 
        start_date, end_date, is_billable, hourly_rate, is_active, created_at, updated_at, created_by,
        clients(id, name)
      `, { count: 'exact' });

    // Apply filters
    if (status) {
      query_builder = query_builder.eq('status', status);
    }

    if (client_id) {
      query_builder = query_builder.eq('client_id', client_id);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query_builder = query_builder.or(
        `name.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    // Apply sorting
    const validSorts = ['name', 'created_at', 'budget', 'status'];
    const sortStr = typeof sort === 'string' ? sort : 'created_at';
    const sortColumn = validSorts.includes(sortStr) ? sortStr : 'created_at';
    const orderStr = typeof order === 'string' ? order : 'desc';
    const sortOrder = orderStr === 'asc' ? true : false;
    query_builder = query_builder.order(sortColumn, { ascending: sortOrder });

    // Apply pagination
    const { data: projects, error, count: total } = await query_builder
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Get projects error', error, { userId: req.user?.id });
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    // Enhance with cost center info (separate query)
    const enhancedProjects = await Promise.all(
      (projects || []).map(async (project: any) => {
        const { data: costCenters } = await supabase
          .from('project_cost_centers')
          .select('cost_centers(id, name)')
          .eq('project_id', project.id);

        return {
          ...project,
          client_name: project.clients?.name || null,
          cost_centers: costCenters?.map((cc: any) => cc.cost_centers) || []
        };
      })
    );

    const paginatedResponse = createPaginatedResponse(
      enhancedProjects, 
      total || 0, 
      page, 
      limit
    );
    
    res.json(paginatedResponse);
  } catch (error: any) {
    log.error('Get projects error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id, name, description, client_id, status, budget,
        start_date, end_date, is_billable, hourly_rate, is_active, created_at, updated_at, created_by,
        clients(id, name)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'Project not found' });
      }
      throw error;
    }

    const projectData = project as any;

    // Get cost centers
    const { data: costCenterData } = await supabase
      .from('project_cost_centers')
      .select('cost_centers(id, name)')
      .eq('project_id', req.params.id);

    const costCenters = costCenterData?.map((cc: any) => cc.cost_centers) || [];

    // Get recent timesheets
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select(`
        id, user_id, project_id, date, hours, notes, billing_status,
        users(id, name),
        activity_types(id, name)
      `)
      .eq('project_id', req.params.id)
      .order('date', { ascending: false })
      .limit(10);

    // Calculate financials
    const financials = {
      budget: projectData.budget || 0,
      available_budget: projectData.budget || 0
    };

    res.json({
      ...projectData,
      client_name: projectData.clients?.name || null,
      cost_centers: costCenters,
      timesheets: timesheets || [],
      financials
    });
  } catch (error: any) {
    log.error('Get project error', error, { userId: req.user?.id, projectId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Get project financials
router.get('/:id/financials', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, name, budget, actual_cost, created_by')
      .eq('id', req.params.id)
      .single();

    if (error || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Return simplified financial summary
    res.json({
      project: project,
      financials: { 
        budget: project.budget || 0,
        available_budget: project.budget || 0
      }
    });
  } catch (error) {
    log.error('Failed to fetch project financials', error, { projectId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch project financials' });
  }
});

// Create project
router.post('/', authenticate, requirePermission('can_edit_projects'),
  body('name').trim().notEmpty(),
  body('client_id').optional().isUUID(),
  body('budget').optional().isNumeric(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, client_id, status = 'quoted', budget = 0, description, start_date, end_date, cost_center_ids = [] } = req.body;

    try {
      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert([{
          name,
          client_id,
          status,
          budget,
          description,
          start_date,
          end_date,
          created_by: req.user!.id
        }])
        .select()
        .single();

      if (projectError) {
        log.error('Create project error', projectError, { userId: req.user?.id, projectName: name });
        return res.status(500).json({ error: 'Failed to create project' });
      }

      // Add cost centers
      if (cost_center_ids.length > 0) {
        const costCenterInserts = cost_center_ids.map((ccId: string) => ({
          project_id: project.id,
          cost_center_id: ccId
        }));
        
        const { error: ccError } = await supabase
          .from('project_cost_centers')
          .insert(costCenterInserts);

        if (ccError) {
          log.warn('Failed to add cost centers', { error: ccError.message });
        }
      }

      // Log activity
      try {
        await supabase
          .from('activity_logs')
          .insert({
            user_id: req.user!.id,
            action: 'create',
            entity_type: 'project',
            entity_id: project.id,
            details: { name }
          });
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }

      res.status(201).json(project);
    } catch (error: any) {
      log.error('Create project unexpected error', error, { userId: req.user?.id, projectName: name });
      res.status(500).json({ error: 'Failed to create project' });
    }
  }
);

// Update project
router.put('/:id', authenticate, requirePermission('can_edit_projects'),
  async (req: AuthRequest, res: Response) => {
    const { name, client_id, status, budget, description, start_date, end_date, cost_center_ids, is_billable, hourly_rate } = req.body;

    try {
      const updates: any = {};
      const fields = { name, client_id, status, budget, description, start_date, end_date, is_billable, hourly_rate };
      
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { data: project, error } = await supabase
          .from('projects')
          .update(updates)
          .eq('id', req.params.id)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {  // not found
            return res.status(404).json({ error: 'Project not found' });
          }
          throw error;
        }
      }

      // Update cost centers if provided
      if (cost_center_ids !== undefined) {
        // Delete existing
        const { error: deleteError } = await supabase
          .from('project_cost_centers')
          .delete()
          .eq('project_id', req.params.id);

        if (deleteError) {
          log.warn('Failed to delete old cost centers', { error: deleteError.message });
        }

        // Insert new
        if (cost_center_ids.length > 0) {
          const costCenterInserts = cost_center_ids.map((ccId: string) => ({
            project_id: req.params.id,
            cost_center_id: ccId
          }));
          
          const { error: insertError } = await supabase
            .from('project_cost_centers')
            .insert(costCenterInserts);

          if (insertError) {
            log.warn('Failed to add new cost centers', { error: insertError.message });
          }
        }
      }

      // Get updated project
      const { data: project } = await supabase
        .from('projects')
        .select(`
          id, name, description, client_id, status, budget,
          start_date, end_date, is_billable, hourly_rate, is_active, created_at, updated_at, created_by,
          clients(id, name)
        `)
        .eq('id', req.params.id)
        .single();

      const projectData = project as any;

      // Log activity (skipped - activity_logs table not yet migrated)
      // TODO: Implement activity logging in Supabase
      /*
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update', 'project', req.params.id, JSON.stringify(fields)]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }
      */

      res.json({
        ...projectData,
        client_name: projectData?.clients?.name || null
      });
    } catch (error: any) {
      log.error('Update project error', error, { userId: req.user?.id, projectId: req.params.id });
      res.status(500).json({ error: 'Failed to update project' });
    }
  }
);

// Delete project
router.delete('/:id', authenticate, requirePermission('can_edit_projects'), async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.id;

    // Get project info before deletion
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all associated files before deletion
    const { data: projectFiles } = await supabase
      .from('project_files')
      .select('id, file_path')
      .eq('project_id', projectId);

    // Get all timesheet images
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('id, image_urls')
      .eq('project_id', projectId);

    // Get all safety document PDFs
    const { data: safetyDocuments } = await supabase
      .from('safety_documents')
      .select('id, file_path')
      .eq('project_id', projectId)
      .not('file_path', 'is', null);

    // Delete project from database
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (deleteError) {
      throw deleteError;
    }

    // Cleanup orphaned files in parallel (don't block response)
    const storage = await StorageFactory.getInstance();
    const cleanupPromises: Promise<void>[] = [];

    // Cleanup project files
    for (const file of projectFiles || []) {
      if (file.file_path && !file.file_path.startsWith('http://') && !file.file_path.startsWith('https://')) {
        const storagePath = resolveStoragePath(file.file_path);
        cleanupPromises.push(
          storage.delete(storagePath).catch((err) => {
            log.error('Failed to delete project file', err, { fileId: file.id, path: storagePath });
          })
        );
      }
    }

    // Cleanup timesheet images
    for (const timesheet of timesheets || []) {
      const imageUrls = timesheet.image_urls || [];
      for (const imageUrl of imageUrls) {
        if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          const storagePath = resolveStoragePath(imageUrl);
          cleanupPromises.push(
            storage.delete(storagePath).catch((err) => {
              log.error('Failed to delete timesheet image', err, { timesheetId: timesheet.id, path: storagePath });
            })
          );
        }
      }
    }

    // Cleanup safety document PDFs
    for (const doc of safetyDocuments || []) {
      if (doc.file_path && !doc.file_path.startsWith('http://') && !doc.file_path.startsWith('https://')) {
        const storagePath = resolveStoragePath(doc.file_path);
        cleanupPromises.push(
          storage.delete(storagePath).catch((err) => {
            log.error('Failed to delete safety document PDF', err, { docId: doc.id, path: storagePath });
          })
        );
      }
    }

    // Run cleanup in background (don't await)
    Promise.all(cleanupPromises).then(() => {
      log.info('Project cleanup completed', { projectId, filesDeleted: cleanupPromises.length });
    }).catch((err) => {
      log.error('Error during project cleanup', err, { projectId });
    });

    // Log activity (skipped - activity_logs table not yet migrated)
    // TODO: Implement activity logging in Supabase
    /*
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'delete', 'project', projectId, JSON.stringify({ name: project.name })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }
    */

    res.json({ message: 'Project deleted' });
  } catch (error: any) {
    log.error('Delete project error', error, { projectId: req.params.id });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
