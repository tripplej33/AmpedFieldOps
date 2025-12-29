import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all permissions (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, key, label, description, is_system, is_custom, is_active, created_at, updated_at
       FROM permissions
       ORDER BY is_system DESC, label ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Get single permission (admin only)
router.get('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, key, label, description, is_system, is_custom, is_active, created_at, updated_at
       FROM permissions
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch permission' });
  }
});

// Create custom permission (admin only)
router.post('/', authenticate, requireRole('admin'),
  body('key').trim().notEmpty().matches(/^[a-z_]+$/).withMessage('Key must be lowercase with underscores'),
  body('label').trim().notEmpty(),
  body('description').optional().trim(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { key, label, description } = req.body;

    try {
      // Check if permission key already exists
      const existing = await query('SELECT id FROM permissions WHERE key = $1', [key]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Permission key already exists' });
      }

      const result = await query(
        `INSERT INTO permissions (key, label, description, is_system, is_custom, is_active)
         VALUES ($1, $2, $3, false, true, true)
         RETURNING id, key, label, description, is_system, is_custom, is_active, created_at, updated_at`,
        [key, label, description || '']
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'permission', result.rows[0].id, JSON.stringify({ key, label })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Failed to create permission:', error);
      res.status(500).json({ error: 'Failed to create permission' });
    }
  }
);

// Update permission (admin only)
router.put('/:id', authenticate, requireRole('admin'),
  body('label').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('is_active').optional().isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { label, description, is_active } = req.body;

    try {
      // Check if permission exists
      const existing = await query('SELECT id, is_system FROM permissions WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Permission not found' });
      }

      const permission = existing.rows[0];

      // System permissions can only have label/description updated, not key or is_active
      if (permission.is_system) {
        const updates: string[] = [];
        const params: any[] = [];
        let paramCount = 1;

        if (label !== undefined) {
          updates.push(`label = $${paramCount++}`);
          params.push(label);
        }
        if (description !== undefined) {
          updates.push(`description = $${paramCount++}`);
          params.push(description);
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No valid fields to update for system permission' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(req.params.id);

        const result = await query(
          `UPDATE permissions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
          params
        );

        // Log activity
        await query(
          `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user!.id, 'update', 'permission', req.params.id, JSON.stringify({ label, description })]
        );

        return res.json(result.rows[0]);
      }

      // Custom permissions can be fully updated
      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (label !== undefined) {
        updates.push(`label = $${paramCount++}`);
        params.push(label);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        params.push(description);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        params.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(req.params.id);

      const result = await query(
        `UPDATE permissions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        params
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'update', 'permission', req.params.id, JSON.stringify({ label, description, is_active })]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Failed to update permission:', error);
      res.status(500).json({ error: 'Failed to update permission' });
    }
  }
);

// Delete custom permission (admin only, cannot delete system permissions)
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if permission exists and is custom
    const existing = await query('SELECT id, is_system, key FROM permissions WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    if (existing.rows[0].is_system) {
      return res.status(400).json({ error: 'Cannot delete system permissions' });
    }

    // Check if permission is assigned to any users
    const assigned = await query(
      'SELECT COUNT(*) as count FROM user_permissions WHERE permission = $1',
      [existing.rows[0].key]
    );

    if (parseInt(assigned.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete permission that is assigned to users. Remove assignments first.' 
      });
    }

    await query('DELETE FROM permissions WHERE id = $1', [req.params.id]);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'delete', 'permission', req.params.id, JSON.stringify({ key: existing.rows[0].key })]
    );

    res.json({ message: 'Permission deleted' });
  } catch (error) {
    console.error('Failed to delete permission:', error);
    res.status(500).json({ error: 'Failed to delete permission' });
  }
});

export default router;

