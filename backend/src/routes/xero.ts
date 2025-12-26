import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// Note: In production, use the xero-node package for actual Xero API integration
// This is a placeholder implementation showing the structure

// Get Xero authorization URL
router.get('/auth/url', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const clientId = process.env.XERO_CLIENT_ID;
    const redirectUri = process.env.XERO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return res.status(400).json({ 
        error: 'Xero credentials not configured',
        configured: false
      });
    }

    const scopes = [
      'openid',
      'profile',
      'email',
      'accounting.transactions',
      'accounting.contacts',
      'accounting.settings',
      'offline_access'
    ].join(' ');

    const authUrl = `https://login.xero.com/identity/connect/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${req.user!.id}`;

    res.json({ url: authUrl, configured: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle Xero OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings?xero_error=no_code`);
    }

    // Exchange code for tokens (in production, use xero-node)
    // This is a placeholder - implement actual token exchange
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    // Simulate token storage
    // In production, make actual API call to Xero
    const mockTokenResponse = {
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      id_token: 'mock_id_token',
      expires_in: 1800,
      token_type: 'Bearer'
    };

    const expiresAt = new Date(Date.now() + mockTokenResponse.expires_in * 1000);

    // Store tokens
    await query(
      `INSERT INTO xero_tokens (access_token, refresh_token, id_token, token_type, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        mockTokenResponse.access_token,
        mockTokenResponse.refresh_token,
        mockTokenResponse.id_token,
        mockTokenResponse.token_type,
        expiresAt
      ]
    );

    // Update last xero token (keep only one)
    await query(`DELETE FROM xero_tokens WHERE id NOT IN (SELECT id FROM xero_tokens ORDER BY created_at DESC LIMIT 1)`);

    res.redirect(`${process.env.FRONTEND_URL}/settings?xero_connected=true`);
  } catch (error) {
    console.error('Xero callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?xero_error=callback_failed`);
  }
});

// Get Xero connection status
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT tenant_id, tenant_name, expires_at, updated_at FROM xero_tokens ORDER BY created_at DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({ 
        connected: false,
        configured: !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET)
      });
    }

    const token = result.rows[0];
    const isExpired = new Date(token.expires_at) < new Date();

    res.json({
      connected: true,
      configured: true,
      tenant_name: token.tenant_name,
      expires_at: token.expires_at,
      last_sync: token.updated_at,
      needs_refresh: isExpired
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get Xero status' });
  }
});

// Disconnect Xero
router.delete('/disconnect', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM xero_tokens');
    
    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'disconnect', 'xero', JSON.stringify({ action: 'disconnected' })]
    );

    res.json({ message: 'Xero disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect Xero' });
  }
});

