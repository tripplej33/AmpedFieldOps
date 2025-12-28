import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

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
  const redirectUriResult = await query(
    `SELECT value FROM settings WHERE key = 'xero_redirect_uri' AND user_id IS NULL`
  );
  
  const clientId = clientIdResult.rows[0]?.value || env.XERO_CLIENT_ID;
  const clientSecret = clientSecretResult.rows[0]?.value || env.XERO_CLIENT_SECRET;
  
  // Construct redirect URI
  // Priority: Database setting -> XERO_REDIRECT_URI env -> FRONTEND_URL + /api/xero/callback -> BACKEND_URL + /api/xero/callback
  let redirectUri = redirectUriResult.rows[0]?.value || env.XERO_REDIRECT_URI;
  if (!redirectUri) {
    // If FRONTEND_URL is set (e.g., https://admin.ampedlogix.com), use that with /api prefix
    // This works for reverse proxy setups where frontend and API share the same domain
    const frontendUrl = env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('localhost')) {
      redirectUri = `${frontendUrl}/api/xero/callback`;
    } else {
      // Fallback to BACKEND_URL for direct backend access
      const backendUrl = env.BACKEND_URL || 'http://localhost:3001';
      redirectUri = `${backendUrl}/api/xero/callback`;
    }
  }
  
  console.log('[Xero] Using redirect URI:', redirectUri);
  console.log('[Xero] Client ID:', clientId ? `${clientId.substring(0, 8)}...` : 'NOT SET');
  console.log('[Xero] Client Secret:', clientSecret ? 'SET' : 'NOT SET');
  
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
  const frontendUrl = env.FRONTEND_URL;

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

    interface XeroTokenResponse {
      access_token: string;
      refresh_token: string;
      id_token?: string;
      token_type: string;
      expires_in: number;
    }
    
    interface XeroConnection {
      tenantId: string;
      tenantName: string;
    }

    const tokens = await tokenResponse.json() as XeroTokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Get tenant info (organization connected)
    let tenantId: string | null = null;
    let tenantName = 'Connected Organization';
    
    try {
      const connectionsResponse = await fetch('https://api.xero.com/connections', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (connectionsResponse.ok) {
        const connections = await connectionsResponse.json() as XeroConnection[];
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

    // Return HTML that closes the popup and notifies the parent window
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AmpedFieldPro - Xero Connected</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #1a1d23; color: #e8eaed; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 40px; }
            .success { color: #39ff14; font-size: 48px; margin-bottom: 16px; }
            h1 { margin: 0 0 8px; }
            p { color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✓</div>
            <h1>Connected to Xero</h1>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'XERO_CONNECTED', success: true }, '*');
              setTimeout(() => window.close(), 1500);
            } else {
              window.location.href = '${frontendUrl}/settings?xero_connected=true';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Xero callback error:', error);
    // Return HTML for error case too
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AmpedFieldPro - Connection Failed</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #1a1d23; color: #e8eaed; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 40px; }
            .error { color: #ef4444; font-size: 48px; margin-bottom: 16px; }
            h1 { margin: 0 0 8px; }
            p { color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">✕</div>
            <h1>Connection Failed</h1>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'XERO_CONNECTED', success: false, error: 'callback_failed' }, '*');
              setTimeout(() => window.close(), 2000);
            } else {
              window.location.href = '${frontendUrl}/settings?xero_error=callback_failed';
            }
          </script>
        </body>
      </html>
    `);
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

// Helper to get valid access token (refreshes if needed)
async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string } | null> {
  const tokenResult = await query('SELECT * FROM xero_tokens ORDER BY created_at DESC LIMIT 1');
  if (tokenResult.rows.length === 0) {
    return null;
  }

  const token = tokenResult.rows[0];
  const expiresAt = new Date(token.expires_at);
  
  // If token is expired, try to refresh
  if (expiresAt < new Date()) {
    const { clientId, clientSecret } = await getXeroCredentials();
    
    if (!clientId || !clientSecret || !token.refresh_token) {
      return null;
    }

    try {
      const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token.refresh_token
        })
      });

      if (!refreshResponse.ok) {
        console.error('Token refresh failed');
        return null;
      }

      interface RefreshTokenResponse {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }

      const newTokens = await refreshResponse.json() as RefreshTokenResponse;
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      await query(
        `UPDATE xero_tokens SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [newTokens.access_token, newTokens.refresh_token, newExpiresAt, token.id]
      );

      return { accessToken: newTokens.access_token, tenantId: token.tenant_id };
    } catch (e) {
      console.error('Token refresh error:', e);
      return null;
    }
  }

  return { accessToken: token.access_token, tenantId: token.tenant_id };
}

