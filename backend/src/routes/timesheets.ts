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

const router = Router();

// Rate limiting for uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit to 20 timesheet creations per 15 minutes
  message: 'Too many timesheet creation requests, please try again later.',
});

// Get all timesheets
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, project_id, client_id, date_from, date_to, cost_center_id } = req.query;
    
    // Parse pagination parameters
    const { page, limit, offset } = parsePaginationParams(req.query);
    
    // Check if user can view all timesheets
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));
    
    // Build WHERE clause for both count and data queries
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    // If user can't view all, only show their own
    if (!canViewAll) {
      whereClause += ` AND t.user_id = $${paramCount++}`;
      params.push(req.user!.id);
    } else if (user_id) {
      whereClause += ` AND t.user_id = $${paramCount++}`;
      params.push(user_id);
    }

    if (project_id) {
      whereClause += ` AND t.project_id = $${paramCount++}`;
      params.push(project_id);
    }

    if (client_id) {
      whereClause += ` AND t.client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (cost_center_id) {
      whereClause += ` AND t.cost_center_id = $${paramCount++}`;
      params.push(cost_center_id);
    }

    if (date_from) {
      whereClause += ` AND t.date >= $${paramCount++}`;
      params.push(date_from);
    }

    if (date_to) {
      whereClause += ` AND t.date <= $${paramCount++}`;
      params.push(date_to);
    }

    // Filter by billing status if provided
    const billing_status = req.query.billing_status;
    if (billing_status) {
      whereClause += ` AND COALESCE(t.billing_status, 'unbilled') = $${paramCount++}`;
      params.push(billing_status);
    }

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total 
      FROM timesheets t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN clients c ON t.client_id = c.id
      ${whereClause}
    `;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    // Build data query
    let sql = `
      SELECT t.*, 
        u.name as user_name,
        p.name as project_name,
        p.code as project_code,
        c.name as client_name,
        at.name as activity_type_name,
        at.icon as activity_type_icon,
        at.color as activity_type_color,
        cc.code as cost_center_code,
        cc.name as cost_center_name,
        COALESCE(t.billing_status, 'unbilled') as billing_status,
        t.invoice_id
      FROM timesheets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN activity_types at ON t.activity_type_id = at.id
      LEFT JOIN cost_centers cc ON t.cost_center_id = cc.id
      ${whereClause}
      ORDER BY t.date DESC, t.created_at DESC
    `;
    
    // Add pagination
    sql += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    
    // Return paginated response
    const paginatedResponse = createPaginatedResponse(result.rows, total, page, limit);
    res.json(paginatedResponse);
  } catch (error: any) {
    log.error('Get timesheets error', error, { 
      userId: req.user?.id, 
      query: req.query,
      errorMessage: error?.message,
      errorStack: error?.stack 
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
    const result = await query(
      `      SELECT t.*, 
        u.name as user_name,
        p.name as project_name,
        c.name as client_name,
        at.name as activity_type_name,
        cc.code as cost_center_code,
        COALESCE(t.billing_status, 'unbilled') as billing_status,
        t.invoice_id
       FROM timesheets t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN projects p ON t.project_id = p.id AND p.deleted_at IS NULL
       LEFT JOIN clients c ON t.client_id = c.id AND c.deleted_at IS NULL
       LEFT JOIN activity_types at ON t.activity_type_id = at.id
       LEFT JOIN cost_centers cc ON t.cost_center_id = cc.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    // Check permission
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));
    
    if (!canViewAll && result.rows[0].user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to view this timesheet' });
    }

    res.json(result.rows[0]);
  } catch (error) {
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
  const project_id = req.body.project_id;
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
  let cloudImageUrls: string[] = [];
  
  if (isFormData && files.length > 0) {
    // Files were uploaded - upload to storage provider
    const storage = await StorageFactory.getInstance();
    const basePath = `projects/${project_id}`;
    
    // Upload each file to storage provider
    for (const file of files) {
      try {
        // Generate partitioned path
        const storagePath = generatePartitionedPath(file.originalname, basePath);
        
        // Stream file from temp location to storage provider
        const fileStream = createReadStream(file.path);
        await storage.put(storagePath, fileStream, {
          contentType: file.mimetype,
        });
        
        // Get URL from storage provider (signed URL for S3, regular path for local)
        const fileUrl = await storage.url(storagePath);
        imageUrls.push(fileUrl);
        
        // For S3, also store in cloud_image_urls
        if (storage.getDriver() === 's3') {
          cloudImageUrls.push(fileUrl);
        }
        
        // Delete temp file after successful upload
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          log.error('Failed to cleanup temp file after upload', cleanupError, { filePath: file.path });
        }
      } catch (uploadError: any) {
        log.error(`Failed to upload ${file.filename} to storage`, uploadError, { filename: file.filename, project_id });
        // Try to clean up temp file
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          log.error('Failed to cleanup temp file after upload error', cleanupError);
        }
        // Don't add to imageUrls if upload failed
      }
    }
  } else {
    // JSON request with pre-uploaded URLs
    imageUrls = req.body.image_urls || [];
    cloudImageUrls = req.body.cloud_image_urls || [];
  }

  const { client_id, notes, location } = req.body;

    try {
      // Get client_id from project if not provided
      let finalClientId = client_id;
      if (!finalClientId) {
        const project = await query('SELECT client_id FROM projects WHERE id = $1', [project_id]);
        if (project.rows.length > 0) {
          finalClientId = project.rows[0].client_id;
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

      const result = await query(
        `INSERT INTO timesheets (user_id, project_id, client_id, date, hours, activity_type_id, cost_center_id, notes, image_urls, cloud_image_urls, location, billing_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unbilled')
         RETURNING *`,
        [userId, project_id, finalClientId, timesheetDate, timesheetHours, timesheetActivityTypeId, timesheetCostCenterId, notes, imageUrls, cloudImageUrls.length > 0 ? cloudImageUrls : null, location]
      );

      // Update project actual_cost based on activity hourly rate
      const activityType = await query('SELECT hourly_rate FROM activity_types WHERE id = $1', [timesheetActivityTypeId]);
      if (activityType.rows.length > 0) {
        const cost = timesheetHours * parseFloat(activityType.rows[0].hourly_rate);
        await query(
          'UPDATE projects SET actual_cost = actual_cost + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [cost, project_id]
        );
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'timesheet', result.rows[0].id, JSON.stringify({ project_id, hours: timesheetHours, date: timesheetDate })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      log.error('Create timesheet error', error, { 
        userId: req.user!.id, 
        project_id,
        errorMessage: error?.message,
        errorStack: error?.stack,
        errorCode: error?.code,
        body: req.body
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to create timesheet';
      let statusCode = 500;
      
      if (error?.code === '23503') { // Foreign key violation
        errorMessage = 'Invalid project, activity type, or cost center';
        statusCode = 400;
      } else if (error?.code === '23505') { // Unique violation
        errorMessage = 'Timesheet already exists';
        statusCode = 409;
      } else if (error?.code === '23502') { // Not null violation
        errorMessage = 'Missing required field';
        statusCode = 400;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          message: error?.message,
          code: error?.code,
          stack: error?.stack
        } : undefined
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
    const project_id = req.body.project_id;
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
    let cloudImageUrls: string[] = [];
    
    if (isFormData && files.length > 0) {
      // Files were uploaded - upload to storage provider
      const storage = await StorageFactory.getInstance();
      const basePath = `projects/${project_id}`;
      
      // Upload each new file to storage provider
      for (const file of files) {
        try {
          // Generate partitioned path
          const storagePath = generatePartitionedPath(file.originalname, basePath);
          
          // Stream file from temp location to storage provider
          const fileStream = createReadStream(file.path);
          await storage.put(storagePath, fileStream, {
            contentType: file.mimetype,
          });
          
          // Get URL from storage provider
          const fileUrl = await storage.url(storagePath);
          imageUrls.push(fileUrl);
          
          // For S3, also store in cloud_image_urls
          if (storage.getDriver() === 's3') {
            cloudImageUrls.push(fileUrl);
          }
          
          // Delete temp file after successful upload
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (cleanupError) {
            log.error('Failed to cleanup temp file after upload', cleanupError);
          }
        } catch (uploadError: any) {
          log.error(`Failed to upload ${file.filename} to storage`, uploadError, { filename: file.filename, project_id });
          // Try to clean up temp file
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (cleanupError) {
            log.error('Failed to cleanup temp file after upload error', cleanupError);
          }
          // Don't add to imageUrls if upload failed
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
      
      // Include existing cloud URLs
      if (req.body.cloud_image_urls) {
        try {
          const existingCloudUrls = typeof req.body.cloud_image_urls === 'string'
            ? JSON.parse(req.body.cloud_image_urls)
            : req.body.cloud_image_urls;
          cloudImageUrls = [...cloudImageUrls, ...existingCloudUrls];
        } catch (e) {
          // If parsing fails, just use the new files
        }
      }
    } else {
      // JSON request with pre-uploaded URLs or existing URLs
      imageUrls = req.body.image_urls || [];
      cloudImageUrls = req.body.cloud_image_urls || [];
    }

    try {
      // Check ownership or permission
      const existing = await query('SELECT user_id, hours, project_id, activity_type_id, COALESCE(billing_status, \'unbilled\') as billing_status FROM timesheets WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Timesheet not found' });
      }

      const canEdit = req.user!.role === 'admin' || 
                      req.user!.role === 'manager' ||
                      existing.rows[0].user_id === req.user!.id;

      if (!canEdit) {
        return res.status(403).json({ error: 'Not authorized to edit this timesheet' });
      }

      // Check if timesheet is billed or paid - cannot edit
      const billingStatus = existing.rows[0].billing_status || 'unbilled';
      if (billingStatus === 'billed' || billingStatus === 'paid') {
        return res.status(400).json({ 
          error: 'Cannot edit timesheet that has been billed or paid',
          billing_status: billingStatus
        });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields: Record<string, any> = { 
        project_id, 
        date, 
        hours, 
        activity_type_id, 
        cost_center_id, 
        notes, 
        image_urls: imageUrls.length > 0 ? imageUrls : undefined,
        cloud_image_urls: cloudImageUrls.length > 0 ? cloudImageUrls : undefined,
        location, 
        synced 
      };
      
      // Add user_id if provided (for admin/manager updating timesheet for other users)
      if (user_id && user_id !== existing.rows[0].user_id) {
        const canManageOthers = req.user!.role === 'admin' || 
                                req.user!.role === 'manager' ||
                                (req.user!.permissions && req.user!.permissions.includes('can_view_all_timesheets'));
        if (canManageOthers) {
          fields.user_id = user_id;
        }
      }
      
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${key} = $${paramCount++}`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);

      const result = await query(
        `UPDATE timesheets SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      // Update project costs if hours changed
      if (hours !== undefined && hours !== existing.rows[0].hours) {
        const oldActivity = await query('SELECT hourly_rate FROM activity_types WHERE id = $1', [existing.rows[0].activity_type_id]);
        const newActivity = await query('SELECT hourly_rate FROM activity_types WHERE id = $1', [activity_type_id || existing.rows[0].activity_type_id]);
        
        if (oldActivity.rows.length > 0 && newActivity.rows.length > 0) {
          const oldCost = existing.rows[0].hours * parseFloat(oldActivity.rows[0].hourly_rate);
          const newCost = hours * parseFloat(newActivity.rows[0].hourly_rate);
          const costDiff = newCost - oldCost;
          
          await query(
            'UPDATE projects SET actual_cost = actual_cost + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [costDiff, project_id || existing.rows[0].project_id]
          );
        }
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update timesheet' });
    }
  }
);

// Delete timesheet
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query(
      'SELECT user_id, hours, project_id, activity_type_id, COALESCE(billing_status, \'unbilled\') as billing_status FROM timesheets WHERE id = $1', 
      [req.params.id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const canDelete = req.user!.role === 'admin' || 
                      req.user!.role === 'manager' ||
                      existing.rows[0].user_id === req.user!.id;

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this timesheet' });
    }

    // Check if timesheet is billed or paid - cannot delete
    const billingStatus = existing.rows[0].billing_status || 'unbilled';
    if (billingStatus === 'billed' || billingStatus === 'paid') {
      return res.status(400).json({ 
        error: 'Cannot delete timesheet that has been billed or paid',
        billing_status: billingStatus
      });
    }

    // Get timesheet info for cleanup (including image_urls)
    const timesheetWithImages = await query(
      'SELECT image_urls, project_id FROM timesheets WHERE id = $1',
      [req.params.id]
    );
    
    const timesheetInfo = existing.rows[0];
    const imageUrls = timesheetWithImages.rows[0]?.image_urls || [];
    
    // Delete from database
    await query('DELETE FROM timesheets WHERE id = $1', [req.params.id]);

    // Delete associated image files using storage provider
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
      Promise.all(cleanupPromises).then(() => {
        log.info('Timesheet images cleanup completed', { timesheetId: req.params.id, imagesDeleted: cleanupPromises.length });
      }).catch((err) => {
        log.error('Error during timesheet cleanup', err, { timesheetId: req.params.id });
      });
    }

    // Update project costs
    const activity = await query('SELECT hourly_rate FROM activity_types WHERE id = $1', [existing.rows[0].activity_type_id]);
    if (activity.rows.length > 0 && existing.rows[0].project_id) {
      const cost = existing.rows[0].hours * parseFloat(activity.rows[0].hourly_rate);
      await query(
        'UPDATE projects SET actual_cost = actual_cost - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [cost, existing.rows[0].project_id]
      );
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'delete', 'timesheet', req.params.id, JSON.stringify({ hours: existing.rows[0].hours })]
    );

    res.json({ message: 'Timesheet deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete timesheet' });
  }
});

// Upload images for existing timesheet
router.post('/:id/images', authenticate,
  async (req: AuthRequest, res: Response, next) => {
    try {
      // Fetch project_id from timesheet BEFORE multer processes files
      const timesheet = await query('SELECT project_id FROM timesheets WHERE id = $1', [req.params.id]);
      if (timesheet.rows.length === 0) {
        return res.status(404).json({ error: 'Timesheet not found' });
      }

      const project_id = timesheet.rows[0].project_id;
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

      // Get project_id from request body (already set in previous middleware)
      const project_id = req.body.project_id;
    
    // Upload files to storage provider
    const storage = await StorageFactory.getInstance();
    const basePath = `projects/${project_id}`;
    let imageUrls: string[] = [];
    let cloudImageUrls: string[] = [];
    
    for (const file of files) {
      try {
        // Generate partitioned path
        const storagePath = generatePartitionedPath(file.originalname, basePath);
        
        // Stream file from temp location to storage provider
        const fileStream = createReadStream(file.path);
        await storage.put(storagePath, fileStream, {
          contentType: file.mimetype,
        });
        
        // Get URL from storage provider
        const fileUrl = await storage.url(storagePath);
        imageUrls.push(fileUrl);
        
        // For S3, also store in cloud_image_urls
        if (storage.getDriver() === 's3') {
          cloudImageUrls.push(fileUrl);
        }
        
        // Delete temp file after successful upload
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          log.error('Failed to cleanup temp file after upload', cleanupError);
        }
      } catch (uploadError: any) {
        log.error(`Failed to upload ${file.filename} to storage`, uploadError, { filename: file.filename, timesheetId: req.params.id });
        // Try to clean up temp file
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          log.error('Failed to cleanup temp file after upload error', cleanupError);
        }
        // Don't add to imageUrls if upload failed
      }
    }

    // Update both local and cloud URLs
    const result = await query(
      `UPDATE timesheets 
       SET image_urls = array_cat(COALESCE(image_urls, '{}'), $1), 
           cloud_image_urls = array_cat(COALESCE(cloud_image_urls, '{}'), $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING image_urls, cloud_image_urls`,
      [imageUrls, cloudImageUrls.length > 0 ? cloudImageUrls : [], req.params.id]
    );

    res.json({ 
      image_urls: result.rows[0].image_urls,
      cloud_image_urls: result.rows[0].cloud_image_urls || []
    });
  } catch (error) {
    log.error('Upload images error', error, { timesheetId: req.params.id, userId: req.user!.id });
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

    // Get timesheet with images
    const timesheet = await query('SELECT image_urls, project_id FROM timesheets WHERE id = $1', [timesheetId]);
    if (timesheet.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const imageUrls = timesheet.rows[0].image_urls || [];
    if (imageIndex >= imageUrls.length) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Get image URL to delete file
    const imageUrl = imageUrls[imageIndex];
    const projectId = timesheet.rows[0].project_id;

    // Remove image from array
    const updatedUrls = [...imageUrls];
    updatedUrls.splice(imageIndex, 1);

    // Update database
    await query(
      `UPDATE timesheets 
       SET image_urls = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [updatedUrls, timesheetId]
    );

    // Delete physical file
    try {
      // Delete file from storage
      const storage = await StorageFactory.getInstance();
      try {
        // Extract storage path from URL
        let storagePath: string;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          // S3 signed URL - can't delete directly, would need S3 key
          log.warn('Cannot delete S3 file from signed URL', { imageUrl, timesheetId });
        } else {
          // Local path - extract relative path
          storagePath = resolveStoragePath(imageUrl);
          await storage.delete(storagePath);
        }
      } catch (deleteError: any) {
        log.error('Failed to delete image from storage', deleteError, { imageUrl, timesheetId });
        // Continue - file is already removed from array
      }
    } catch (fileError) {
      log.error('Failed to delete image file', fileError, { timesheetId: req.params.id, imageUrl });
      // Continue even if file deletion fails
    }

    res.json({ image_urls: updatedUrls, message: 'Image deleted' });
  } catch (error) {
    log.error('Delete image error', error, { timesheetId: req.params.id, userId: req.user!.id });
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;
