import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { projectUpload } from '../middleware/upload';
import { parsePaginationParams, createPaginatedResponse } from '../lib/pagination';
import { log } from '../lib/logger';
import { StorageFactory } from '../lib/storage/StorageFactory';
import { generatePartitionedPath, resolveStoragePath } from '../lib/storage/pathUtils';
import { bufferToStream } from '../middleware/upload';
import { supabase as supabaseClient } from '../db/supabase';

const router = Router();
const supabase = supabaseClient!;

// Rate limiting for uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit to 20 timesheet creations per 15 minutes
  message: 'Too many timesheet creation requests, please try again later.',
});

// Get all timesheets
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, project_id, client_id, date_from, date_to, cost_center_id, billing_status } = req.query;
    
    // Parse pagination parameters
    const { page, limit, offset } = parsePaginationParams(req.query);
    
    // Check if user can view all timesheets
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));

    // Build Supabase query
    let query_builder = supabase
      .from('timesheets')
      .select(`
        *,
        users!timesheets_user_id_fkey(id, name),
        projects(id, name),
        clients(id, name),
        activity_types(id, name, icon, color, hourly_rate),
        cost_centers(id, code, name)
      `, { count: 'exact' });

    // Apply user filter
    if (!canViewAll) {
      query_builder = query_builder.eq('user_id', req.user!.id);
    } else if (user_id) {
      query_builder = query_builder.eq('user_id', user_id);
    }

    // Apply additional filters
    if (project_id) {
      query_builder = query_builder.eq('project_id', project_id);
    }
    if (client_id) {
      query_builder = query_builder.eq('client_id', client_id);
    }
    if (cost_center_id) {
      query_builder = query_builder.eq('cost_center_id', cost_center_id);
    }
    if (date_from) {
      query_builder = query_builder.gte('date', date_from);
    }
    if (date_to) {
      query_builder = query_builder.lte('date', date_to);
    }
    if (billing_status) {
      query_builder = query_builder.eq('billing_status', billing_status);
    }

    // Apply ordering and pagination
    query_builder = query_builder
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query_builder;

    if (error) {
      log.error('Supabase query error', error, { userId: req.user?.id });
      return res.status(500).json({ error: 'Failed to fetch timesheets' });
    }

    // Transform Supabase response to match expected format
    const timesheets = data!.map((ts: any) => ({
      ...ts,
      user_name: ts.users?.name,
      project_name: ts.projects?.name,
      project_code: ts.projects?.code,
      client_name: ts.clients?.name,
      activity_type_name: ts.activity_types?.name,
      activity_type_icon: ts.activity_types?.icon,
      activity_type_color: ts.activity_types?.color,
      cost_center_code: ts.cost_centers?.code,
      cost_center_name: ts.cost_centers?.name,
      billing_status: ts.billing_status || 'unbilled'
    }));

    // Return paginated response
    const paginatedResponse = createPaginatedResponse(timesheets, count || 0, page, limit);
    res.json(paginatedResponse);
  } catch (error: any) {
    log.error('Get timesheets error', error, { 
      userId: req.user?.id, 
      query: req.query,
      errorMessage: error?.message
    });
    res.status(500).json({ 
      error: 'Failed to fetch timesheets',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single timesheet
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data: timesheet, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        users(id, name),
        projects(id, name),
        clients(id, name),
        activity_types(id, name),
        cost_centers(id, code)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'Timesheet not found' });
      }
      log.error('Supabase query error', error, { timesheetId: req.params.id });
      return res.status(500).json({ error: 'Failed to fetch timesheet' });
    }

    // Check permission
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));
    
    if (!canViewAll && timesheet.user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to view this timesheet' });
    }

    // Transform response
    const response = {
      ...timesheet,
      user_name: timesheet.users?.name,
      project_name: timesheet.projects?.name,
      client_name: timesheet.clients?.name,
      activity_type_name: timesheet.activity_types?.name,
      cost_center_code: timesheet.cost_centers?.code,
      billing_status: timesheet.billing_status || 'unbilled'
    };

    res.json(response);
  } catch (error: any) {
    log.error('Get timesheet error', error, { userId: req.user?.id, timesheetId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch timesheet' });
  }
});

