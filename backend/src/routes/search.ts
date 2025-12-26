import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Global search
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { q, type, limit = 20 } = req.query;
    
    if (!q || (q as string).length < 2) {
      return res.json({ clients: [], projects: [], timesheets: [] });
    }

    const searchTerm = `%${q}%`;
    const searchLimit = Math.min(parseInt(limit as string) || 20, 50);

    const results: any = {};

    // Search based on type or search all
    if (!type || type === 'clients') {
      const clients = await query(
        `SELECT id, name, contact_name, email, location, status
         FROM clients
         WHERE name ILIKE $1 OR contact_name ILIKE $1 OR address ILIKE $1 OR email ILIKE $1
         ORDER BY name ASC
         LIMIT $2`,
        [searchTerm, searchLimit]
      );
      results.clients = clients.rows;
    }

    if (!type || type === 'projects') {
      const projects = await query(
        `SELECT p.id, p.code, p.name, p.status, c.name as client_name
         FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         WHERE p.name ILIKE $1 OR p.code ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [searchTerm, searchLimit]
      );
      results.projects = projects.rows;
    }

    if (!type || type === 'timesheets') {
      const canViewAll = req.user!.role === 'admin' || 
                         req.user!.role === 'manager' || 
                         req.user!.permissions.includes('can_view_all_timesheets');

      let timesheetSql = `
        SELECT t.id, t.date, t.hours, t.notes,
          p.name as project_name,
          c.name as client_name,
          u.name as user_name
        FROM timesheets t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.notes ILIKE $1 OR p.name ILIKE $1 OR c.name ILIKE $1
      `;

      const params: any[] = [searchTerm];

      if (!canViewAll) {
        timesheetSql += ' AND t.user_id = $3';
        params.push(req.user!.id);
      }

      timesheetSql += ` ORDER BY t.date DESC LIMIT $2`;
      params.splice(1, 0, searchLimit);

      const timesheets = await query(timesheetSql, params);
      results.timesheets = timesheets.rows;
    }

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Save recent search (optional feature)
router.post('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query: searchQuery, type } = req.body;
    
    // Store in settings as JSON
    const existing = await query(
      `SELECT value FROM settings WHERE key = 'recent_searches' AND user_id = $1`,
      [req.user!.id]
    );

    let searches = [];
    if (existing.rows.length > 0 && existing.rows[0].value) {
      searches = JSON.parse(existing.rows[0].value);
    }

    // Add new search to front, limit to 10
    searches = [{ query: searchQuery, type, timestamp: new Date() }, ...searches].slice(0, 10);

    await query(
      `INSERT INTO settings (key, value, user_id) VALUES ('recent_searches', $1, $2)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(searches), req.user!.id]
    );

    res.json({ message: 'Search saved' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save search' });
  }
});

// Get recent searches
router.get('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT value FROM settings WHERE key = 'recent_searches' AND user_id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0 || !result.rows[0].value) {
      return res.json([]);
    }

    res.json(JSON.parse(result.rows[0].value));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recent searches' });
  }
});

// Clear recent searches
router.delete('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `DELETE FROM settings WHERE key = 'recent_searches' AND user_id = $1`,
      [req.user!.id]
    );

    res.json({ message: 'Recent searches cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear recent searches' });
  }
});

export default router;
