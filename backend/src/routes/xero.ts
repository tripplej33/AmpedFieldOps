import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// Note: In production, use the xero-node package for actual Xero API integration
// This is a placeholder implementation showing the structure

// Helper to get Xero credentials from settings or env
async function getXeroCredentials() {
  // First try database settings
  const clientIdResult = await query(
    `SELECT value FROM settings WHERE key = 'xero_client_id' AND user_id IS NULL`
  );
  const clientSecretResult = await query(
    `SELECT value FROM settings WHERE key = 'xero_client_secret' AND user_id IS NULL`
  );
  
  const clientId = clientIdResult.rows[0]?.value || process.env.XERO_CLIENT_ID;
  const clientSecret = clientSecretResult.rows[0]?.value || process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/xero/callback`;
  
  return { clientId, clientSecret, redirectUri };
}

// Get Xero authorization URL
router.get('/auth/url', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = await getXeroCredentials();
    
    if (!clientId || !clientSecret) {
      return res.status(400).json({ 
        error: 'Xero credentials not configured. Please add your Client ID and Client Secret in Settings.',
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
    console.error('Failed to generate Xero auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle Xero OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    if (!code) {
      return res.redirect(`${frontendUrl}/settings?xero_error=no_code`);
    }

    // Get credentials from database settings
    const { clientId, clientSecret, redirectUri } = await getXeroCredentials();

    if (!clientId || !clientSecret) {
      return res.redirect(`${frontendUrl}/settings?xero_error=credentials_missing`);
    }

    // Exchange code for tokens using actual Xero API
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Xero token exchange failed:', errorText);
      return res.redirect(`${frontendUrl}/settings?xero_error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Get tenant info (organization connected)
    let tenantId = null;
    let tenantName = 'Connected Organization';
    
    try {
      const connectionsResponse = await fetch('https://api.xero.com/connections', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (connectionsResponse.ok) {
        const connections = await connectionsResponse.json();
        if (connections && connections.length > 0) {
          tenantId = connections[0].tenantId;
          tenantName = connections[0].tenantName;
        }
      }
    } catch (e) {
      console.error('Failed to get Xero connections:', e);
    }

    // Store tokens (replace any existing)
    await query('DELETE FROM xero_tokens');
    
    await query(
      `INSERT INTO xero_tokens (access_token, refresh_token, id_token, token_type, expires_at, tenant_id, tenant_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tokens.access_token,
        tokens.refresh_token,
        tokens.id_token || null,
        tokens.token_type,
        expiresAt,
        tenantId,
        tenantName
      ]
    );

    res.redirect(`${frontendUrl}/settings?xero_connected=true`);
  } catch (error) {
    console.error('Xero callback error:', error);
    res.redirect(`${frontendUrl}/settings?xero_error=callback_failed`);
  }
});

// Get Xero connection status
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT tenant_id, tenant_name, expires_at, updated_at FROM xero_tokens ORDER BY created_at DESC LIMIT 1`
    );

    // Check if credentials are configured
    const { clientId, clientSecret } = await getXeroCredentials();
    const isConfigured = !!(clientId && clientSecret);

    if (result.rows.length === 0) {
      return res.json({ 
        connected: false,
        configured: isConfigured
      });
    }

    const token = result.rows[0];
    const isExpired = new Date(token.expires_at) < new Date();

    res.json({
      connected: true,
      configured: isConfigured,
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

    if (!client_id) {
      return res.status(400).json({ error: 'Client is required' });
    }

    // Calculate total from line items
    const total = Array.isArray(line_items) 
      ? line_items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
      : 0;

    // Generate invoice number
    const countResult = await query('SELECT COUNT(*) as count FROM xero_invoices');
    const invoiceNumber = `INV-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    // In production, create invoice via Xero API and get xero_invoice_id
    // This is a placeholder that stores locally first

    const result = await query(
      `INSERT INTO xero_invoices (xero_invoice_id, invoice_number, client_id, project_id, status, line_items, total, amount_due, due_date, issue_date, synced_at)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $6, $7, CURRENT_DATE, CURRENT_TIMESTAMP)
       RETURNING *`,
      [invoiceNumber, invoiceNumber, client_id, project_id || null, JSON.stringify(line_items), total, due_date || null]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'invoice', result.rows[0].id, JSON.stringify({ invoice_number: invoiceNumber, total })]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create invoice:', error);
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
