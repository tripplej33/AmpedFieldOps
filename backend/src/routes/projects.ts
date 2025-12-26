import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, getClient } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// Generate project code
const generateProjectCode = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) FROM projects WHERE code LIKE $1`,
    [`PRJ-${year}-%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `PRJ-${year}-${String(count).padStart(3, '0')}`;
};

// Get all projects
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, client_id, search, sort = 'created_at', order = 'desc' } = req.query;
    
    let sql = `
      SELECT p.*, 
        c.name as client_name,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.project_id = p.id) as hours_logged,
        array_agg(DISTINCT cc.id) as cost_center_ids,
        array_agg(DISTINCT cc.code) as cost_center_codes
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN project_cost_centers pcc ON p.id = pcc.project_id
      LEFT JOIN cost_centers cc ON pcc.cost_center_id = cc.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (status) {
      sql += ` AND p.status = $${paramCount++}`;
      params.push(status);
    }

    if (client_id) {
      sql += ` AND p.client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (search) {
      sql += ` AND (p.name ILIKE $${paramCount} OR p.code ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    sql += ` GROUP BY p.id, c.name`;

    const validSorts = ['name', 'created_at', 'budget', 'status'];
    const sortColumn = validSorts.includes(sort as string) ? `p.${sort}` : 'p.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${sortOrder}`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, 
        c.name as client_name,
        (SELECT COALESCE(SUM(t.hours), 0) FROM timesheets t WHERE t.project_id = p.id) as hours_logged
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get cost centers
    const costCenters = await query(
      `SELECT cc.* FROM cost_centers cc
       JOIN project_cost_centers pcc ON cc.id = pcc.cost_center_id
       WHERE pcc.project_id = $1`,
      [req.params.id]
    );

    // Get recent timesheets
    const timesheets = await query(
      `SELECT t.*, u.name as user_name, at.name as activity_type_name
       FROM timesheets t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN activity_types at ON t.activity_type_id = at.id
       WHERE t.project_id = $1
       ORDER BY t.date DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json({
      ...result.rows[0],
      cost_centers: costCenters.rows,
      timesheets: timesheets.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
router.post('/', authenticate, requirePermission('can_edit_projects'),
  body('name').trim().notEmpty(),
  body('client_id').optional().isUUID(),
  body('budget').optional().isNumeric(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, client_id, status = 'quoted', budget = 0, description, start_date, end_date, cost_center_ids = [] } = req.body;

    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      const code = await generateProjectCode();

      const result = await client.query(
        `INSERT INTO projects (code, name, client_id, status, budget, description, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [code, name, client_id, status, budget, description, start_date, end_date]
      );

      const project = result.rows[0];

      // Add cost centers
      for (const ccId of cost_center_ids) {
        await client.query(
          'INSERT INTO project_cost_centers (project_id, cost_center_id) VALUES ($1, $2)',
          [project.id, ccId]
        );
      }

      await client.query('COMMIT');

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'create', 'project', project.id, JSON.stringify({ name, code })]
      );

      res.status(201).json(project);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create project error:', error);
      res.status(500).json({ error: 'Failed to create project' });
    } finally {
      client.release();
    }
  }
);

// Update project
router.put('/:id', authenticate, requirePermission('can_edit_projects'),
  async (req: AuthRequest, res: Response) => {
    const { name, client_id, status, budget, actual_cost, description, start_date, end_date, cost_center_ids, xero_project_id } = req.body;

    const client = await getClient();

    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = { name, client_id, status, budget, actual_cost, description, start_date, end_date, xero_project_id };
      
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${key} = $${paramCount++}`);
          values.push(value);
        }
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        const result = await client.query(
          `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
          values
        );

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Project not found' });
        }
      }

      // Update cost centers if provided
      if (cost_center_ids !== undefined) {
        await client.query('DELETE FROM project_cost_centers WHERE project_id = $1', [req.params.id]);
        for (const ccId of cost_center_ids) {
          await client.query(
            'INSERT INTO project_cost_centers (project_id, cost_center_id) VALUES ($1, $2)',
            [req.params.id, ccId]
          );
        }
      }

      await client.query('COMMIT');

      // Get updated project
      const project = await query(
        `SELECT p.*, c.name as client_name
         FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         WHERE p.id = $1`,
        [req.params.id]
      );

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'update', 'project', req.params.id, JSON.stringify(fields)]
      );

      res.json(project.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to update project' });
    } finally {
      client.release();
    }
  }
);

// Delete project
router.delete('/:id', authenticate, requirePermission('can_edit_projects'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 RETURNING id, name, code',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'delete', 'project', req.params.id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
