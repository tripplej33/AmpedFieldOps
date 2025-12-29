import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();

// Register
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role = 'user' } = req.body;

    try {
      // Check if user exists
      const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const result = await query(
        `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, email, name, role, created_at`,
        [email, passwordHash, name, role]
      );

      const user = result.rows[0];

      // Set default permissions based on role
      const defaultPermissions = getDefaultPermissions(role);
      for (const permission of defaultPermissions) {
        await query(
          'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, true)',
          [user.id, permission]
        );
      }

      // Generate token
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'register', 'user', user.id, JSON.stringify({ email })]
      );

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: defaultPermissions
        },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Find user
      const result = await query(
        'SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Get permissions
      const permResult = await query(
        'SELECT permission FROM user_permissions WHERE user_id = $1 AND granted = true',
        [user.id]
      );
      const permissions = permResult.rows.map(p => p.permission);

      // Generate token
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, details, ip_address) 
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'login', 'user', JSON.stringify({ email }), req.ip]
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions
        },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Refresh token
router.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const token = jwt.sign(
      { id: req.user!.id, email: req.user!.email, name: req.user!.name, role: req.user!.role },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Forgot password
router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const { email } = req.body;

    try {
      const result = await query('SELECT id, name FROM users WHERE email = $1', [email]);
      
      if (result.rows.length === 0) {
        // Don't reveal if email exists
        return res.json({ message: 'If an account exists, a reset link will be sent' });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { id: result.rows[0].id, type: 'password-reset' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Send password reset email
      const { sendPasswordResetEmail } = await import('../lib/email');
      const emailSent = await sendPasswordResetEmail(email, resetToken, result.rows[0].name);

      // Always return success message (don't reveal if email exists)
      // If email failed to send, it's logged to console/server logs
      res.json({ message: 'If an account exists, a reset link will be sent' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
);

// Reset password
router.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const { token, password } = req.body;

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; type: string };
      
      if (decoded.type !== 'password-reset') {
        return res.status(400).json({ error: 'Invalid reset token' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      
      await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [passwordHash, decoded.id]
      );

      res.json({ message: 'Password reset successful' });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(400).json({ error: 'Reset token expired' });
      }
      res.status(400).json({ error: 'Invalid reset token' });
    }
  }
);

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, email, name, role, avatar, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      ...result.rows[0],
      permissions: req.user!.permissions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update profile
router.put('/profile', authenticate,
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  async (req: AuthRequest, res: Response) => {
    const { name, email, avatar } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (email) {
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }
      if (avatar !== undefined) {
        updates.push(`avatar = $${paramCount++}`);
        values.push(avatar);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.user!.id);

      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} 
         RETURNING id, email, name, role, avatar`,
        values
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// Change password
router.put('/change-password', authenticate,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    try {
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user!.id]
      );

      const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!isValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newHash, req.user!.id]
      );

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

function getDefaultPermissions(role: string): string[] {
  const basePermissions = ['can_create_timesheets', 'can_view_own_timesheets'];
  
  if (role === 'admin') {
    return [
      ...basePermissions,
      'can_view_financials',
      'can_edit_projects',
      'can_manage_users',
      'can_sync_xero',
      'can_view_all_timesheets',
      'can_edit_activity_types',
      'can_manage_clients',
      'can_manage_cost_centers',
      'can_view_reports',
      'can_export_data'
    ];
  }
  
  if (role === 'manager') {
    return [
      ...basePermissions,
      'can_view_financials',
      'can_edit_projects',
      'can_view_all_timesheets',
      'can_manage_clients',
      'can_view_reports',
      'can_export_data'
    ];
  }
  
  return basePermissions;
}

export default router;