// Create timesheet (handles both JSON and FormData with images)
router.post('/', authenticate, uploadLimiter, 
  (req, res, next) => {
    // Only use multer for multipart/form-data requests
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Handle multer errors with better messages
      projectUpload.array('images', 5)(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_COUNT') {
              return res.status(400).json({ error: 'Maximum 5 images allowed per timesheet' });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: 'File size exceeds 10MB limit. Please compress your images.' });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
              return res.status(400).json({ error: 'Unexpected file field. Use "images" field for file uploads.' });
            }
          }
          // Other multer errors (file type validation, etc.)
          return res.status(400).json({ error: err.message || 'File upload validation failed' });
        }
        next();
      });
    } else {
      // For JSON requests, skip multer
      next();
    }
  },
  async (req: AuthRequest, res: Response) => {
    // Check if this is FormData (has files) or JSON
    const files = req.files as Express.Multer.File[];
    const isFormData = files && files.length > 0;
  
  // Extract and validate required fields from body (works for both JSON and FormData)
  const { sanitizeProjectId } = await import('../middleware/validateProject');
  let project_id: string;
  try {
    project_id = sanitizeProjectId(req.body.project_id);
  } catch (validationError: any) {
    return res.status(400).json({ 
      error: 'Invalid project_id',
      details: validationError.message
    });
  }
  const timesheetDate = req.body.date;
  const hoursValue = req.body.hours;
  const timesheetActivityTypeId = req.body.activity_type_id;
  const timesheetCostCenterId = req.body.cost_center_id;
  
  // Manual validation (since express-validator doesn't work well with FormData)
  if (!project_id || !timesheetDate || hoursValue === undefined || hoursValue === null || !timesheetActivityTypeId || !timesheetCostCenterId) {
    const missing = [];
    if (!project_id) missing.push('project_id');
    if (!timesheetDate) missing.push('date');
    if (hoursValue === undefined || hoursValue === null) missing.push('hours');
    if (!timesheetActivityTypeId) missing.push('activity_type_id');
    if (!timesheetCostCenterId) missing.push('cost_center_id');
    return res.status(400).json({ 
      error: 'Missing required fields',
      missing_fields: missing,
      details: `Missing: ${missing.join(', ')}`
    });
  }
  
  const timesheetHours = parseFloat(hoursValue);
  if (isNaN(timesheetHours)) {
    return res.status(400).json({ error: 'Invalid hours value. Must be a number.' });
  }
  
  if (timesheetHours < 0.25 || timesheetHours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0.25 and 24' });
  }

  // Get image URLs from uploaded files or from body
  let imageUrls: string[] = [];
  
  if (isFormData && files.length > 0) {
    // Files were uploaded - upload to storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageError: any) {
      log.error('Failed to initialize storage provider', storageError, { project_id });
      return res.status(500).json({ 
        error: 'Failed to initialize file storage',
        details: process.env.NODE_ENV === 'development' ? storageError.message : undefined
      });
    }
    
    const basePath = `projects/${project_id}`;
    const uploadErrors: string[] = [];
    
    // Upload each file to storage provider
    for (const file of files) {
      let storagePath: string | undefined;
      try {
        // Generate partitioned path
        storagePath = generatePartitionedPath(file.originalname, basePath);
        
        // Stream file from memory buffer to storage provider
        const fileStream = bufferToStream(file.buffer);
        await storage.put(storagePath, fileStream, {
          contentType: file.mimetype,
        });
        
        // Get URL from storage provider (signed URL for S3, regular path for local)
        const fileUrl = await storage.url(storagePath);
        imageUrls.push(fileUrl);
      } catch (uploadError: any) {
        const errorMsg = `Failed to upload ${file.originalname}: ${uploadError.message}`;
        uploadErrors.push(errorMsg);
        log.error(`Failed to upload ${file.originalname} to storage`, uploadError, { 
          filename: file.originalname, 
          project_id,
          storagePath: storagePath || 'unknown',
          errorMessage: uploadError.message,
          errorStack: uploadError.stack
        });
      }
    }
    
    // If all files failed to upload, return error
    if (files.length > 0 && imageUrls.length === 0) {
      return res.status(500).json({ 
        error: 'All file uploads failed',
        details: uploadErrors.join('; ')
      });
    }
    
    // If some files failed, log warning but continue
    if (uploadErrors.length > 0) {
      log.warn('Some files failed to upload', { 
        project_id, 
        failedCount: uploadErrors.length,
        successCount: imageUrls.length,
        errors: uploadErrors
      });
    }
  } else {
    // JSON request with pre-uploaded URLs
    imageUrls = req.body.image_urls || [];
  }

  const { client_id, notes, location } = req.body;

    try {
      // Get client_id from project if not provided
      let finalClientId = client_id;
      if (!finalClientId) {
        const { data: project } = await supabase
          .from('projects')
          .select('client_id')
          .eq('id', project_id)
          .single();
        if (project) {
          finalClientId = project.client_id;
        }
      }

      // Allow user_id to be specified in request body (for admin/manager creating timesheets for other users)
      // Otherwise use the authenticated user's ID
      const userId = req.body.user_id || req.user!.id;
      
      // Validate user_id if provided (only admins/managers can create timesheets for other users)
      if (req.body.user_id && req.body.user_id !== req.user!.id) {
        const canManageOthers = req.user!.role === 'admin' || 
                                req.user!.role === 'manager' ||
                                (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));
        if (!canManageOthers) {
          return res.status(403).json({ error: 'Not authorized to create timesheets for other users' });
        }
      }

      // Create timesheet in Supabase
      const { data: newTimesheet, error: insertError } = await supabase
        .from('timesheets')
        .insert([{
          user_id: userId,
          project_id,
          client_id: finalClientId,
          date: timesheetDate,
          hours: timesheetHours,
          activity_type_id: timesheetActivityTypeId,
          cost_center_id: timesheetCostCenterId,
          notes,
          image_urls: imageUrls,
          location,
          billing_status: 'unbilled'
        }])
        .select()
        .single();

      if (insertError) {
        log.error('Failed to create timesheet', insertError, { userId: req.user!.id, project_id });
        
        if (insertError.code === '23503') { // Foreign key violation
          return res.status(400).json({ error: 'Invalid project, activity type, or cost center' });
        }
        return res.status(500).json({ error: 'Failed to create timesheet' });
      }

      // Update project actual_cost based on activity hourly rate
      const { data: activityType } = await supabase
        .from('activity_types')
        .select('hourly_rate')
        .eq('id', timesheetActivityTypeId)
        .single();

      if (activityType && activityType.hourly_rate) {
        const cost = timesheetHours * parseFloat(activityType.hourly_rate);
        await supabase
          .from('projects')
          .update({ actual_cost: supabase.rpc('update_with_math', { id: project_id, amount: cost }) })
          .eq('id', project_id);
      }

      // Log activity
      try {
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'create', 'timesheet', newTimesheet.id, JSON.stringify({ project_id, hours: timesheetHours, date: timesheetDate })]
        );
      } catch (logError) {
        log.warn('Failed to log activity', { error: logError });
      }

      res.status(201).json(newTimesheet);
    } catch (error: any) {
      log.error('Create timesheet error', error, { 
        userId: req.user!.id, 
        project_id,
        errorMessage: error?.message
      });
      res.status(500).json({ 
        error: 'Failed to create timesheet',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Update timesheet (handles both JSON and FormData with images)
router.put('/:id', authenticate, 
  (req, res, next) => {
    // Validate file count before multer processes
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Let multer handle validation, but catch errors
      projectUpload.array('images', 5)(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_COUNT') {
              return res.status(400).json({ error: 'Maximum 5 images allowed' });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: 'File size exceeds 10MB limit' });
            }
          }
          // Other multer errors (file type, etc.)
          return res.status(400).json({ error: err.message || 'File upload error' });
        }
        next();
      });
    } else {
      next();
    }
  },
  async (req: AuthRequest, res: Response) => {
    // Check if this is FormData (has files) or JSON
    const files = req.files as Express.Multer.File[];
    const isFormData = files && files.length > 0;
    
    // Extract fields from body (works for both JSON and FormData)
    const { sanitizeProjectId } = await import('../middleware/validateProject');
    let project_id: string;
    try {
      project_id = sanitizeProjectId(req.body.project_id);
    } catch (validationError: any) {
      return res.status(400).json({ 
        error: 'Invalid project_id',
        details: validationError.message
      });
    }
    const date = req.body.date;
    const hours = req.body.hours ? parseFloat(req.body.hours) : undefined;
    const activity_type_id = req.body.activity_type_id;
    const cost_center_id = req.body.cost_center_id;
    const notes = req.body.notes;
    const location = req.body.location;
    const synced = req.body.synced;
    const user_id = req.body.user_id;
    
    // Get image URLs from uploaded files or from body
    let imageUrls: string[] = [];
    
    if (isFormData && files.length > 0) {
      // Files were uploaded - upload to storage provider
      let storage;
      try {
        storage = await StorageFactory.getInstance();
      } catch (storageError: any) {
        log.error('Failed to initialize storage provider', storageError, { project_id, timesheetId: req.params.id });
        return res.status(500).json({ 
          error: 'Failed to initialize file storage',
          details: process.env.NODE_ENV === 'development' ? storageError.message : undefined
        });
      }
      const basePath = `projects/${project_id}`;
      
      // Upload each new file to storage provider
      for (const file of files) {
        let storagePath: string | undefined;
        try {
          storagePath = generatePartitionedPath(file.originalname, basePath);
          const fileStream = bufferToStream(file.buffer);
          await storage.put(storagePath, fileStream, {
            contentType: file.mimetype,
          });
          const fileUrl = await storage.url(storagePath);
          imageUrls.push(fileUrl);
        } catch (uploadError: any) {
          log.error(`Failed to upload ${file.originalname} to storage`, uploadError, { 
            filename: file.originalname, 
            project_id,
            timesheetId: req.params.id
          });
        }
      }
      
      // Also include any existing image URLs from body
      if (req.body.image_urls) {
        try {
          const existingUrls = typeof req.body.image_urls === 'string' 
            ? JSON.parse(req.body.image_urls) 
            : req.body.image_urls;
          imageUrls = [...imageUrls, ...existingUrls];
        } catch (e) {
          // If parsing fails, just use the new files
        }
      }
    } else {
      // JSON request with pre-uploaded URLs or existing URLs
      imageUrls = req.body.image_urls || [];
    }

    try {
      // Check ownership or permission - fetch existing timesheet via Supabase
      const { data: existing, error: fetchError } = await supabase
        .from('timesheets')
        .select('user_id, hours, project_id, activity_type_id, billing_status, activity_types(hourly_rate)')
        .eq('id', req.params.id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ error: 'Timesheet not found' });
      }

      const canEdit = req.user!.role === 'admin' || 
                      req.user!.role === 'manager' ||
                      existing.user_id === req.user!.id;

      if (!canEdit) {
        return res.status(403).json({ error: 'Not authorized to edit this timesheet' });
      }

      // Check if timesheet is billed or paid - cannot edit
      const billingStatus = existing.billing_status || 'unbilled';
      if (billingStatus === 'billed' || billingStatus === 'paid') {
        return res.status(400).json({ 
          error: 'Cannot edit timesheet that has been billed or paid',
          billing_status: billingStatus
        });
      }

      // Build update object
      const updateData: any = {};
      if (project_id !== undefined) updateData.project_id = project_id;
      if (date !== undefined) updateData.date = date;
      if (hours !== undefined) updateData.hours = hours;
      if (activity_type_id !== undefined) updateData.activity_type_id = activity_type_id;
      if (cost_center_id !== undefined) updateData.cost_center_id = cost_center_id;
      if (notes !== undefined) updateData.notes = notes;
      if (imageUrls.length > 0) updateData.image_urls = imageUrls;
      if (location !== undefined) updateData.location = location;
      if (synced !== undefined) updateData.synced = synced;
      
      // Add user_id if provided (for admin/manager updating timesheet for other users)
      if (user_id && user_id !== existing.user_id) {
        const canManageOthers = req.user!.role === 'admin' || 
                                req.user!.role === 'manager' ||
                                (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));
        if (canManageOthers) {
          updateData.user_id = user_id;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      // Update timesheet
      const { data: updatedTimesheet, error: updateError } = await supabase
        .from('timesheets')
        .update(updateData)
        .eq('id', req.params.id)
        .select()
        .single();

      if (updateError) {
        log.error('Failed to update timesheet', updateError, { timesheetId: req.params.id });
        return res.status(500).json({ error: 'Failed to update timesheet' });
      }

      // Update project costs if hours changed
      if (hours !== undefined && hours !== existing.hours) {
        try {
          const { data: oldActivity } = await supabase
            .from('activity_types')
            .select('hourly_rate')
            .eq('id', existing.activity_type_id)
            .single();

          const { data: newActivity } = await supabase
            .from('activity_types')
            .select('hourly_rate')
            .eq('id', activity_type_id || existing.activity_type_id)
            .single();
          
          if (oldActivity && newActivity) {
            const oldCost = existing.hours * parseFloat(oldActivity.hourly_rate);
            const newCost = hours * parseFloat(newActivity.hourly_rate);
            const costDiff = newCost - oldCost;
            
            // Use raw query to update actual_cost with arithmetic
            await query(
              'UPDATE projects SET actual_cost = actual_cost + $1 WHERE id = $2',
              [costDiff, project_id || existing.project_id]
            );
          }
        } catch (costError) {
          log.warn('Failed to update project costs', { error: costError });
        }
      }

      res.json(updatedTimesheet);
    } catch (error: any) {
      log.error('Update timesheet error', error, { userId: req.user?.id, timesheetId: req.params.id });
      res.status(500).json({ error: 'Failed to update timesheet' });
    }
  }
);

