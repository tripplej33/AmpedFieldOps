import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all activity types
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { active_only } = req.query;
    
    let sql = `
      SELECT at.*,
        (SELECT COUNT(*) FROM timesheets t WHERE t.activity_type_id = at.id) as usage_count
      FROM activity_types at
      WHERE 1=1
    `;

    if (active_only === 'true') {
      sql += ' AND at.is_active = true';
    }

    sql += ' ORDER BY at.name ASC';

    const result = await query(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity types' });
  }
});

// Get single activity type
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT at.*,
        (SELECT COUNT(*) FROM timesheets t WHERE t.activity_type_id = at.id) as usage_count
       FROM activity_types at
       WHERE at.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity type not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
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
      const result = await query(
        `INSERT INTO activity_types (name, icon, color, hourly_rate)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, icon, color, hourly_rate]
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'activity_type', result.rows[0].id, JSON.stringify({ name })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create activity type' });
    }
  }
);

// Update activity type (admin only)
router.put('/:id', authenticate, requirePermission('can_edit_activity_types'),
  async (req: AuthRequest, res: Response) => {
    const { name, icon, color, hourly_rate, is_active } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = { name, icon, color, hourly_rate, is_active };
      
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
        `UPDATE activity_types SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Activity type not found' });
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'update', 'activity_type', req.params.id, JSON.stringify(fields)]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update activity type' });
    }
  }
);

// Delete activity type (admin only)
router.delete('/:id', authenticate, requirePermission('can_edit_activity_types'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if activity type is in use
    const timesheets = await query(
      'SELECT COUNT(*) FROM timesheets WHERE activity_type_id = $1',
      [req.params.id]
    );

    if (parseInt(timesheets.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete activity type with existing timesheets. Deactivate instead.',
        usage_count: parseInt(timesheets.rows[0].count)
      });
    }

    const result = await query(
      'DELETE FROM activity_types WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity type not found' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'delete', 'activity_type', req.params.id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Activity type deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete activity type' });
  }
});

export default router;
