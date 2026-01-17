import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, getClient } from '../db';
import { supabase } from '../db/supabase';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { parsePaginationParams, createPaginatedResponse } from '../lib/pagination';
import { log } from '../lib/logger';
import { PROJECT_CODE_CONSTANTS } from '../lib/constants';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { resolveStoragePath } from '../lib/storage/pathUtils';

const router = Router();

// Generate project code
const generateProjectCode = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM projects WHERE code LIKE $1`,
    [`${PROJECT_CODE_CONSTANTS.PREFIX}-${year}-%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `${PROJECT_CODE_CONSTANTS.PREFIX}-${year}-${String(count).padStart(PROJECT_CODE_CONSTANTS.PADDING_LENGTH, '0')}`;
};

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
        id, code, name, description, client_id, status, budget, actual_cost, 
        start_date, end_date, xero_project_id, files, created_at, updated_at, po_commitments, deleted_at,
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
        `name.ilike.${searchTerm},code.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    // Apply sorting
    const validSorts = ['name', 'created_at', 'budget', 'status'];
    const sortColumn = validSorts.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? true : false;
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
      (projects || []).map(async (project) => {
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
        id, code, name, description, client_id, status, budget, actual_cost,
        start_date, end_date, xero_project_id, files, created_at, updated_at, po_commitments, deleted_at,
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
      budget: project.budget || 0,
      po_commitments: project.po_commitments || 0,
      actual_cost: project.actual_cost || 0,
      available_budget: (project.budget || 0) - (project.po_commitments || 0) - (project.actual_cost || 0)
    };

    res.json({
      ...project,
      client_name: project.clients?.name || null,
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
    const projectResult = await query('SELECT id, code, name FROM projects WHERE id = $1', [req.params.id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get budget, PO commitments, and actual costs
    const financialsResult = await query(
      `SELECT 
        COALESCE(p.budget, 0) as budget,
        COALESCE(p.po_commitments, 0) as po_commitments,
        COALESCE(p.actual_cost, 0) as actual_cost,
        COALESCE(p.budget, 0) - COALESCE(p.po_commitments, 0) - COALESCE(p.actual_cost, 0) as available_budget
      FROM projects p
      WHERE p.id = $1`,
      [req.params.id]
    );

    // Get purchase orders summary
    const poSummary = await query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(total_amount), 0) as total_committed,
        COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_count,
        COUNT(*) FILTER (WHERE status = 'AUTHORISED') as authorised_count,
        COUNT(*) FILTER (WHERE status = 'BILLED') as billed_count
      FROM xero_purchase_orders
      WHERE project_id = $1`,
      [req.params.id]
    );

    // Get bills summary
    const billsSummary = await query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(amount_paid), 0) as total_paid,
        COALESCE(SUM(amount_due), 0) as total_due
      FROM xero_bills
      WHERE project_id = $1`,
      [req.params.id]
    );

    // Get expenses summary
    const expensesSummary = await query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM xero_expenses
      WHERE project_id = $1`,
      [req.params.id]
    );

    res.json({
      project: projectResult.rows[0],
      financials: financialsResult.rows[0] || { budget: 0, po_commitments: 0, actual_cost: 0, available_budget: 0 },
      purchase_orders: poSummary.rows[0] || { total_count: 0, total_committed: 0, draft_count: 0, authorised_count: 0, billed_count: 0 },
      bills: billsSummary.rows[0] || { total_count: 0, total_amount: 0, total_paid: 0, total_due: 0 },
      expenses: expensesSummary.rows[0] || { total_count: 0, total_amount: 0 }
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
      const code = await generateProjectCode();

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert([{
          code,
          name,
          client_id,
          status,
          budget,
          description,
          start_date,
          end_date
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
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create', 'project', project.id, JSON.stringify({ name, code })]
        );
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
    const { name, client_id, status, budget, actual_cost, description, start_date, end_date, cost_center_ids, xero_project_id } = req.body;

    try {
      const updates: any = {};
      const fields = { name, client_id, status, budget, actual_cost, description, start_date, end_date, xero_project_id };
      
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
          id, code, name, description, client_id, status, budget, actual_cost,
          start_date, end_date, xero_project_id, files, created_at, updated_at, po_commitments, deleted_at,
          clients(id, name)
        `)
        .eq('id', req.params.id)
        .single();

      // Log activity
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update', 'project', req.params.id, JSON.stringify(fields)]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }

      res.json({
        ...project,
        client_name: project?.clients?.name || null
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
      .select('id, name, code')
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

    // Log activity
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'delete', 'project', projectId, JSON.stringify({ name: project.name })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }

    res.json({ message: 'Project deleted' });
  } catch (error: any) {
    log.error('Delete project error', error, { projectId: req.params.id });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