// Delete timesheet
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get existing timesheet
    const { data: existing, error: fetchError } = await supabase
      .from('timesheets')
      .select('user_id, hours, project_id, activity_type_id, billing_status, image_urls, activity_types(hourly_rate)')
      .eq('id', req.params.id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const canDelete = req.user!.role === 'admin' || 
                      req.user!.role === 'manager' ||
                      existing.user_id === req.user!.id;

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this timesheet' });
    }

    // Check if timesheet is billed or paid - cannot delete
    const billingStatus = existing.billing_status || 'unbilled';
    if (billingStatus === 'billed' || billingStatus === 'paid') {
      return res.status(400).json({ 
        error: 'Cannot delete timesheet that has been billed or paid',
        billing_status: billingStatus
      });
    }

    const imageUrls = existing.image_urls || [];
    
    // Delete from database
    const { error: deleteError } = await supabase
      .from('timesheets')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) {
      log.error('Failed to delete timesheet', deleteError, { timesheetId: req.params.id });
      return res.status(500).json({ error: 'Failed to delete timesheet' });
    }

    // Delete associated image files using storage provider (background task)
    if (imageUrls.length > 0) {
      const storage = await StorageFactory.getInstance();
      const cleanupPromises: Promise<void>[] = [];

      for (const imageUrl of imageUrls) {
        // Skip HTTP URLs (S3 signed URLs - can't delete directly)
        if (!imageUrl || imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          continue;
        }

        // Extract storage path and delete
        const storagePath = resolveStoragePath(imageUrl);
        cleanupPromises.push(
          storage.delete(storagePath).catch((err) => {
            log.error('Failed to delete timesheet image', err, { timesheetId: req.params.id, path: storagePath });
          })
        );
      }

      // Run cleanup in background (don't block response)
      Promise.all(cleanupPromises).catch((err) => {
        log.error('Error during timesheet cleanup', err, { timesheetId: req.params.id });
      });
    }

    // Update project costs
    try {
      if (existing.activity_types && existing.project_id) {
        const hourlyRate = (existing.activity_types as any).hourly_rate;
        const cost = existing.hours * parseFloat(hourlyRate);
        
        // Use raw query to update actual_cost with arithmetic
        await query(
          'UPDATE projects SET actual_cost = actual_cost - $1 WHERE id = $2',
          [cost, existing.project_id]
        );
      }
    } catch (costError) {
      log.warn('Failed to update project costs', { error: costError });
    }

    // Log activity
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'delete', 'timesheet', req.params.id, JSON.stringify({ hours: existing.hours })]
      );
    } catch (logError) {
      log.warn('Failed to log activity', { error: logError });
    }

    res.json({ message: 'Timesheet deleted' });
  } catch (error: any) {
    log.error('Delete timesheet error', error, { userId: req.user?.id, timesheetId: req.params.id });
    res.status(500).json({ error: 'Failed to delete timesheet' });
  }
});

