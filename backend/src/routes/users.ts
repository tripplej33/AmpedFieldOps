import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getDefaultPermissions } from '../lib/permissions';

const router = Router();

// Get all users (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT id, email, name, role, avatar, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    // Get permissions for each user
    const users = await Promise.all(result.rows.map(async (user) => {
      const permResult = await query(
        'SELECT permission, granted FROM user_permissions WHERE user_id = $1',
        [user.id]
      );
      return {
        ...user,
        permissions: permResult.rows
      };
    }));

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user
router.get('/:id', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, email, name, role, avatar, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const permResult = await query(
      'SELECT permission, granted FROM user_permissions WHERE user_id = $1',
      [req.params.id]
    );

    res.json({
      ...result.rows[0],
      permissions: permResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (admin only)
router.post('/', authenticate, requireRole('admin'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  body('role').isIn(['admin', 'manager', 'user']),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role } = req.body;

    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await query(
        `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, email, name, role, created_at`,
        [email, passwordHash, name, role]
      );

      const newUser = result.rows[0];

      // Set default permissions based on role
      const defaultPermissions = getDefaultPermissions(role);
      for (const permission of defaultPermissions) {
        await query(
          'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, true)',
          [newUser.id, permission]
        );
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create_user', 'user', newUser.id, JSON.stringify({ email, role })]
      );

      res.status(201).json(newUser);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user (admin only)
router.put('/:id', authenticate, requireRole('admin'),
  body('name').optional().trim().notEmpty(),
  body('role').optional().isIn(['admin', 'manager', 'user']),
  body('is_active').optional().isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const { name, role, is_active } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (role) {
        updates.push(`role = $${paramCount++}`);
        values.push(role);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);

      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} 
         RETURNING id, email, name, role, is_active`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If role was updated, update permissions to match new role's defaults
      if (role) {
        // Get the updated user's role (in case it changed)
        const updatedUser = result.rows[0];
        
        // Delete existing permissions
        await query('DELETE FROM user_permissions WHERE user_id = $1', [req.params.id]);
        
        // Set default permissions for the new role
        const defaultPermissions = getDefaultPermissions(updatedUser.role);
        for (const permission of defaultPermissions) {
          await query(
            'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, true)',
            [req.params.id, permission]
          );
        }
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Update user permissions (admin only)
router.put('/:id/permissions', authenticate, requireRole('admin'),
  body('permissions').isArray(),
  async (req: AuthRequest, res: Response) => {
    const { permissions } = req.body;

    try {
      // Delete existing permissions
      await query('DELETE FROM user_permissions WHERE user_id = $1', [req.params.id]);

      // Insert new permissions
      for (const perm of permissions) {
        await query(
          'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, $3)',
          [req.params.id, perm.permission, perm.granted]
        );
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'update_permissions', 'user', req.params.id, JSON.stringify({ permissions })]
      );

      res.json({ message: 'Permissions updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  }
);

// Delete user (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
