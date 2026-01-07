import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { parsePaginationParams, createPaginatedResponse } from '../lib/pagination';
import { log } from '../lib/logger';

const router = Router();

// Get all clients
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, sort = 'name', order = 'asc', client_type } = req.query;
    
    // Parse pagination parameters
    const { page, limit, offset } = parsePaginationParams(req.query);
    
    // Build WHERE clause for both count and data queries
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (status) {
      whereClause += ` AND c.status = $${paramCount++}`;
      params.push(status);
    }

    if (client_type) {
      if (client_type === 'customer') {
        whereClause += ` AND (c.client_type IN ('customer', 'both') OR (c.client_type IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id)))`;
      } else if (client_type === 'supplier') {
        whereClause += ` AND (c.client_type IN ('supplier', 'both') OR (c.client_type IS NULL AND (EXISTS (SELECT 1 FROM xero_purchase_orders po WHERE po.supplier_id = c.id) OR EXISTS (SELECT 1 FROM xero_bills b WHERE b.supplier_id = c.id))))`;
      }
    }

    if (search) {
      whereClause += ` AND (
        c.name ILIKE $${paramCount} OR 
        c.contact_name ILIKE $${paramCount} OR 
        c.address ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM clients c ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    // Build data query
    let sql = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.status IN ('quoted', 'in-progress')) as active_projects,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.client_id = c.id) as total_hours,
        (SELECT MAX(t.date) FROM timesheets t WHERE t.client_id = c.id) as last_contact,
        (SELECT COUNT(*) FROM xero_purchase_orders po WHERE po.supplier_id = c.id) as total_purchase_orders,
        (SELECT COUNT(*) FROM xero_bills b WHERE b.supplier_id = c.id) as total_bills,
        (SELECT COALESCE(SUM(b.amount), 0) FROM xero_bills b WHERE b.supplier_id = c.id) as total_spent
      FROM clients c
      ${whereClause}
    `;

    const validSorts = ['name', 'created_at', 'total_hours'];
    const sortColumn = validSorts.includes(sort as string) ? sort : 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${sortColumn} ${sortOrder}`;
    
    // Add pagination
    sql += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    
    // Return paginated response
    const paginatedResponse = createPaginatedResponse(result.rows, total, page, limit);
    res.json(paginatedResponse);
  } catch (error: any) {
    log.error('Get clients error', error, { userId: req.user?.id });
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
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.client_id = c.id) as total_hours,
        (SELECT COUNT(*) FROM xero_purchase_orders po WHERE po.supplier_id = c.id) as total_purchase_orders,
        (SELECT COUNT(*) FROM xero_bills b WHERE b.supplier_id = c.id) as total_bills,
        (SELECT COALESCE(SUM(b.amount), 0) FROM xero_bills b WHERE b.supplier_id = c.id) as total_spent
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

    const { name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, notes } = req.body;

    try {
      const result = await query(
        `INSERT INTO clients (name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [name, contact_name, email, phone, address, location, billing_address, billing_email, client_type || 'customer', notes]
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
    const { name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, status, notes, xero_contact_id } = req.body;

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = { name, contact_name, email, phone, address, location, billing_address, billing_email, client_type, status, notes, xero_contact_id };
      
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