// Upload images for existing timesheet
router.post('/:id/images', authenticate,
  async (req: AuthRequest, res: Response, next) => {
    try {
      // Fetch timesheet via Supabase
      const { data: timesheet, error } = await supabase
        .from('timesheets')
        .select('project_id')
        .eq('id', req.params.id)
        .single();

      if (error || !timesheet) {
        return res.status(404).json({ error: 'Timesheet not found' });
      }

      const project_id = timesheet.project_id;
      if (!project_id) {
        return res.status(400).json({ error: 'Timesheet does not have an associated project' });
      }

      // Add project_id to request body so multer can use it for destination
      req.body.project_id = project_id;

      // Now let multer process the files
      projectUpload.array('images', 5)(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_COUNT') {
              return res.status(400).json({ error: 'Maximum 5 images allowed per timesheet' });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: 'File size exceeds 10MB limit. Please compress your images.' });
            }
          }
          return res.status(400).json({ error: err.message || 'File upload validation failed' });
        }
        next();
      });
    } catch (error) {
      log.error('Error fetching timesheet for image upload', error, { timesheetId: req.params.id });
      res.status(500).json({ error: 'Failed to process upload request' });
    }
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Get project_id from request body (already set and sanitized in previous middleware)
      const project_id = req.body.project_id;
    
    // Upload files to storage provider
    let storage;
    try {
      storage = await StorageFactory.getInstance();
    } catch (storageError: any) {
      log.error('Failed to initialize storage provider', storageError, { project_id, timesheetId: req.params.id });
      return res.status(500).json({ 
        error: 'Failed to initialize file storage',
        details: process.env.NODE_ENV === 'development' ? storageError.message : undefined
      });
    }
    const basePath = `projects/${project_id}`;
    let imageUrls: string[] = [];
    
    for (const file of files) {
      let storagePath: string | undefined;
      try {
        // Generate partitioned path
        storagePath = generatePartitionedPath(file.originalname, basePath);
        
        // Stream file from memory buffer to storage provider
        const fileStream = bufferToStream(file.buffer);
        await storage.put(storagePath, fileStream, {
          contentType: file.mimetype,
        });
        
        // Get URL from storage provider
        const fileUrl = await storage.url(storagePath);
        imageUrls.push(fileUrl);
      } catch (uploadError: any) {
        log.error(`Failed to upload ${file.originalname} to storage`, uploadError, { 
          filename: file.originalname, 
          timesheetId: req.params.id
        });
      }
    }

    // Update image URLs via Supabase
    const { data: updatedTimesheet, error: updateError } = await supabase
      .from('timesheets')
      .select('image_urls')
      .eq('id', req.params.id)
      .single();

    if (updateError || !updatedTimesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const existingUrls = updatedTimesheet.image_urls || [];
    const allUrls = [...existingUrls, ...imageUrls];

    const { error: updateError2 } = await supabase
      .from('timesheets')
      .update({ image_urls: allUrls })
      .eq('id', req.params.id);

    if (updateError2) {
      log.error('Failed to update timesheet images', updateError2, { timesheetId: req.params.id });
      return res.status(500).json({ error: 'Failed to update images' });
    }

    res.json({ 
      image_urls: allUrls
    });
  } catch (error: any) {
    log.error('Upload images error', error, { timesheetId: req.params.id, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Delete individual image from timesheet
router.delete('/:id/images/:index', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const timesheetId = req.params.id;
    const imageIndex = parseInt(req.params.index, 10);

    if (isNaN(imageIndex) || imageIndex < 0) {
      return res.status(400).json({ error: 'Invalid image index' });
    }

    // Get timesheet with images via Supabase
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheets')
      .select('image_urls')
      .eq('id', timesheetId)
      .single();

    if (fetchError || !timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const imageUrls = timesheet.image_urls || [];
    if (imageIndex >= imageUrls.length) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Get image URL to delete file
    const imageUrl = imageUrls[imageIndex];

    // Remove image from array
    const updatedUrls = [...imageUrls];
    updatedUrls.splice(imageIndex, 1);

    // Update database via Supabase
    const { error: updateError } = await supabase
      .from('timesheets')
      .update({ image_urls: updatedUrls })
      .eq('id', timesheetId);

    if (updateError) {
      log.error('Failed to update timesheet images', updateError, { timesheetId });
      return res.status(500).json({ error: 'Failed to delete image' });
    }

    // Delete physical file
    try {
      const storage = await StorageFactory.getInstance();
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        // Local path - extract relative path and delete
        const storagePath = resolveStoragePath(imageUrl);
        await storage.delete(storagePath).catch((err) => {
          log.error('Failed to delete image from storage', err, { imageUrl, timesheetId });
        });
      }
    } catch (fileError) {
      log.error('Failed to delete image file', fileError, { timesheetId });
      // Continue even if file deletion fails
    }

    res.json({ image_urls: updatedUrls, message: 'Image deleted' });
  } catch (error: any) {
    log.error('Delete image error', error, { timesheetId: req.params.id, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;