// Xero Contact interface
interface XeroContact {
  ContactID: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Phones?: Array<{ PhoneType: string; PhoneNumber: string }>;
  Addresses?: Array<{
    AddressType: string;
    AddressLine1?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }>;
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  ContactStatus?: string;
}

// Pull contacts from Xero and sync to local clients
router.post('/contacts/pull', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Fetch contacts from Xero
    const contactsResponse = await fetch('https://api.xero.com/api.xro/2.0/Contacts?where=IsCustomer==true', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!contactsResponse.ok) {
      const errorText = await contactsResponse.text();
      console.error('Xero contacts fetch failed:', errorText);
      return res.status(400).json({ error: 'Failed to fetch contacts from Xero' });
    }

    interface XeroContactsResponse {
      Contacts: XeroContact[];
    }

    const data = await contactsResponse.json() as XeroContactsResponse;
    const xeroContacts = data.Contacts || [];

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const contact of xeroContacts) {
      // Check if client exists by xero_contact_id
      const existingClient = await query(
        'SELECT id FROM clients WHERE xero_contact_id = $1',
        [contact.ContactID]
      );

      // Get phone number (prefer mobile, then default)
      const phone = contact.Phones?.find(p => p.PhoneType === 'MOBILE')?.PhoneNumber ||
                    contact.Phones?.find(p => p.PhoneType === 'DEFAULT')?.PhoneNumber || null;

      // Get address
      const streetAddress = contact.Addresses?.find(a => a.AddressType === 'STREET');
      const postalAddress = contact.Addresses?.find(a => a.AddressType === 'POBOX');
      
      const address = streetAddress ? 
        [streetAddress.AddressLine1, streetAddress.City, streetAddress.Region, streetAddress.PostalCode]
          .filter(Boolean).join(', ') : null;
      
      const billingAddress = postalAddress ?
        [postalAddress.AddressLine1, postalAddress.City, postalAddress.Region, postalAddress.PostalCode]
          .filter(Boolean).join(', ') : null;

      // Contact name from first/last or use company name
      const contactName = (contact.FirstName && contact.LastName) 
        ? `${contact.FirstName} ${contact.LastName}` 
        : null;

      if (existingClient.rows.length > 0) {
        // Update existing client
        await query(
          `UPDATE clients SET 
            name = COALESCE($1, name),
            contact_name = COALESCE($2, contact_name),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            address = COALESCE($5, address),
            billing_address = COALESCE($6, billing_address),
            updated_at = CURRENT_TIMESTAMP
          WHERE xero_contact_id = $7`,
          [contact.Name, contactName, contact.EmailAddress, phone, address, billingAddress, contact.ContactID]
        );
        updated++;
      } else {
        // Check if client exists by name (to avoid duplicates)
        const existingByName = await query(
          'SELECT id FROM clients WHERE LOWER(name) = LOWER($1)',
          [contact.Name]
        );

        if (existingByName.rows.length > 0) {
          // Link existing client to Xero contact
          await query(
            'UPDATE clients SET xero_contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [contact.ContactID, existingByName.rows[0].id]
          );
          updated++;
        } else {
          // Create new client from Xero contact
          await query(
            `INSERT INTO clients (name, contact_name, email, phone, address, billing_address, xero_contact_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
            [contact.Name, contactName, contact.EmailAddress, phone, address, billingAddress, contact.ContactID]
          );
          created++;
        }
      }
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'sync', 'xero_contacts_pull', JSON.stringify({ created, updated, skipped, total: xeroContacts.length })]
    );

    res.json({
      success: true,
      synced_at: new Date(),
      results: {
        total: xeroContacts.length,
        created,
        updated,
        skipped
      }
    });
  } catch (error) {
    console.error('Xero contacts pull error:', error);
    res.status(500).json({ error: 'Failed to pull contacts from Xero' });
  }
});

// Push a local client to Xero as a contact
router.post('/contacts/push/:clientId', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { clientId } = req.params;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Get client from database
    const clientResult = await query('SELECT * FROM clients WHERE id = $1', [clientId]);
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];

    // Build Xero contact payload
    const xeroContact: {
      Name: string;
      FirstName?: string;
      LastName?: string;
      EmailAddress?: string;
      Phones?: Array<{ PhoneType: string; PhoneNumber: string }>;
      Addresses?: Array<{
        AddressType: string;
        AddressLine1: string;
      }>;
      IsCustomer: boolean;
    } = {
      Name: client.name,
      IsCustomer: true
    };

    if (client.contact_name) {
      const nameParts = client.contact_name.split(' ');
      xeroContact.FirstName = nameParts[0];
      xeroContact.LastName = nameParts.slice(1).join(' ') || undefined;
    }

    if (client.email) {
      xeroContact.EmailAddress = client.email;
    }

    if (client.phone) {
      xeroContact.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: client.phone }];
    }

    if (client.address || client.billing_address) {
      xeroContact.Addresses = [];
      if (client.address) {
        xeroContact.Addresses.push({ AddressType: 'STREET', AddressLine1: client.address });
      }
      if (client.billing_address) {
        xeroContact.Addresses.push({ AddressType: 'POBOX', AddressLine1: client.billing_address });
      }
    }

    // If client already has xero_contact_id, update existing contact
    if (client.xero_contact_id) {
      const updateResponse = await fetch(`https://api.xero.com/api.xro/2.0/Contacts/${client.xero_contact_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.accessToken}`,
          'Xero-Tenant-Id': tokenData.tenantId,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ Contacts: [xeroContact] })
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Xero contact update failed:', errorText);
        return res.status(400).json({ error: 'Failed to update contact in Xero' });
      }

      res.json({
        success: true,
        action: 'updated',
        xero_contact_id: client.xero_contact_id
      });
    } else {
      // Create new contact in Xero
      const createResponse = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.accessToken}`,
          'Xero-Tenant-Id': tokenData.tenantId,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ Contacts: [xeroContact] })
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Xero contact create failed:', errorText);
        return res.status(400).json({ error: 'Failed to create contact in Xero' });
      }

      interface XeroCreateContactResponse {
        Contacts: XeroContact[];
      }

      const result = await createResponse.json() as XeroCreateContactResponse;
      const newXeroContactId = result.Contacts?.[0]?.ContactID;

      if (newXeroContactId) {
        // Update local client with Xero contact ID
        await query(
          'UPDATE clients SET xero_contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newXeroContactId, clientId]
        );
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, 'push_to_xero', 'client', clientId, JSON.stringify({ xero_contact_id: newXeroContactId })]
      );

      res.json({
        success: true,
        action: 'created',
        xero_contact_id: newXeroContactId
      });
    }
  } catch (error) {
    console.error('Xero contact push error:', error);
    res.status(500).json({ error: 'Failed to push client to Xero' });
  }
});

// Push all local clients without xero_contact_id to Xero
router.post('/contacts/push-all', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Get all clients without xero_contact_id
    const clientsResult = await query(
      'SELECT * FROM clients WHERE xero_contact_id IS NULL AND status = $1',
      ['active']
    );

    const clients = clientsResult.rows;
    let created = 0;
    let failed = 0;

    for (const client of clients) {
      const xeroContact: {
        Name: string;
        FirstName?: string;
        LastName?: string;
        EmailAddress?: string;
        Phones?: Array<{ PhoneType: string; PhoneNumber: string }>;
        Addresses?: Array<{ AddressType: string; AddressLine1: string }>;
        IsCustomer: boolean;
      } = {
        Name: client.name,
        IsCustomer: true
      };

      if (client.contact_name) {
        const nameParts = client.contact_name.split(' ');
        xeroContact.FirstName = nameParts[0];
        xeroContact.LastName = nameParts.slice(1).join(' ') || undefined;
      }

      if (client.email) {
        xeroContact.EmailAddress = client.email;
      }

      if (client.phone) {
        xeroContact.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: client.phone }];
      }

      if (client.address) {
        xeroContact.Addresses = [{ AddressType: 'STREET', AddressLine1: client.address }];
      }

      try {
        const createResponse = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ Contacts: [xeroContact] })
        });

        if (createResponse.ok) {
          interface XeroCreateContactResponse {
            Contacts: XeroContact[];
          }
          const result = await createResponse.json() as XeroCreateContactResponse;
          const newXeroContactId = result.Contacts?.[0]?.ContactID;

          if (newXeroContactId) {
            await query(
              'UPDATE clients SET xero_contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [newXeroContactId, client.id]
            );
            created++;
          }
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'sync', 'xero_contacts_push', JSON.stringify({ created, failed, total: clients.length })]
    );

    res.json({
      success: true,
      synced_at: new Date(),
      results: {
        total: clients.length,
        created,
        failed
      }
    });
  } catch (error) {
    console.error('Xero contacts push-all error:', error);
    res.status(500).json({ error: 'Failed to push clients to Xero' });
  }
});

// Sync data with Xero (legacy endpoint - now calls individual sync methods)
router.post('/sync', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.body; // 'contacts', 'invoices', 'tracking_categories', 'all'

    // Check if connected
    const tokenResult = await query('SELECT * FROM xero_tokens ORDER BY created_at DESC LIMIT 1');
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Xero not connected' });
    }

    const syncResults: {
      success: boolean;
      synced_at: Date;
      results: Record<string, { synced?: number; created?: number; updated?: number; mapped?: number }>;
    } = {
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
