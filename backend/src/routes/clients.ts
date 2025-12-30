import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();

// Get all clients
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, sort = 'name', order = 'asc' } = req.query;
    
    let sql = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.status IN ('quoted', 'in-progress')) as active_projects,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.client_id = c.id) as total_hours,
        (SELECT MAX(t.date) FROM timesheets t WHERE t.client_id = c.id) as last_contact
      FROM clients c
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (status) {
      sql += ` AND c.status = $${paramCount++}`;
      params.push(status);
    }

    if (search) {
      sql += ` AND (
        c.name ILIKE $${paramCount} OR 
        c.contact_name ILIKE $${paramCount} OR 
        c.address ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    const validSorts = ['name', 'created_at', 'total_hours'];
    const sortColumn = validSorts.includes(sort as string) ? sort : 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${sortColumn} ${sortOrder}`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Get clients error:', error);
    const errorMessage = error.message || 'Failed to fetch clients';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    res.status(500).json({ 
      error: isTableError ? 'Database tables not found. Please run migrations.' : 'Failed to fetch clients',
      details: env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Get single client
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.status IN ('quoted', 'in-progress')) as active_projects,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.client_id = c.id) as total_hours
       FROM clients c
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get related projects
    const projects = await query(
      'SELECT id, code, name, status, budget, actual_cost FROM projects WHERE client_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({
      ...result.rows[0],
      projects: projects.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create client
router.post('/', authenticate, requirePermission('can_manage_clients'),
  body('name').trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, contact_name, email, phone, address, location, billing_address, billing_email, notes } = req.body;

    try {
      const result = await query(
        `INSERT INTO clients (name, contact_name, email, phone, address, location, billing_address, billing_email, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [name, contact_name, email, phone, address, location, billing_address, billing_email, notes]
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'client', result.rows[0].id, JSON.stringify({ name })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create client' });
    }
  }
);

// Update client
router.put('/:id', authenticate, requirePermission('can_manage_clients'),
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  async (req: AuthRequest, res: Response) => {
    const { name, contact_name, email, phone, address, location, billing_address, billing_email, status, notes, xero_contact_id } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = { name, contact_name, email, phone, address, location, billing_address, billing_email, status, notes, xero_contact_id };
      
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
        `UPDATE clients SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'update', 'client', req.params.id, JSON.stringify(fields)]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update client' });
    }
  }
);

// Delete client
router.delete('/:id', authenticate, requirePermission('can_manage_clients'), async (req: AuthRequest, res: Response) => {
  try {
    // Check for related projects
    const projects = await query(
      'SELECT COUNT(*) FROM projects WHERE client_id = $1',
      [req.params.id]
    );

    if (parseInt(projects.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete client with existing projects. Deactivate instead.' 
      });
    }

    const result = await query(
      'DELETE FROM clients WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'delete', 'client', req.params.id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Client deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
