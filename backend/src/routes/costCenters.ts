import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all cost centers
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { active_only } = req.query;
    
    let sql = `
      SELECT cc.*,
        (SELECT COUNT(*) FROM project_cost_centers pcc WHERE pcc.cost_center_id = cc.id) as project_count,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.cost_center_id = cc.id) as total_hours,
        (SELECT COALESCE(SUM(t.hours * at.hourly_rate), 0) 
         FROM timesheets t 
         JOIN activity_types at ON t.activity_type_id = at.id 
         WHERE t.cost_center_id = cc.id) as total_cost
      FROM cost_centers cc
      WHERE 1=1
    `;

    if (active_only === 'true') {
      sql += ' AND cc.is_active = true';
    }

    sql += ' ORDER BY cc.code ASC';

    const result = await query(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cost centers' });
  }
});

// Get single cost center
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT cc.*,
        (SELECT COUNT(*) FROM project_cost_centers pcc WHERE pcc.cost_center_id = cc.id) as project_count,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.cost_center_id = cc.id) as total_hours
       FROM cost_centers cc
       WHERE cc.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    // Get related projects
    const projects = await query(
      `SELECT p.id, p.code, p.name, p.status 
       FROM projects p
       JOIN project_cost_centers pcc ON p.id = pcc.project_id
       WHERE pcc.cost_center_id = $1`,
      [req.params.id]
    );

    res.json({
      ...result.rows[0],
      projects: projects.rows
    });
  } catch (error) {
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

    const { code, name, description, budget = 0, xero_tracking_category_id } = req.body;

    try {
      // Check for duplicate code
      const existing = await query('SELECT id FROM cost_centers WHERE code = $1', [code]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Cost center code already exists' });
      }

      const result = await query(
        `INSERT INTO cost_centers (code, name, description, budget, xero_tracking_category_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [code, name, description, budget, xero_tracking_category_id]
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'cost_center', result.rows[0].id, JSON.stringify({ code, name })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create cost center' });
    }
  }
);

// Update cost center (admin only)
router.put('/:id', authenticate, requirePermission('can_manage_cost_centers'),
  async (req: AuthRequest, res: Response) => {
    const { code, name, description, budget, is_active, xero_tracking_category_id } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = { code, name, description, budget, is_active, xero_tracking_category_id };
      
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${key} = $${paramCount++}`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      // Check for duplicate code if updating code
      if (code) {
        const existing = await query(
          'SELECT id FROM cost_centers WHERE code = $1 AND id != $2',
          [code, req.params.id]
        );
        if (existing.rows.length > 0) {
          return res.status(400).json({ error: 'Cost center code already exists' });
        }
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);

      const result = await query(
        `UPDATE cost_centers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Cost center not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update cost center' });
    }
  }
);

// Delete cost center (admin only)
router.delete('/:id', authenticate, requirePermission('can_manage_cost_centers'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if cost center is in use
    const timesheets = await query(
      'SELECT COUNT(*) FROM timesheets WHERE cost_center_id = $1',
      [req.params.id]
    );

    if (parseInt(timesheets.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete cost center with existing timesheets. Deactivate instead.' 
      });
    }

    const result = await query(
      'DELETE FROM cost_centers WHERE id = $1 RETURNING id, code, name',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    res.json({ message: 'Cost center deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete cost center' });
  }
});

export default router;
