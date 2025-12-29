import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { upload, projectUpload } from '../middleware/upload';

const router = Router();

// Get all timesheets
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, project_id, client_id, date_from, date_to, cost_center_id } = req.query;
    
    // Check if user can view all timesheets
    const canViewAll = req.user!.role === 'admin' || 
                       req.user!.role === 'manager' || 
                       req.user!.permissions.includes('can_view_all_timesheets');
    
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
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    // If user can't view all, only show their own
    if (!canViewAll) {
      sql += ` AND t.user_id = $${paramCount++}`;
      params.push(req.user!.id);
    } else if (user_id) {
      sql += ` AND t.user_id = $${paramCount++}`;
      params.push(user_id);
    }

    if (project_id) {
      sql += ` AND t.project_id = $${paramCount++}`;
      params.push(project_id);
    }

    if (client_id) {
      sql += ` AND t.client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (cost_center_id) {
      sql += ` AND t.cost_center_id = $${paramCount++}`;
      params.push(cost_center_id);
    }

    if (date_from) {
      sql += ` AND t.date >= $${paramCount++}`;
      params.push(date_from);
    }

    if (date_to) {
      sql += ` AND t.date <= $${paramCount++}`;
      params.push(date_to);
    }

    // Filter by billing status if provided
    const billing_status = req.query.billing_status;
    if (billing_status) {
      sql += ` AND COALESCE(t.billing_status, 'unbilled') = $${paramCount++}`;
      params.push(billing_status);
    }

    sql += ' ORDER BY t.date DESC, t.created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get timesheets error:', error);
    res.status(500).json({ error: 'Failed to fetch timesheets' });
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
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN clients c ON t.client_id = c.id
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
                       req.user!.permissions.includes('can_view_all_timesheets');
    
    if (!canViewAll && result.rows[0].user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to view this timesheet' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timesheet' });
  }
});

// Create timesheet (handles both JSON and FormData with images)
router.post('/', authenticate, projectUpload.array('images', 5), async (req: AuthRequest, res: Response) => {
  // Check if this is FormData (has files) or JSON
  const files = req.files as Express.Multer.File[];
  const isFormData = files && files.length > 0;
  
  // Extract and validate required fields from body (works for both JSON and FormData)
  const project_id = req.body.project_id;
  const date = req.body.date;
  const hours = parseFloat(req.body.hours);
  const activity_type_id = req.body.activity_type_id;
  const cost_center_id = req.body.cost_center_id;
  
  // Manual validation (since express-validator doesn't work well with FormData)
  if (!project_id || !date || !hours || !activity_type_id || !cost_center_id) {
    return res.status(400).json({ error: 'Missing required fields: project_id, date, hours, activity_type_id, cost_center_id' });
  }
  
  if (hours < 0.25 || hours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0.25 and 24' });
  }

  // Get image URLs from uploaded files or from body
  let imageUrls: string[] = [];
  if (isFormData && files.length > 0) {
    // Files were uploaded, use project-specific paths
    imageUrls = files.map(f => `/uploads/projects/${project_id}/${f.filename}`);
  } else {
    // JSON request with pre-uploaded URLs
    imageUrls = req.body.image_urls || [];
  }

  const { client_id, date, hours, activity_type_id, cost_center_id, notes, location } = req.body;

    try {
      // Get client_id from project if not provided
      let finalClientId = client_id;
      if (!finalClientId) {
        const project = await query('SELECT client_id FROM projects WHERE id = $1', [project_id]);
        if (project.rows.length > 0) {
          finalClientId = project.rows[0].client_id;
        }
      }

      const result = await query(
        `INSERT INTO timesheets (user_id, project_id, client_id, date, hours, activity_type_id, cost_center_id, notes, image_urls, location, billing_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'unbilled')
         RETURNING *`,
        [req.user!.id, project_id, finalClientId, date, hours, activity_type_id, cost_center_id, notes, imageUrls, location]
      );

      // Update project actual_cost based on activity hourly rate
      const activityType = await query('SELECT hourly_rate FROM activity_types WHERE id = $1', [activity_type_id]);
      if (activityType.rows.length > 0) {
        const cost = hours * parseFloat(activityType.rows[0].hourly_rate);
        await query(
          'UPDATE projects SET actual_cost = actual_cost + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [cost, project_id]
        );
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'timesheet', result.rows[0].id, JSON.stringify({ project_id, hours, date })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create timesheet error:', error);
      res.status(500).json({ error: 'Failed to create timesheet' });
    }
  }
);

// Update timesheet
router.put('/:id', authenticate,
  async (req: AuthRequest, res: Response) => {
    const { project_id, date, hours, activity_type_id, cost_center_id, notes, image_urls, location, synced } = req.body;

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

      const fields = { project_id, date, hours, activity_type_id, cost_center_id, notes, image_urls, location, synced };
      
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

    await query('DELETE FROM timesheets WHERE id = $1', [req.params.id]);

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
router.post('/:id/images', authenticate, projectUpload.array('images', 5), async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get project_id from timesheet
    const timesheet = await query('SELECT project_id FROM timesheets WHERE id = $1', [req.params.id]);
    if (timesheet.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const project_id = timesheet.rows[0].project_id;
    const imageUrls = files.map(f => `/uploads/projects/${project_id}/${f.filename}`);

    const result = await query(
      `UPDATE timesheets 
       SET image_urls = array_cat(COALESCE(image_urls, '{}'), $1), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING image_urls`,
      [imageUrls, req.params.id]
    );

    res.json({ image_urls: result.rows[0].image_urls });
  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

export default router;