// Sync data with Xero
router.post('/sync', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.body; // 'contacts', 'invoices', 'tracking_categories', 'all'

    // Check if connected
    const tokenResult = await query('SELECT * FROM xero_tokens ORDER BY created_at DESC LIMIT 1');
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Xero not connected' });
    }

    // In production, implement actual sync logic using xero-node
    // This is a placeholder that simulates the sync

    const syncResults: any = {
      success: true,
      synced_at: new Date(),
      results: {}
    };

    if (type === 'contacts' || type === 'all') {
      // Sync contacts to clients
      syncResults.results.contacts = { synced: 0, created: 0, updated: 0 };
    }

    if (type === 'invoices' || type === 'all') {
      // Sync invoices
      syncResults.results.invoices = { synced: 0, created: 0, updated: 0 };
    }

    if (type === 'tracking_categories' || type === 'all') {
      // Sync tracking categories to cost centers
      syncResults.results.tracking_categories = { synced: 0, mapped: 0 };
    }

    // Update token last sync time
    await query(
      'UPDATE xero_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [tokenResult.rows[0].id]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'sync', 'xero', JSON.stringify(syncResults)]
    );

    res.json(syncResults);
  } catch (error) {
    console.error('Xero sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Get invoices from Xero (cached)
router.get('/invoices', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, client_id, date_from, date_to } = req.query;

    let sql = `
      SELECT xi.*, c.name as client_name
      FROM xero_invoices xi
      LEFT JOIN clients c ON xi.client_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (status) {
      sql += ` AND xi.status = $${paramCount++}`;
      params.push(status);
    }

    if (client_id) {
      sql += ` AND xi.client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (date_from) {
      sql += ` AND xi.issue_date >= $${paramCount++}`;
      params.push(date_from);
    }

    if (date_to) {
      sql += ` AND xi.issue_date <= $${paramCount++}`;
      params.push(date_to);
    }

    sql += ' ORDER BY xi.issue_date DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Create invoice in Xero
router.post('/invoices', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, project_id, line_items, due_date } = req.body;

    // In production, create invoice via Xero API
    // This is a placeholder

    const result = await query(
      `INSERT INTO xero_invoices (xero_invoice_id, client_id, project_id, status, line_items, due_date, synced_at)
       VALUES ($1, $2, $3, 'DRAFT', $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [`INV-${Date.now()}`, client_id, project_id, JSON.stringify(line_items), due_date]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Get quotes from Xero (cached)
router.get('/quotes', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT xq.*, c.name as client_name
      FROM xero_quotes xq
      LEFT JOIN clients c ON xq.client_id = c.id
      ORDER BY xq.issue_date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// Create quote in Xero
router.post('/quotes', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, project_id, line_items, expiry_date } = req.body;

    const result = await query(
      `INSERT INTO xero_quotes (xero_quote_id, client_id, project_id, status, line_items, expiry_date, synced_at)
       VALUES ($1, $2, $3, 'PENDING', $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [`QTE-${Date.now()}`, client_id, project_id, JSON.stringify(line_items), expiry_date]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// Convert quote to invoice
router.post('/quotes/:id/convert', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const quote = await query('SELECT * FROM xero_quotes WHERE id = $1', [req.params.id]);
    
    if (quote.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const q = quote.rows[0];

    // Create invoice from quote
    const invoice = await query(
      `INSERT INTO xero_invoices (xero_invoice_id, client_id, project_id, status, line_items, total, synced_at)
       VALUES ($1, $2, $3, 'DRAFT', $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [`INV-${Date.now()}`, q.client_id, q.project_id, q.line_items, q.total]
    );

    // Update quote status
    await query(
      `UPDATE xero_quotes SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );

    res.json(invoice.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to convert quote' });
  }
});

// Get financial summary
router.get('/summary', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Outstanding invoices
    const outstanding = await query(`
      SELECT COALESCE(SUM(amount_due), 0) as total
      FROM xero_invoices
      WHERE status IN ('AUTHORISED', 'SUBMITTED')
    `);

    // Paid this month
    const paidThisMonth = await query(`
      SELECT COALESCE(SUM(amount_paid), 0) as total
      FROM xero_invoices
      WHERE status = 'PAID'
      AND updated_at >= date_trunc('month', CURRENT_DATE)
    `);

    // Pending quotes
    const pendingQuotes = await query(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
      FROM xero_quotes
      WHERE status = 'PENDING'
    `);

    // Revenue last 6 months
    const revenueByMonth = await query(`
      SELECT 
        date_trunc('month', issue_date) as month,
        COALESCE(SUM(total), 0) as total
      FROM xero_invoices
      WHERE status = 'PAID'
      AND issue_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY date_trunc('month', issue_date)
      ORDER BY month ASC
    `);

    // Top clients by revenue
    const topClients = await query(`
      SELECT 
        c.id, c.name,
        COALESCE(SUM(xi.total), 0) as total_revenue
      FROM clients c
      LEFT JOIN xero_invoices xi ON c.id = xi.client_id AND xi.status = 'PAID'
      GROUP BY c.id, c.name
      ORDER BY total_revenue DESC
      LIMIT 5
    `);

    res.json({
      outstanding_invoices: parseFloat(outstanding.rows[0].total) || 0,
      paid_this_month: parseFloat(paidThisMonth.rows[0].total) || 0,
      pending_quotes: {
        total: parseFloat(pendingQuotes.rows[0].total) || 0,
        count: parseInt(pendingQuotes.rows[0].count) || 0
      },
      revenue_by_month: revenueByMonth.rows,
      top_clients: topClients.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

export default router;
