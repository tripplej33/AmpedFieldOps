import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { log } from '../lib/logger';
import { ensureXeroTables } from '../db/ensureXeroTables';
import { fetchWithRateLimit } from '../lib/xero/rateLimiter';
import { parseXeroError, getErrorMessage } from '../lib/xero/errorHandler';
import { createPaymentInXero, storePayment, getPayments, CreatePaymentData } from '../lib/xero/payments';
import { importBankTransactions, getBankTransactions, reconcileTransaction } from '../lib/xero/bankTransactions';
import { 
  createPurchaseOrderInXero, 
  storePurchaseOrder, 
  getPurchaseOrders, 
  getPurchaseOrderById, 
  updatePurchaseOrderStatus,
  CreatePurchaseOrderData 
} from '../lib/xero/purchaseOrders';
import { createBillInXero, storeBill, getBills, markBillAsPaid, CreateBillData } from '../lib/xero/bills';
import { createExpenseInXero, storeExpense, getExpenses, CreateExpenseData } from '../lib/xero/expenses';
import { 
  getProfitLossReport, 
  getBalanceSheetReport, 
  getCashFlowReport, 
  getAgedReceivablesReport, 
  getAgedPayablesReport 
} from '../lib/xero/reports';
import { syncItemsFromXero, getItems, getItemById, updateItemStock } from '../lib/xero/items';
import { 
  createCreditNoteInXero, 
  applyCreditNoteToInvoice, 
  storeCreditNote, 
  getCreditNotes, 
  CreateCreditNoteData 
} from '../lib/xero/creditNotes';
import { 
  getReminderSchedule, 
  updateReminderSchedule, 
  sendPaymentReminder, 
  processPaymentReminders, 
  getReminderHistory 
} from '../lib/xero/reminders';
import { 
  verifyWebhookSignature, 
  storeWebhookEvent, 
  processWebhookEvent, 
  getWebhookStatus, 
  getWebhookEvents 
} from '../lib/xero/webhooks';

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
  
  const clientIdFromDb = clientIdResult.rows[0]?.value;
  const clientSecretFromDb = clientSecretResult.rows[0]?.value;
  const clientId = clientIdFromDb || env.XERO_CLIENT_ID;
  const clientSecret = clientSecretFromDb || env.XERO_CLIENT_SECRET;
  
  // Construct redirect URI
  // Priority: Database setting -> XERO_REDIRECT_URI env -> FRONTEND_URL + /api/xero/callback -> BACKEND_URL + /api/xero/callback
  const savedRedirectUri = redirectUriResult.rows[0]?.value;
  let redirectUri = savedRedirectUri || env.XERO_REDIRECT_URI;
  
  // Log what we found with full details
  console.log('[Xero] Credential sources:', {
    clientId: {
      fromDatabase: clientIdFromDb ? `${String(clientIdFromDb).substring(0, 8)}... (${String(clientIdFromDb).length} chars)` : 'NOT SET',
      fromEnv: env.XERO_CLIENT_ID ? `${env.XERO_CLIENT_ID.substring(0, 8)}...` : 'NOT SET',
      final: clientId ? `${String(clientId).substring(0, 8)}... (${String(clientId).length} chars)` : 'NOT SET'
    },
    clientSecret: {
      fromDatabase: clientSecretFromDb ? `${String(clientSecretFromDb).length} chars` : 'NOT SET',
      fromEnv: env.XERO_CLIENT_SECRET ? `${env.XERO_CLIENT_SECRET.length} chars` : 'NOT SET',
      final: clientSecret ? `${String(clientSecret).length} chars` : 'NOT SET'
    },
    redirectUri: {
      fromDatabase: savedRedirectUri || 'NOT SET',
      fromEnv: env.XERO_REDIRECT_URI || 'NOT SET',
      frontendUrl: env.FRONTEND_URL || 'NOT SET',
      backendUrl: env.BACKEND_URL || 'NOT SET',
      final: redirectUri || 'NOT SET'
    }
  });
  
  // Validate Client ID format
  if (clientId) {
    const clientIdStr = String(clientId);
    if (clientIdStr.includes('@')) {
      log.error('[Xero] ERROR: Client ID appears to be an email address', null, { clientId: clientId?.substring(0, 8) + '...' });
      log.error('[Xero] Client ID should be a 32-character hexadecimal string, not an email!');
      log.error('[Xero] Please update the Client ID in Settings to your actual Xero Client ID from https://developer.xero.com/myapps');
    } else if (clientIdStr.length !== 32) {
      console.warn('[Xero] Client ID length unusual:', clientIdStr.length, 'Expected 32 characters');
    } else if (!/^[0-9A-Fa-f]{32}$/.test(clientIdStr)) {
      console.warn('[Xero] Client ID should contain only hexadecimal characters (0-9, A-F)');
    }
  }
  
  if (!redirectUri || redirectUri.trim() === '') {
    // If FRONTEND_URL is set (e.g., https://admin.ampedlogix.com), use that with /api prefix
    // This works for reverse proxy setups where frontend and API share the same domain
    const frontendUrl = env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('localhost')) {
      redirectUri = `${frontendUrl}/api/xero/callback`;
      console.log('[Xero] Using redirect URI from FRONTEND_URL');
    } else {
      // Fallback to BACKEND_URL for direct backend access
      const backendUrl = env.BACKEND_URL || 'http://localhost:3001';
      redirectUri = `${backendUrl}/api/xero/callback`;
      console.log('[Xero] Using redirect URI from BACKEND_URL (fallback)');
    }
  } else {
    console.log('[Xero] Using redirect URI from database settings');
  }
  
  console.log('[Xero] Final redirect URI:', redirectUri);
  console.log('[Xero] Client ID:', clientId ? `${clientId.substring(0, 8)}...` : 'NOT SET');
  console.log('[Xero] Client Secret:', clientSecret ? 'SET' : 'NOT SET');
  
  return { clientId, clientSecret, redirectUri };
}

// Get Xero authorization URL
router.get('/auth/url', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = await getXeroCredentials();
    
    if (!clientId || !clientSecret) {
      console.error('[Xero] Missing credentials:', { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret 
      });
      return res.status(400).json({ 
        error: 'Xero credentials not configured. Please add your Client ID and Client Secret in Settings.',
        configured: false,
        details: {
          clientId: clientId ? 'Set' : 'Missing',
          clientSecret: clientSecret ? 'Set' : 'Missing'
        }
      });
    }
    
    // Validate Client ID is not an email address
    const clientIdStr = String(clientId);
    if (clientIdStr.includes('@')) {
      console.error('[Xero] Invalid Client ID: Email address detected:', clientIdStr);
      return res.status(400).json({
        error: 'Invalid Client ID: Email addresses cannot be used. Please enter your 32-character Xero Client ID from the Xero Developer Portal.',
        configured: false,
        details: {
          issue: 'Client ID appears to be an email address',
          expected: '32-character hexadecimal string',
          actual: clientIdStr.substring(0, 20) + '...',
          help: 'Get your Client ID from https://developer.xero.com/myapps'
        }
      });
    }
    
    // Validate Client ID format (Xero Client IDs are typically 32 characters)
    if (clientIdStr.length !== 32) {
      console.warn('[Xero] Client ID length incorrect:', clientIdStr.length, 'Expected 32');
      return res.status(400).json({
        error: `Invalid Client ID format. Xero Client IDs must be exactly 32 characters (you have ${clientIdStr.length}).`,
        configured: false,
        details: {
          expectedLength: 32,
          actualLength: clientIdStr.length,
          help: 'Get your Client ID from https://developer.xero.com/myapps'
        }
      });
    }
    
    // Validate it's hexadecimal
    if (!/^[0-9A-Fa-f]{32}$/.test(clientIdStr)) {
      console.warn('[Xero] Client ID should contain only hexadecimal characters');
    }

    // Validate redirect URI format
    try {
      const redirectUrl = new URL(redirectUri);
      if (redirectUrl.protocol !== 'https:' && !redirectUrl.hostname.includes('localhost')) {
        console.warn('[Xero] Redirect URI should use HTTPS for production:', redirectUri);
      }
    } catch (e) {
      console.error('[Xero] Invalid redirect URI format:', redirectUri);
      return res.status(400).json({
        error: 'Invalid redirect URI format',
        details: 'Redirect URI must be a valid URL'
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

    console.log('[Xero] Generated auth URL with:', {
      clientId: `${clientId.substring(0, 8)}...`,
      clientIdFull: clientId, // Log full ID for debugging (remove in production)
      redirectUri,
      redirectUriEncoded: encodeURIComponent(redirectUri),
      scopes: scopes.split(' ').length + ' scopes',
      state: req.user!.id,
      authUrlPreview: authUrl.substring(0, 100) + '...'
    });

    // Return detailed info for debugging (including full client ID for verification)
    res.json({ 
      url: authUrl, 
      configured: true,
      redirectUri, // Return redirect URI so frontend can verify
      clientId: clientId, // Return full client ID for verification
      clientIdPrefix: clientId.substring(0, 8), // For display
      verification: {
        redirectUriMatch: 'Ensure this exact URI is in your Xero app: ' + redirectUri,
        clientIdMatch: 'Ensure this Client ID matches your Xero app: ' + clientId,
        xeroAppUrl: 'https://developer.xero.com/myapps'
      }
    });
  } catch (error: any) {
      log.error('[Xero] Failed to generate auth URL', error, {
        error: error.message,
        stack: error.stack
      });
    res.status(500).json({ 
      error: 'Failed to generate auth URL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Handle Xero OAuth callback
// Helper function to send response that works in both popup and full-page redirect
function sendPopupOrRedirect(res: Response, frontendUrl: string, type: 'success' | 'error', message: string, errorParams?: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Xero Connection ${type === 'success' ? 'Successful' : 'Error'}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #1a1d23;
            color: #e8eaed;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 400px;
          }
          .icon {
            font-size: 48px;
            margin-bottom: 16px;
          }
          .success { color: #39ff14; }
          .error { color: #ef4444; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { color: #9ca3af; margin: 8px 0; }
          a { color: #60a5fa; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon ${type}">
            ${type === 'success' ? '✓' : '✗'}
          </div>
          <h1>Connection ${type === 'success' ? 'Successful' : 'Failed'}</h1>
          <p>${message}</p>
          <p>This window should close automatically.</p>
        </div>
        <script>
          (function() {
            console.log('[Xero Callback] Window opener:', window.opener ? 'exists' : 'null');
            console.log('[Xero Callback] Window opener closed:', window.opener ? window.opener.closed : 'N/A');
            console.log('[Xero Callback] Origin:', window.location.origin);
            
            // Try to send message to parent window (popup mode)
            if (window.opener && !window.opener.closed) {
              try {
                const messageData = {
                  type: type === 'success' ? 'XERO_OAUTH_SUCCESS' : 'XERO_OAUTH_ERROR',
                  message: ${JSON.stringify(message)},
                  errorParams: ${JSON.stringify(errorParams || '')}
                };
                
                console.log('[Xero Callback] Sending postMessage:', messageData);
                
                // Send message with retry logic
                let retries = 0;
                const maxRetries = 3;
                const sendMessage = () => {
                  try {
                    window.opener.postMessage(messageData, window.location.origin);
                    console.log('[Xero Callback] postMessage sent successfully');
                    
                    // Close after a short delay to ensure message is received
                    setTimeout(function() {
                      console.log('[Xero Callback] Closing window...');
                      if (window.opener && !window.opener.closed) {
                        window.close();
                      }
                    }, 500);
                  } catch (e) {
                    console.error('[Xero Callback] Failed to postMessage, retry', retries + 1, ':', e);
                    if (retries < maxRetries) {
                      retries++;
                      setTimeout(sendMessage, 200);
                    } else {
                      // Fallback: try redirect after max retries
                      setTimeout(function() {
                        window.location.href = '${frontendUrl}/settings?xero_connected=${type === 'success' ? 'true' : 'false'}';
                      }, 1000);
                    }
                  }
                };
                
                sendMessage();
                return; // Exit early, don't redirect
              } catch (e) {
                console.error('[Xero Callback] Failed to postMessage:', e);
              }
            }
            
            // Fallback: redirect if not in popup (only if opener doesn't exist or is closed)
            console.log('[Xero Callback] No opener or opener closed, redirecting...');
            setTimeout(function() {
              ${type === 'success' 
                ? `window.location.href = '${frontendUrl}/settings?xero_connected=true';`
                : `window.location.href = '${frontendUrl}/settings${errorParams || ''}';`
              }
            }, 1000);
          })();
        </script>
      </body>
    </html>
  `;
  return res.send(html);
}

router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  // Get credentials first to determine the correct frontend URL
  // This ensures we use the same domain as the redirect URI
  let frontendUrl = env.FRONTEND_URL;
  
  try {
    const { redirectUri } = await getXeroCredentials();
    // Extract frontend URL from redirect URI (remove /api/xero/callback)
    if (redirectUri) {
      try {
        const redirectUrl = new URL(redirectUri);
        // If redirect URI is like https://admin.ampedlogix.com/api/xero/callback
        // Extract https://admin.ampedlogix.com
        frontendUrl = redirectUrl.origin;
        console.log('[Xero] Using frontend URL from redirect URI:', frontendUrl);
      } catch (e) {
        console.warn('[Xero] Could not parse redirect URI for frontend URL:', redirectUri);
      }
    }
  } catch (e) {
    console.warn('[Xero] Could not get credentials for frontend URL, using env:', e);
  }
  
  // Fallback to env or localhost
  if (!frontendUrl || frontendUrl.includes('localhost')) {
    frontendUrl = env.FRONTEND_URL || 'http://localhost:3000';
    console.log('[Xero] Using frontend URL from env or fallback:', frontendUrl);
  }

  try {
    // Check for OAuth errors from Xero
    if (error) {
      const errorStr: string = Array.isArray(error) 
        ? String(error[0]) 
        : typeof error === 'string' 
          ? error 
          : String(error);
      const errorDescStr: string | undefined = error_description 
        ? (Array.isArray(error_description) 
            ? String(error_description[0]) 
            : typeof error_description === 'string'
              ? error_description
              : String(error_description))
        : undefined;
      
      // Get credentials to include in error message
      const { clientId, redirectUri } = await getXeroCredentials();
      
      const errorDetails = {
        error: errorStr,
        error_description: errorDescStr,
        clientId: clientId || 'NOT SET',
        redirectUri: redirectUri || 'NOT SET',
        query: req.query
      };
      
      console.error('[Xero] OAuth error from Xero:', errorDetails);
      
      // Log to database error log if available
      try {
        await query(
          `INSERT INTO error_logs (type, message, details, created_at) 
           VALUES ($1, $2, $3, NOW())`,
          [
            'xero_oauth',
            `Xero OAuth Error: ${errorStr}`,
            JSON.stringify(errorDetails)
          ]
        );
      } catch (logError) {
        // Ignore if error_logs table doesn't exist
        console.warn('[Xero] Could not log to error_logs table:', logError);
      }
      
      let errorMessage = 'Authentication failed';
      if (errorStr === 'unauthorized_client') {
        errorMessage = `Client ID or Secret is incorrect, or redirect URI does not match Xero app settings.\n\n` +
          `Client ID being used: ${clientId || 'NOT SET'}\n` +
          `Redirect URI being used: ${redirectUri || 'NOT SET'}\n\n` +
          `Please verify these match your Xero app settings exactly.`;
      } else if (errorStr === 'access_denied') {
        errorMessage = 'Connection was cancelled by user';
      } else if (errorDescStr) {
        errorMessage = `${errorDescStr}\n\nClient ID: ${clientId || 'NOT SET'}\nRedirect URI: ${redirectUri || 'NOT SET'}`;
      }
      
      return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_error=${encodeURIComponent(errorStr)}&xero_error_msg=${encodeURIComponent(errorMessage)}`);
    }

    // Ensure code is a string
    const codeStr: string | null = code 
      ? (Array.isArray(code) 
          ? String(code[0]) 
          : typeof code === 'string' 
            ? code 
            : String(code))
      : null;
    
    if (!codeStr) {
      console.error('[Xero] No authorization code received:', { query: req.query });
      return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_error=no_code&xero_error_msg=${encodeURIComponent('No authorization code received from Xero')}`);
    }

    // Get credentials from database settings
    const { clientId, clientSecret, redirectUri } = await getXeroCredentials();

    if (!clientId || !clientSecret) {
      console.error('[Xero] Missing credentials in callback');
      return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_error=credentials_missing&xero_error_msg=${encodeURIComponent('Xero credentials not found. Please configure them in Settings.')}`);
    }

    // Ensure credentials are trimmed and valid
    const trimmedClientId = String(clientId).trim();
    const trimmedClientSecret = String(clientSecret).trim();
    const trimmedRedirectUri = redirectUri.trim();
    
    // Validate Client ID format before token exchange
    if (trimmedClientId.includes('@')) {
      console.error('[Xero] ERROR: Client ID is an email address during token exchange:', trimmedClientId);
      return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_error=invalid_client_id&xero_error_msg=${encodeURIComponent('Client ID appears to be an email address. Please enter your 32-character Xero Client ID from the Xero Developer Portal.')}`);
    }
    
    if (trimmedClientId.length !== 32) {
      console.error('[Xero] ERROR: Client ID length incorrect during token exchange:', {
        length: trimmedClientId.length,
        expected: 32,
        clientId: `${trimmedClientId.substring(0, 8)}...`
      });
      return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_error=invalid_client_id&xero_error_msg=${encodeURIComponent(`Client ID must be exactly 32 characters (currently ${trimmedClientId.length}). Please verify your Client ID in Settings.`)}`);
    }

    // Log Client Secret info (first 4 and last 4 chars for debugging, but not full secret)
    const clientSecretPreview = trimmedClientSecret.length > 8 
      ? `${trimmedClientSecret.substring(0, 4)}...${trimmedClientSecret.substring(trimmedClientSecret.length - 4)}`
      : trimmedClientSecret.length > 0 
        ? `${trimmedClientSecret.substring(0, Math.min(4, trimmedClientSecret.length))}...`
        : 'EMPTY';
    
    console.log('[Xero] Exchanging code for tokens:', {
      hasCode: !!codeStr,
      codeLength: codeStr.length,
      redirectUri: trimmedRedirectUri,
      clientId: trimmedClientId, // Log full Client ID for debugging
      clientIdLength: trimmedClientId.length,
      clientSecretLength: trimmedClientSecret.length,
      clientSecretPreview: clientSecretPreview,
      clientSecretHasWhitespace: trimmedClientSecret !== String(clientSecret).trim(),
      clientSecretSet: !!trimmedClientSecret
    });

    // Prepare Basic Auth header
    const basicAuth = Buffer.from(`${trimmedClientId}:${trimmedClientSecret}`).toString('base64');
    
    console.log('[Xero] Token exchange request details:', {
      url: 'https://identity.xero.com/connect/token',
      clientIdLength: trimmedClientId.length,
      clientSecretLength: trimmedClientSecret.length,
      basicAuthLength: basicAuth.length,
      basicAuthPreview: `${basicAuth.substring(0, 10)}...`,
      redirectUri: trimmedRedirectUri,
      grantType: 'authorization_code',
      codeLength: codeStr.length
    });

    // Exchange code for tokens using actual Xero API
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: codeStr,
        redirect_uri: trimmedRedirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      console.error('[Xero] Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
        redirectUri: trimmedRedirectUri,
        clientId: trimmedClientId, // Log full Client ID for debugging
        clientIdLength: trimmedClientId.length,
        clientSecretLength: trimmedClientSecret.length,
        clientSecretSet: !!trimmedClientSecret,
        redirectUriUsed: trimmedRedirectUri,
        requestDetails: {
          grant_type: 'authorization_code',
          codeLength: codeStr.length,
          redirect_uri: trimmedRedirectUri
        }
      });
      
      let errorMsg = 'Token exchange failed';
      let errorDetails = '';
      
      if (errorData.error === 'invalid_client') {
        errorMsg = 'Invalid Client ID or Client Secret.';
        errorDetails = `The credentials in your Settings don't match your Xero app.\n\n` +
          `Client ID used: ${trimmedClientId}\n` +
          `Client ID length: ${trimmedClientId.length} characters\n` +
          `Redirect URI used: ${trimmedRedirectUri}\n\n` +
          `Please verify:\n` +
          `1. Your Client ID in Settings matches the Client ID in your Xero app (https://developer.xero.com/myapps)\n` +
          `2. Your Client Secret in Settings matches the Client Secret in your Xero app\n` +
          `3. The Redirect URI "${trimmedRedirectUri}" is added to your Xero app's OAuth 2.0 redirect URIs`;
      } else if (errorData.error === 'invalid_grant') {
        errorMsg = 'Authorization code expired or invalid.';
        errorDetails = `The authorization code may have expired or the redirect URI doesn't match.\n\n` +
          `Redirect URI used: ${trimmedRedirectUri}\n\n` +
          `Please try connecting again.`;
      } else if (errorData.error_description) {
        errorMsg = errorData.error_description;
        errorDetails = `Xero error: ${errorData.error || 'Unknown error'}`;
      } else {
        errorDetails = `HTTP ${tokenResponse.status}: ${tokenResponse.statusText}`;
      }
      
      const fullErrorMessage = errorDetails ? `${errorMsg}\n\n${errorDetails}` : errorMsg;
      
      return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_error=token_exchange_failed&xero_error_msg=${encodeURIComponent(fullErrorMessage)}&client_id=${encodeURIComponent(trimmedClientId)}&redirect_uri=${encodeURIComponent(trimmedRedirectUri)}`);
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

    console.log('[Xero] Token exchange successful:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      expiresAt: expiresAt.toISOString()
    });

    // Get tenant info (organization connected)
    let tenantId: string | null = null;
    let tenantName = 'Connected Organization';
    
    try {
      console.log('[Xero] Fetching Xero connections...');
      const connectionsResponse = await fetchWithRateLimit('https://api.xero.com/connections', {
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
          console.log('[Xero] Found connected organization:', { tenantId, tenantName });
        } else {
          console.warn('[Xero] No connections found in response');
        }
      } else {
        const errorText = await connectionsResponse.text();
        console.error('[Xero] Failed to get connections:', {
          status: connectionsResponse.status,
          statusText: connectionsResponse.statusText,
          error: errorText
        });
      }
    } catch (e) {
      console.error('[Xero] Error fetching connections:', e);
      // Don't fail the whole process if we can't get tenant info
    }

    // Store tokens (replace any existing)
    try {
      console.log('[Xero] Storing tokens in database...');
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

      console.log('[Xero] Tokens stored successfully:', {
        tenantId,
        tenantName,
        expiresAt: expiresAt.toISOString()
      });
    } catch (dbError: any) {
      console.error('[Xero] Failed to store tokens in database:', {
        error: dbError.message,
        stack: dbError.stack,
        code: dbError.code
      });
      
      // Return error page but don't redirect to frontend with error
      // since Xero connection was successful
      return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
            <title>AmpedFieldOps - Storage Error</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #1a1d23; color: #e8eaed; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
              .container { text-align: center; padding: 40px; max-width: 600px; }
              .warning { color: #fbbf24; font-size: 48px; margin-bottom: 16px; }
            h1 { margin: 0 0 8px; }
              p { color: #9ca3af; margin: 8px 0; }
              .error-details { background: #2a2d33; padding: 16px; border-radius: 8px; margin-top: 16px; text-align: left; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
              <div class="warning">⚠️</div>
              <h1>Connection Successful, But Storage Failed</h1>
              <p>Your Xero connection was successful, but we couldn't save it to the database.</p>
              <p>Please check the backend logs and try disconnecting and reconnecting.</p>
              <div class="error-details">
                <strong>Error:</strong> ${dbError.message || 'Database error'}
          </div>
          <script>
                setTimeout(() => {
                  window.location.href = '${frontendUrl}/settings?tab=integrations&xero_error=storage_failed&xero_error_msg=${encodeURIComponent('Connection successful but failed to save. Please try reconnecting.')}';
                }, 3000);
          </script>
            </div>
        </body>
      </html>
    `);
    }

    // Redirect to frontend with success
    return res.redirect(`${frontendUrl}/settings?tab=integrations&xero_connected=true`);
  } catch (error: any) {
    console.error('[Xero] Callback error:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Log to database error log if available
    try {
      await query(
        `INSERT INTO error_logs (type, message, details, created_at) 
         VALUES ($1, $2, $3, NOW())`,
        [
          'xero_callback',
          `Xero Callback Error: ${error.message}`,
          JSON.stringify({ stack: error.stack, name: error.name })
        ]
      );
    } catch (logError) {
      console.warn('[Xero] Could not log to error_logs table:', logError);
    }
    
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
              window.location.href = '${frontendUrl}/settings?tab=integrations&xero_error=callback_failed';
          </script>
        </body>
      </html>
    `);
  }
});

// Get Xero connection status
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
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
      last_sync: token.updated_at ? token.updated_at.toISOString() : null,
      needs_refresh: isExpired
    });
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to get Xero status';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    if (isTableError) {
      // Return default status object with 200 status instead of 500
      console.warn('[Xero] xero_tokens table not found. Returning default status. Run migrations to create tables.');
      try {
        const { clientId, clientSecret } = await getXeroCredentials();
        const isConfigured = !!(clientId && clientSecret);
        return res.json({ 
          connected: false,
          configured: isConfigured
        });
      } catch (credError) {
        // If credentials check also fails, return default
        return res.json({ 
          connected: false,
          configured: false
        });
      }
    }
    console.error('Failed to get Xero status:', error);
    // For non-table errors, return default status to prevent frontend errors
    res.json({ 
      connected: false,
      configured: false
    });
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
        const errorText = await refreshResponse.text();
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error('Token refresh failed:', {
          status: refreshResponse.status,
          error: errorData.error || errorData.error_description || 'Unknown error',
          details: errorData
        });
        
        // If refresh token is invalid/expired, clear tokens so user can reconnect
        if (errorData.error === 'invalid_grant' || refreshResponse.status === 401) {
          console.warn('[Xero] Refresh token expired or invalid. Clearing tokens.');
          await query('DELETE FROM xero_tokens WHERE id = $1', [token.id]);
        }
        
        return null;
      }

      interface RefreshTokenResponse {
        access_token: string;
        refresh_token: string; // Xero uses rotating refresh tokens - this is the NEW token
        expires_in: number;
      }

      const newTokens = await refreshResponse.json() as RefreshTokenResponse;
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      // IMPORTANT: Xero uses rotating refresh tokens
      // The refresh_token in the response is a NEW token that must be used for the next refresh
      // We MUST update the refresh_token in the database
      await query(
        `UPDATE xero_tokens SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [newTokens.access_token, newTokens.refresh_token, newExpiresAt, token.id]
      );

      console.log('[Xero] Token refreshed successfully. New refresh token stored (rotating tokens).');
      return { accessToken: newTokens.access_token, tenantId: token.tenant_id };
    } catch (e) {
      console.error('Token refresh error:', e);
      return null;
    }
  }

  return { accessToken: token.access_token, tenantId: token.tenant_id };
}

// Helper function to find local records missing in Xero
function findMissingInXero<T extends Record<string, any>>(
  localRecords: T[],
  xeroRecords: Array<{ ID: string }>,
  idField: keyof T
): T[] {
  const xeroIds = new Set(xeroRecords.map(r => r.ID));
  return localRecords.filter(local => {
    const localXeroId = local[idField] as string | undefined | null;
    return !localXeroId || localXeroId.trim() === '' || !xeroIds.has(localXeroId);
  });
}

// Helper function to build Xero invoice payload from local invoice
async function buildXeroInvoicePayload(localInvoice: any): Promise<any> {
  // Get client's Xero contact ID
  let contactId: string | null = null;
  if (localInvoice.client_id) {
    const clientResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [localInvoice.client_id]);
    if (clientResult.rows.length > 0 && clientResult.rows[0].xero_contact_id) {
      contactId = clientResult.rows[0].xero_contact_id;
    }
  }

  if (!contactId) {
    throw new Error('Client does not have a Xero contact ID. Please sync contacts first.');
  }

  // Parse line items
  let lineItems: any[] = [];
  if (localInvoice.line_items) {
    try {
      lineItems = typeof localInvoice.line_items === 'string' 
        ? JSON.parse(localInvoice.line_items) 
        : localInvoice.line_items;
    } catch (e) {
      console.error('Failed to parse line items:', e);
    }
  }

  // Build Xero line items format
  const xeroLineItems = lineItems.map((item: any) => ({
    Description: item.description || '',
    Quantity: item.quantity || 1,
    UnitAmount: item.unit_price || item.amount || 0,
    AccountCode: item.account_code || '200', // Default revenue account
    LineAmount: item.amount || (item.quantity || 1) * (item.unit_price || 0)
  }));

  return {
    Type: 'ACCREC', // Accounts Receivable
    Contact: { ContactID: contactId },
    Date: localInvoice.issue_date || new Date().toISOString().split('T')[0],
    DueDate: localInvoice.due_date || null,
    InvoiceNumber: localInvoice.invoice_number || null,
    LineItems: xeroLineItems,
    Status: localInvoice.status || 'DRAFT'
  };
}

// Helper function to build Xero quote payload from local quote
async function buildXeroQuotePayload(localQuote: any): Promise<any> {
  // Get client's Xero contact ID
  let contactId: string | null = null;
  if (localQuote.client_id) {
    const clientResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [localQuote.client_id]);
    if (clientResult.rows.length > 0 && clientResult.rows[0].xero_contact_id) {
      contactId = clientResult.rows[0].xero_contact_id;
    }
  }

  if (!contactId) {
    throw new Error('Client does not have a Xero contact ID. Please sync contacts first.');
  }

  // Parse line items
  let lineItems: any[] = [];
  if (localQuote.line_items) {
    try {
      lineItems = typeof localQuote.line_items === 'string' 
        ? JSON.parse(localQuote.line_items) 
        : localQuote.line_items;
    } catch (e) {
      console.error('Failed to parse line items:', e);
    }
  }

  // Build Xero line items format
  const xeroLineItems = lineItems.map((item: any) => ({
    Description: item.description || '',
    Quantity: item.quantity || 1,
    UnitAmount: item.unit_price || item.amount || 0,
    AccountCode: item.account_code || '200',
    LineAmount: item.amount || (item.quantity || 1) * (item.unit_price || 0)
  }));

  return {
    Contact: { ContactID: contactId },
    Date: localQuote.issue_date || new Date().toISOString().split('T')[0],
    ExpiryDate: localQuote.expiry_date || null,
    LineItems: xeroLineItems,
    Status: localQuote.status || 'DRAFT'
  };
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
    const contactsResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Contacts?where=IsCustomer==true', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!contactsResponse.ok) {
      const error = await parseXeroError(contactsResponse);
      const errorMessage = getErrorMessage(error);
      console.error('Xero contacts fetch failed:', errorMessage, error);
      return res.status(400).json({ error: errorMessage });
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
      const updateResponse = await fetchWithRateLimit(`https://api.xero.com/api.xro/2.0/Contacts/${client.xero_contact_id}`, {
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
        const error = await parseXeroError(updateResponse);
        const errorMessage = getErrorMessage(error);
        console.error('Xero contact update failed:', errorMessage, error);
        return res.status(400).json({ error: errorMessage });
      }

      res.json({
        success: true,
        action: 'updated',
        xero_contact_id: client.xero_contact_id
      });
    } else {
      // Create new contact in Xero
      const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Contacts', {
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
        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Contacts', {
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
          const error = await parseXeroError(createResponse);
          console.error('Failed to push contact to Xero:', getErrorMessage(error), error);
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

// Sync result type
interface SyncResult {
  pulled: { created: number; updated: number };
  pushed: { created: number; failed: number };
}

// Bidirectional sync functions for each data type

// Sync Contacts bidirectionally
async function syncContactsBidirectional(
  tokenData: { accessToken: string; tenantId: string },
  makeInternalRequest: <T = any>(method: string, path: string, body?: any) => Promise<T>
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull contacts from Xero
    const pullResult = await makeInternalRequest<{ created?: number; updated?: number; skipped?: number }>('POST', '/api/xero/contacts/pull');
    result.pulled.created = pullResult.created || 0;
    result.pulled.updated = pullResult.updated || 0;

    // Push local clients to Xero
    const pushResult = await makeInternalRequest<{ results?: { total?: number; created?: number; failed?: number } }>('POST', '/api/xero/contacts/push-all');
    if (pushResult.results) {
      result.pushed.created = pushResult.results.created || 0;
      result.pushed.failed = pushResult.results.failed || 0;
    }
  } catch (error: any) {
    console.error('Contacts sync error:', error);
    result.pushed.failed = 1;
  }

  return result;
}

// Sync Invoices bidirectionally
// Helper function to safely parse dates from Xero API
function parseXeroDate(dateString: string | null | undefined): Date | null {
  if (!dateString || dateString === '' || dateString === 'null') {
    return null;
  }
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

// Helper function to parse date with fallback (for required date fields)
function parseXeroDateWithFallback(dateString: string | null | undefined, fallback: Date = new Date()): Date {
  const parsed = parseXeroDate(dateString);
  return parsed || fallback;
}

async function syncInvoicesBidirectional(
  tokenData: { accessToken: string; tenantId: string },
  userId: string
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Fetch invoices from Xero
    const invoicesResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Invoices', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (invoicesResponse.ok) {
      const invoicesData = await invoicesResponse.json() as { Invoices?: any[] };
      const invoices = invoicesData.Invoices || [];

      // Pull: Import/update invoices from Xero
      for (const invoice of invoices) {
        const existing = await query(
          'SELECT id FROM xero_invoices WHERE xero_invoice_id = $1',
          [invoice.InvoiceID]
        );

        // Get client ID from Xero contact
        let clientId: string | null = null;
        if (invoice.Contact?.ContactID) {
          const clientResult = await query(
            'SELECT id FROM clients WHERE xero_contact_id = $1',
            [invoice.Contact.ContactID]
          );
          if (clientResult.rows.length > 0) {
            clientId = clientResult.rows[0].id;
          }
        }

        // Parse line items
        const lineItems = invoice.LineItems ? JSON.stringify(invoice.LineItems) : null;

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_invoices SET 
              invoice_number = $1, status = $2, total = $3, amount_due = $4,
              due_date = $5, issue_date = $6, client_id = $7, line_items = $8,
              synced_at = CURRENT_TIMESTAMP
              WHERE xero_invoice_id = $9`,
            [
              invoice.InvoiceNumber,
              invoice.Status,
              invoice.Total || 0,
              invoice.AmountDue || 0,
              parseXeroDate(invoice.DueDate),
              parseXeroDate(invoice.Date),
              clientId,
              lineItems,
              invoice.InvoiceID
            ]
          );
          result.pulled.updated++;
        } else {
          await query(
            `INSERT INTO xero_invoices (xero_invoice_id, invoice_number, status, total, amount_due, due_date, issue_date, client_id, line_items, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
            [
              invoice.InvoiceID,
              invoice.InvoiceNumber,
              invoice.Status,
              invoice.Total || 0,
              invoice.AmountDue || 0,
              parseXeroDate(invoice.DueDate),
              parseXeroDate(invoice.Date),
              clientId,
              lineItems
            ]
          );
          result.pulled.created++;
        }
      }

      // Push: Send local invoices missing in Xero
      const localInvoicesResult = await query(
        `SELECT * FROM xero_invoices 
         WHERE xero_invoice_id IS NULL OR xero_invoice_id = ''`
      );
      const localInvoices = localInvoicesResult.rows;
      const missingInvoices = findMissingInXero(localInvoices, invoices, 'xero_invoice_id');

      for (const localInvoice of missingInvoices) {
        try {
          const invoicePayload = await buildXeroInvoicePayload(localInvoice);
          const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Invoices', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`,
              'Xero-Tenant-Id': tokenData.tenantId,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ Invoices: [invoicePayload] })
          });

          if (createResponse.ok) {
            const createResult = await createResponse.json() as { Invoices?: Array<{ InvoiceID: string }> };
            const xeroInvoiceId = createResult.Invoices?.[0]?.InvoiceID;
            if (xeroInvoiceId) {
              await query(
                `UPDATE xero_invoices SET xero_invoice_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [xeroInvoiceId, localInvoice.id]
              );
              result.pushed.created++;
            } else {
              result.pushed.failed++;
            }
          } else {
            const errorText = await createResponse.text();
            console.error('Failed to push invoice to Xero:', errorText);
            try {
              await query(
                `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, 'xero_sync_error', 'invoice', localInvoice.id, JSON.stringify({ 
                  invoice_number: localInvoice.invoice_number,
                  error: errorText.substring(0, 500)
                })]
              );
            } catch (logError) {
              console.debug('Failed to log sync error:', logError);
            }
            result.pushed.failed++;
          }
        } catch (pushError: any) {
          console.error('Error pushing invoice to Xero:', pushError);
          try {
            await query(
              `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
               VALUES ($1, $2, $3, $4, $5)`,
              [userId, 'xero_sync_error', 'invoice', localInvoice.id, JSON.stringify({ 
                error: pushError.message?.substring(0, 500) || 'Unknown error'
              })]
            );
          } catch (logError) {
            console.debug('Failed to log sync error:', logError);
          }
          result.pushed.failed++;
        }
      }
    }
  } catch (error: any) {
    console.error('Invoices sync error:', error);
  }

  return result;
}

// Sync Quotes bidirectionally
async function syncQuotesBidirectional(
  tokenData: { accessToken: string; tenantId: string },
  userId: string
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    const quotesResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Quotes', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (quotesResponse.ok) {
      const quotesData = await quotesResponse.json() as { Quotes?: any[] };
      const quotes = quotesData.Quotes || [];

      // Pull: Import/update quotes from Xero
      for (const quote of quotes) {
        const existing = await query(
          'SELECT id FROM xero_quotes WHERE xero_quote_id = $1',
          [quote.QuoteID]
        );

        // Get client ID from Xero contact
        let clientId: string | null = null;
        if (quote.Contact?.ContactID) {
          const clientResult = await query(
            'SELECT id FROM clients WHERE xero_contact_id = $1',
            [quote.Contact.ContactID]
          );
          if (clientResult.rows.length > 0) {
            clientId = clientResult.rows[0].id;
          }
        }

        // Parse line items
        const lineItems = quote.LineItems ? JSON.stringify(quote.LineItems) : null;

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_quotes SET 
              quote_number = $1, status = $2, total = $3,
              expiry_date = $4, client_id = $5, line_items = $6, issue_date = $7,
              synced_at = CURRENT_TIMESTAMP
              WHERE xero_quote_id = $8`,
            [
              quote.QuoteNumber,
              quote.Status,
              quote.Total || 0,
              quote.ExpiryDate ? new Date(quote.ExpiryDate) : null,
              clientId,
              lineItems,
              quote.Date ? new Date(quote.Date) : null,
              quote.QuoteID
            ]
          );
          result.pulled.updated++;
        } else {
          await query(
            `INSERT INTO xero_quotes (xero_quote_id, quote_number, status, total, expiry_date, client_id, line_items, issue_date, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
              quote.QuoteID,
              quote.QuoteNumber,
              quote.Status,
              quote.Total || 0,
              quote.ExpiryDate ? new Date(quote.ExpiryDate) : null,
              clientId,
              lineItems,
              quote.Date ? new Date(quote.Date) : null
            ]
          );
          result.pulled.created++;
        }
      }

      // Push: Send local quotes missing in Xero
      const localQuotesResult = await query(
        `SELECT * FROM xero_quotes 
         WHERE xero_quote_id IS NULL OR xero_quote_id = ''`
      );
      const localQuotes = localQuotesResult.rows;
      const missingQuotes = findMissingInXero(localQuotes, quotes, 'xero_quote_id');

      for (const localQuote of missingQuotes) {
        try {
          const quotePayload = await buildXeroQuotePayload(localQuote);
          const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Quotes', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`,
              'Xero-Tenant-Id': tokenData.tenantId,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ Quotes: [quotePayload] })
          });

          if (createResponse.ok) {
            const createResult = await createResponse.json() as { Quotes?: Array<{ QuoteID: string }> };
            const xeroQuoteId = createResult.Quotes?.[0]?.QuoteID;
            if (xeroQuoteId) {
              await query(
                `UPDATE xero_quotes SET xero_quote_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [xeroQuoteId, localQuote.id]
              );
              result.pushed.created++;
            } else {
              result.pushed.failed++;
            }
          } else {
            const errorText = await createResponse.text();
            console.error('Failed to push quote to Xero:', errorText);
            result.pushed.failed++;
          }
        } catch (pushError: any) {
          console.error('Error pushing quote to Xero:', pushError);
          result.pushed.failed++;
        }
      }
    }
  } catch (error: any) {
    console.error('Quotes sync error:', error);
  }

  return result;
}

// Sync Items bidirectionally
async function syncItemsBidirectional(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull items from Xero using existing function
    const syncedCount = await syncItemsFromXero(tokenData);
    result.pulled.created = syncedCount;

    // Push local items missing in Xero
    const localItemsResult = await query(
      `SELECT * FROM xero_items 
       WHERE xero_item_id IS NULL OR xero_item_id = ''`
    );
    const localItems = localItemsResult.rows;

    // Get items from Xero to check which are missing
    const itemsResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Items', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    let xeroItems: any[] = [];
    if (itemsResponse.ok) {
      const itemsData = await itemsResponse.json() as { Items?: any[] };
      xeroItems = itemsData.Items || [];
    }

    const missingItems = findMissingInXero(localItems, xeroItems, 'xero_item_id');

    for (const localItem of missingItems) {
      try {
        const itemPayload = {
          Code: localItem.code || localItem.name?.substring(0, 30).toUpperCase().replace(/\s+/g, '_'),
          Name: localItem.name,
          Description: localItem.description || '',
          IsTrackedAsInventory: localItem.is_tracked || false
        };

        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Items', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ Items: [itemPayload] })
        });

        if (createResponse.ok) {
          const createResult = await createResponse.json() as { Items?: Array<{ ItemID: string }> };
          const xeroItemId = createResult.Items?.[0]?.ItemID;
          if (xeroItemId) {
            await query(
              `UPDATE xero_items SET xero_item_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [xeroItemId, localItem.id]
            );
            result.pushed.created++;
          } else {
            result.pushed.failed++;
          }
        } else {
          const errorText = await createResponse.text();
          console.error('Failed to push item to Xero:', errorText);
          result.pushed.failed++;
        }
      } catch (pushError: any) {
        console.error('Error pushing item to Xero:', pushError);
        result.pushed.failed++;
      }
    }
  } catch (error: any) {
    console.error('Items sync error:', error);
  }

  return result;
}

// Sync Purchase Orders bidirectionally
async function syncPurchaseOrdersBidirectional(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull purchase orders from Xero
    const poResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/PurchaseOrders', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    let purchaseOrders: any[] = [];

    if (poResponse.ok) {
      const poData = await poResponse.json() as { PurchaseOrders?: any[] };
      purchaseOrders = poData.PurchaseOrders || [];

      // Pull: Import/update purchase orders from Xero
      for (const po of purchaseOrders) {
        const existing = await query(
          'SELECT id FROM xero_purchase_orders WHERE xero_po_id = $1',
          [po.PurchaseOrderID]
        );

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_purchase_orders SET 
              po_number = $1, status = $2, total_amount = $3, date = $4, 
              delivery_date = $5, synced_at = CURRENT_TIMESTAMP
              WHERE xero_po_id = $6`,
            [
              po.PurchaseOrderNumber,
              po.Status,
              po.Total || 0,
              parseXeroDateWithFallback(po.Date), // date is required, use today if missing
              parseXeroDate(po.DeliveryDate), // delivery_date can be null
              po.PurchaseOrderID
            ]
          );
          result.pulled.updated++;
        } else {
          // Get supplier contact ID
          let supplierId: string | null = null;
          if (po.Contact?.ContactID) {
            const supplierResult = await query(
              'SELECT id FROM clients WHERE xero_contact_id = $1',
              [po.Contact.ContactID]
            );
            if (supplierResult.rows.length > 0) {
              supplierId = supplierResult.rows[0].id;
            }
          }

          // Try to find a project for this supplier
          // First, try to find an active project with this supplier as client
          let projectId: string | null = null;
          if (supplierId) {
            const projectResult = await query(
              `SELECT id FROM projects 
               WHERE client_id = $1 AND status IN ('quoted', 'in-progress') 
               ORDER BY created_at DESC LIMIT 1`,
              [supplierId]
            );
            if (projectResult.rows.length > 0) {
              projectId = projectResult.rows[0].id;
            }
          }

          // If no project found, purchase order will be imported without project_id
          // User can link it manually later
          if (!projectId) {
            console.log(`[Xero] Importing purchase order ${po.PurchaseOrderNumber} without project - can be linked manually later`);
          }

          await query(
            `INSERT INTO xero_purchase_orders 
             (xero_po_id, po_number, supplier_id, project_id, status, total_amount, date, delivery_date, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
              po.PurchaseOrderID,
              po.PurchaseOrderNumber,
              supplierId,
              projectId,
              po.Status,
              po.Total || 0,
              parseXeroDateWithFallback(po.Date), // date is required, use today if missing
              parseXeroDate(po.DeliveryDate) // delivery_date can be null
            ]
          );
          result.pulled.created++;
        }
      }
    }

    // Push: Send local purchase orders missing in Xero
    const localPOResult = await query(
      `SELECT * FROM xero_purchase_orders 
       WHERE xero_po_id IS NULL OR xero_po_id = ''`
    );
    const localPOs = localPOResult.rows;
    const missingPOs = findMissingInXero(localPOs, purchaseOrders, 'xero_po_id');

    for (const localPO of missingPOs) {
      try {
        // Get supplier's Xero contact ID
        let supplierXeroId: string | null = null;
        if (localPO.supplier_id) {
          const supplierResult = await query(
            'SELECT xero_contact_id FROM clients WHERE id = $1',
            [localPO.supplier_id]
          );
          if (supplierResult.rows.length > 0 && supplierResult.rows[0].xero_contact_id) {
            supplierXeroId = supplierResult.rows[0].xero_contact_id;
          }
        }

        if (!supplierXeroId) {
          console.error('Purchase order supplier does not have Xero contact ID');
          result.pushed.failed++;
          continue;
        }

        // Get line items
        const lineItemsResult = await query(
          'SELECT * FROM xero_purchase_order_line_items WHERE po_id = $1',
          [localPO.id]
        );
        const lineItems = lineItemsResult.rows;

        const poPayload = {
          Contact: { ContactID: supplierXeroId },
          Date: localPO.date || new Date().toISOString().split('T')[0],
          DeliveryDate: localPO.delivery_date || null,
          LineItems: lineItems.map((item: any) => ({
            Description: item.description || '',
            Quantity: item.quantity || 1,
            UnitAmount: item.unit_amount || 0,
            AccountCode: item.account_code || '200'
          })),
          Reference: localPO.notes || null
        };

        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/PurchaseOrders', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ PurchaseOrders: [poPayload] })
        });

        if (createResponse.ok) {
          const createResult = await createResponse.json() as { PurchaseOrders?: Array<{ PurchaseOrderID: string }> };
          const xeroPOId = createResult.PurchaseOrders?.[0]?.PurchaseOrderID;
          if (xeroPOId) {
            await query(
              `UPDATE xero_purchase_orders SET xero_po_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [xeroPOId, localPO.id]
            );
            result.pushed.created++;
          } else {
            result.pushed.failed++;
          }
        } else {
          const errorText = await createResponse.text();
          console.error('Failed to push purchase order to Xero:', errorText);
          result.pushed.failed++;
        }
      } catch (pushError: any) {
        console.error('Error pushing purchase order to Xero:', pushError);
        result.pushed.failed++;
      }
    }
  } catch (error: any) {
    console.error('Purchase orders sync error:', error);
  }

  return result;
}

// Sync Bills bidirectionally
async function syncBillsBidirectional(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull bills from Xero
    // Note: Xero doesn't have a dedicated /Bills endpoint
    // Bills are Invoices with Type='ACCPAY' (Accounts Payable)
    // We'll fetch all invoices and filter for ACCPAY type
    const billsResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Invoices?where=Type=="ACCPAY"', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    let bills: any[] = [];

    if (billsResponse.ok) {
      const billsData = await billsResponse.json() as { Invoices?: any[] };
      // Map invoices to bills format for consistency
      bills = (billsData.Invoices || []).map(inv => ({
        BillID: inv.InvoiceID,
        BillNumber: inv.InvoiceNumber,
        Contact: inv.Contact,
        Status: inv.Status,
        Total: inv.Total,
        AmountDue: inv.AmountDue,
        Date: inv.Date,
        DueDate: inv.DueDate,
        LineItems: inv.LineItems
      }));

      // Pull: Import/update bills from Xero
      for (const bill of bills) {
        const existing = await query(
          'SELECT id FROM xero_bills WHERE xero_bill_id = $1',
          [bill.BillID]
        );

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_bills SET 
              bill_number = $1, status = $2, amount = $3, amount_due = $4,
              date = $5, due_date = $6, synced_at = CURRENT_TIMESTAMP
              WHERE xero_bill_id = $7`,
            [
              bill.BillNumber,
              bill.Status,
              bill.Total || 0,
              bill.AmountDue || 0,
              bill.Date ? new Date(bill.Date) : null,
              bill.DueDate ? new Date(bill.DueDate) : null,
              bill.BillID
            ]
          );
          result.pulled.updated++;
        } else {
          // Get supplier contact ID
          let supplierId: string | null = null;
          if (bill.Contact?.ContactID) {
            const supplierResult = await query(
              'SELECT id FROM clients WHERE xero_contact_id = $1',
              [bill.Contact.ContactID]
            );
            if (supplierResult.rows.length > 0) {
              supplierId = supplierResult.rows[0].id;
            }
          }

          await query(
            `INSERT INTO xero_bills 
             (xero_bill_id, bill_number, supplier_id, status, amount, amount_due, date, due_date, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
              bill.BillID || bill.InvoiceID, // Handle both formats
              bill.BillNumber || bill.InvoiceNumber, // Handle both formats
              supplierId,
              bill.Status,
              bill.Total || 0,
              bill.AmountDue || 0,
              bill.Date ? new Date(bill.Date) : null,
              bill.DueDate ? new Date(bill.DueDate) : null
            ]
          );
          result.pulled.created++;
        }
      }
    }

    // Push: Send local bills missing in Xero
    const localBillsResult = await query(
      `SELECT * FROM xero_bills 
       WHERE xero_bill_id IS NULL OR xero_bill_id = ''`
    );
    const localBills = localBillsResult.rows;
    const missingBills = findMissingInXero(localBills, bills, 'xero_bill_id');

    for (const localBill of missingBills) {
      try {
        // Get supplier's Xero contact ID
        let supplierXeroId: string | null = null;
        if (localBill.supplier_id) {
          const supplierResult = await query(
            'SELECT xero_contact_id FROM clients WHERE id = $1',
            [localBill.supplier_id]
          );
          if (supplierResult.rows.length > 0 && supplierResult.rows[0].xero_contact_id) {
            supplierXeroId = supplierResult.rows[0].xero_contact_id;
          }
        }

        if (!supplierXeroId) {
          console.error('Bill supplier does not have Xero contact ID');
          result.pushed.failed++;
          continue;
        }

        // Parse line items
        let lineItems: any[] = [];
        if (localBill.line_items) {
          try {
            lineItems = typeof localBill.line_items === 'string' 
              ? JSON.parse(localBill.line_items) 
              : localBill.line_items;
          } catch (e) {
            console.error('Failed to parse line items:', e);
          }
        }

        // Xero Bills are created using the Invoices endpoint with Type: 'ACCPAY'
        const billPayload = {
          Type: 'ACCPAY', // Accounts Payable (Bill)
          Contact: { ContactID: supplierXeroId },
          Date: localBill.date || new Date().toISOString().split('T')[0],
          DueDate: localBill.due_date || null,
          LineItems: lineItems.map((item: any) => ({
            Description: item.description || '',
            Quantity: item.quantity || 1,
            UnitAmount: item.unit_amount || item.amount || 0,
            AccountCode: item.account_code || '200'
          })),
          Status: localBill.status || 'AUTHORISED'
        };

        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Invoices', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ Invoices: [billPayload] })
        });

        if (createResponse.ok) {
          const createResult = await createResponse.json() as { Invoices?: Array<{ InvoiceID: string; Type: string }> };
          const xeroInvoice = createResult.Invoices?.[0];
          // Verify it's a bill (ACCPAY type)
          if (xeroInvoice && xeroInvoice.Type === 'ACCPAY') {
            await query(
              `UPDATE xero_bills SET xero_bill_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [xeroInvoice.InvoiceID, localBill.id]
            );
            result.pushed.created++;
          } else {
            console.error('Created invoice is not a bill (Type is not ACCPAY)');
            result.pushed.failed++;
          }
        } else {
          const error = await parseXeroError(createResponse);
          const errorMessage = getErrorMessage(error);
          console.error('Failed to push bill to Xero:', errorMessage, error);
          result.pushed.failed++;
        }
      } catch (pushError: any) {
        console.error('Error pushing bill to Xero:', pushError);
        result.pushed.failed++;
      }
    }
  } catch (error: any) {
    console.error('Bills sync error:', error);
  }

  return result;
}

// Sync Expenses bidirectionally
async function syncExpensesBidirectional(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull receipts/expenses from Xero
    // Note: Xero uses /ExpenseClaims for expense claims, not /Receipts
    // Receipts are different - they're for recording cash transactions
    // We should use /ExpenseClaims for expense management
    const receiptsResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/ExpenseClaims', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    let receipts: any[] = [];

    if (receiptsResponse.ok) {
      const receiptsData = await receiptsResponse.json() as { ExpenseClaims?: any[] };
      // Map ExpenseClaims to receipts format for consistency
      receipts = (receiptsData.ExpenseClaims || []).map(ec => ({
        ReceiptID: ec.ExpenseClaimID,
        ReceiptNumber: ec.ExpenseClaimNumber,
        Date: ec.Date,
        Total: ec.Total,
        Status: ec.Status,
        LineItems: ec.LineItems
      }));

      // Pull: Import/update expenses from Xero
      for (const receipt of receipts) {
        const existing = await query(
          'SELECT id FROM xero_expenses WHERE xero_expense_id = $1',
          [receipt.ReceiptID]
        );

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_expenses SET 
              amount = $1, date = $2, description = $3, status = $4,
              synced_at = CURRENT_TIMESTAMP
              WHERE xero_expense_id = $5`,
            [
              receipt.Total || 0,
              receipt.Date ? new Date(receipt.Date) : null,
              receipt.LineItems?.[0]?.Description || '',
              receipt.Status || 'DRAFT',
              receipt.ReceiptID
            ]
          );
          result.pulled.updated++;
        } else {
          await query(
            `INSERT INTO xero_expenses 
             (xero_expense_id, amount, date, description, status, synced_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
            [
              receipt.ReceiptID,
              receipt.Total || 0,
              receipt.Date ? new Date(receipt.Date) : null,
              receipt.LineItems?.[0]?.Description || '',
              receipt.Status || 'DRAFT'
            ]
          );
          result.pulled.created++;
        }
      }
    }

    // Push: Send local expenses missing in Xero
    const localExpensesResult = await query(
      `SELECT * FROM xero_expenses 
       WHERE xero_expense_id IS NULL OR xero_expense_id = ''`
    );
    const localExpenses = localExpensesResult.rows;
    const missingExpenses = findMissingInXero(localExpenses, receipts, 'xero_expense_id');

    for (const localExpense of missingExpenses) {
      try {
        const receiptPayload = {
          Date: localExpense.date || new Date().toISOString().split('T')[0],
          Contact: {}, // Optional for receipts
          LineItems: [{
            Description: localExpense.description || 'Expense',
            Quantity: 1,
            UnitAmount: localExpense.amount || 0,
            AccountCode: '200' // Default expense account
          }],
          Status: localExpense.status || 'DRAFT',
          Reference: localExpense.description || null
        };

        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/ExpenseClaims', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ ExpenseClaims: [receiptPayload] })
        });

        if (createResponse.ok) {
          const createResult = await createResponse.json() as { ExpenseClaims?: Array<{ ExpenseClaimID: string }> };
          const xeroExpenseId = createResult.ExpenseClaims?.[0]?.ExpenseClaimID;
          if (xeroExpenseId) {
            await query(
              `UPDATE xero_expenses SET xero_expense_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [xeroExpenseId, localExpense.id]
            );
            result.pushed.created++;
          } else {
            result.pushed.failed++;
          }
        } else {
          const error = await parseXeroError(createResponse);
          const errorMessage = getErrorMessage(error);
          console.error('Failed to push expense to Xero:', errorMessage, error);
          result.pushed.failed++;
        }
      } catch (pushError: any) {
        console.error('Error pushing expense to Xero:', pushError);
        result.pushed.failed++;
      }
    }
  } catch (error: any) {
    console.error('Expenses sync error:', error);
  }

  return result;
}

// Sync Payments bidirectionally
async function syncPaymentsBidirectional(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull payments from Xero
    const paymentsResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Payments', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    let payments: any[] = [];

    if (paymentsResponse.ok) {
      const paymentsData = await paymentsResponse.json() as { Payments?: any[] };
      payments = paymentsData.Payments || [];

      // Pull: Import/update payments from Xero
      for (const payment of payments) {
        const existing = await query(
          'SELECT id FROM xero_payments WHERE xero_payment_id = $1',
          [payment.PaymentID]
        );

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_payments SET 
              amount = $1, payment_date = $2, payment_method = $3, reference = $4,
              synced_at = CURRENT_TIMESTAMP
              WHERE xero_payment_id = $5`,
            [
              payment.Amount || 0,
              payment.Date ? new Date(payment.Date) : null,
              payment.PaymentType || 'ACCRECPAYMENT',
              payment.Reference || null,
              payment.PaymentID
            ]
          );
          result.pulled.updated++;
        } else {
          // Get invoice ID
          let invoiceId: string | null = null;
          if (payment.Invoice?.InvoiceID) {
            const invoiceResult = await query(
              'SELECT id FROM xero_invoices WHERE xero_invoice_id = $1',
              [payment.Invoice.InvoiceID]
            );
            if (invoiceResult.rows.length > 0) {
              invoiceId = invoiceResult.rows[0].id;
            }
          }

          await query(
            `INSERT INTO xero_payments 
             (xero_payment_id, invoice_id, amount, payment_date, payment_method, reference, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [
              payment.PaymentID,
              invoiceId,
              payment.Amount || 0,
              payment.Date ? new Date(payment.Date) : null,
              payment.PaymentType || 'ACCRECPAYMENT',
              payment.Reference || null
            ]
          );
          result.pulled.created++;
        }
      }
    }

    // Push: Send local payments missing in Xero
    const localPaymentsResult = await query(
      `SELECT * FROM xero_payments 
       WHERE xero_payment_id IS NULL OR xero_payment_id = ''`
    );
    const localPayments = localPaymentsResult.rows;
    const missingPayments = findMissingInXero(localPayments, payments, 'xero_payment_id');

    for (const localPayment of missingPayments) {
      try {
        // Get invoice's Xero invoice ID
        let invoiceXeroId: string | null = null;
        if (localPayment.invoice_id) {
          const invoiceResult = await query(
            'SELECT xero_invoice_id FROM xero_invoices WHERE id = $1',
            [localPayment.invoice_id]
          );
          if (invoiceResult.rows.length > 0 && invoiceResult.rows[0].xero_invoice_id) {
            invoiceXeroId = invoiceResult.rows[0].xero_invoice_id;
          }
        }

        if (!invoiceXeroId) {
          console.error('Payment invoice does not have Xero invoice ID');
          result.pushed.failed++;
          continue;
        }

        const paymentPayload = {
          Invoice: { InvoiceID: invoiceXeroId },
          Account: { Code: localPayment.account_code || '090' }, // Default bank account
          Date: localPayment.payment_date || new Date().toISOString().split('T')[0],
          Amount: localPayment.amount || 0,
          Reference: localPayment.reference || null
        };

        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ Payments: [paymentPayload] })
        });

        if (createResponse.ok) {
          const createResult = await createResponse.json() as { Payments?: Array<{ PaymentID: string }> };
          const xeroPaymentId = createResult.Payments?.[0]?.PaymentID;
          if (xeroPaymentId) {
            await query(
              `UPDATE xero_payments SET xero_payment_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [xeroPaymentId, localPayment.id]
            );
            result.pushed.created++;
          } else {
            result.pushed.failed++;
          }
        } else {
          const errorText = await createResponse.text();
          console.error('Failed to push payment to Xero:', errorText);
          result.pushed.failed++;
        }
      } catch (pushError: any) {
        console.error('Error pushing payment to Xero:', pushError);
        result.pushed.failed++;
      }
    }
  } catch (error: any) {
    console.error('Payments sync error:', error);
  }

  return result;
}

// Sync Credit Notes bidirectionally
async function syncCreditNotesBidirectional(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull credit notes from Xero
    const creditNotesResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/CreditNotes', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    let creditNotes: any[] = [];

    if (creditNotesResponse.ok) {
      const creditNotesData = await creditNotesResponse.json() as { CreditNotes?: any[] };
      creditNotes = creditNotesData.CreditNotes || [];

      // Pull: Import/update credit notes from Xero
      for (const creditNote of creditNotes) {
        const existing = await query(
          'SELECT id FROM xero_credit_notes WHERE xero_credit_note_id = $1',
          [creditNote.CreditNoteID]
        );

        if (existing.rows.length > 0) {
          await query(
            `UPDATE xero_credit_notes SET 
              credit_note_number = $1, status = $2, amount = $3, date = $4,
              synced_at = CURRENT_TIMESTAMP
              WHERE xero_credit_note_id = $5`,
            [
              creditNote.CreditNoteNumber,
              creditNote.Status,
              creditNote.Total || 0,
              creditNote.Date ? new Date(creditNote.Date) : null,
              creditNote.CreditNoteID
            ]
          );
          result.pulled.updated++;
        } else {
          // Get invoice ID
          let invoiceId: string | null = null;
          if (creditNote.AppliedAmount && creditNote.AppliedAmount > 0) {
            // Try to find related invoice
            const invoiceResult = await query(
              'SELECT id FROM xero_invoices WHERE xero_invoice_id = $1 LIMIT 1',
              [creditNote.InvoiceID || '']
            );
            if (invoiceResult.rows.length > 0) {
              invoiceId = invoiceResult.rows[0].id;
            }
          }

          await query(
            `INSERT INTO xero_credit_notes 
             (xero_credit_note_id, credit_note_number, invoice_id, amount, date, status, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [
              creditNote.CreditNoteID,
              creditNote.CreditNoteNumber,
              invoiceId,
              creditNote.Total || 0,
              creditNote.Date ? new Date(creditNote.Date) : null,
              creditNote.Status || 'AUTHORISED'
            ]
          );
          result.pulled.created++;
        }
      }
    }

    // Push: Send local credit notes missing in Xero
    const localCreditNotesResult = await query(
      `SELECT * FROM xero_credit_notes 
       WHERE xero_credit_note_id IS NULL OR xero_credit_note_id = ''`
    );
    const localCreditNotes = localCreditNotesResult.rows;
    const missingCreditNotes = findMissingInXero(localCreditNotes, creditNotes, 'xero_credit_note_id');

    for (const localCreditNote of missingCreditNotes) {
      try {
        // Get invoice's Xero invoice ID
        let invoiceXeroId: string | null = null;
        if (localCreditNote.invoice_id) {
          const invoiceResult = await query(
            'SELECT xero_invoice_id FROM xero_invoices WHERE id = $1',
            [localCreditNote.invoice_id]
          );
          if (invoiceResult.rows.length > 0 && invoiceResult.rows[0].xero_invoice_id) {
            invoiceXeroId = invoiceResult.rows[0].xero_invoice_id;
          }
        }

        if (!invoiceXeroId) {
          console.error('Credit note invoice does not have Xero invoice ID');
          result.pushed.failed++;
          continue;
        }

        const creditNotePayload = {
          Type: 'ACCRECCREDIT', // Accounts Receivable Credit
          Contact: {}, // Will be populated from invoice
          Date: localCreditNote.date || new Date().toISOString().split('T')[0],
          CreditNoteNumber: localCreditNote.credit_note_number || null,
          Status: localCreditNote.status || 'AUTHORISED',
          LineAmountTypes: 'Exclusive',
          LineItems: [{
            Description: localCreditNote.reason || 'Credit note',
            Quantity: 1,
            UnitAmount: localCreditNote.amount || 0,
            AccountCode: '200'
          }]
        };

        const createResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/CreditNotes', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Xero-Tenant-Id': tokenData.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ CreditNotes: [creditNotePayload] })
        });

        if (createResponse.ok) {
          const createResult = await createResponse.json() as { CreditNotes?: Array<{ CreditNoteID: string }> };
          const xeroCreditNoteId = createResult.CreditNotes?.[0]?.CreditNoteID;
          if (xeroCreditNoteId) {
            await query(
              `UPDATE xero_credit_notes SET xero_credit_note_id = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [xeroCreditNoteId, localCreditNote.id]
            );
            result.pushed.created++;
          } else {
            result.pushed.failed++;
          }
        } else {
          const errorText = await createResponse.text();
          console.error('Failed to push credit note to Xero:', errorText);
          result.pushed.failed++;
        }
      } catch (pushError: any) {
        console.error('Error pushing credit note to Xero:', pushError);
        result.pushed.failed++;
      }
    }
  } catch (error: any) {
    console.error('Credit notes sync error:', error);
  }

  return result;
}

// Sync Bank Transactions (pull only)
async function syncBankTransactions(
  tokenData: { accessToken: string; tenantId: string }
): Promise<SyncResult> {
  const result: SyncResult = { pulled: { created: 0, updated: 0 }, pushed: { created: 0, failed: 0 } };

  try {
    // Pull bank transactions from Xero
    const bankTransactionsResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/BankTransactions', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json'
      }
    });

    if (bankTransactionsResponse.ok) {
      const bankTransactionsData = await bankTransactionsResponse.json() as { BankTransactions?: any[] };
      const bankTransactions = bankTransactionsData.BankTransactions || [];

      // Pull: Import/update bank transactions from Xero
      for (const transaction of bankTransactions) {
        const existing = await query(
          'SELECT id FROM bank_transactions WHERE xero_bank_transaction_id = $1',
          [transaction.BankTransactionID]
        );

        if (existing.rows.length > 0) {
          await query(
            `UPDATE bank_transactions SET 
              date = $1, amount = $2, type = $3, description = $4, reference = $5,
              reconciled = $6, synced_at = CURRENT_TIMESTAMP
              WHERE xero_bank_transaction_id = $7`,
            [
              transaction.Date ? new Date(transaction.Date) : null,
              transaction.Total || 0,
              transaction.Type || 'SPEND',
              transaction.LineItems?.[0]?.Description || '',
              transaction.Reference || null,
              transaction.Status === 'RECONCILED',
              transaction.BankTransactionID
            ]
          );
          result.pulled.updated++;
        } else {
          // Get contact ID
          let contactId: string | null = null;
          if (transaction.Contact?.ContactID) {
            const contactResult = await query(
              'SELECT id FROM clients WHERE xero_contact_id = $1',
              [transaction.Contact.ContactID]
            );
            if (contactResult.rows.length > 0) {
              contactId = contactResult.rows[0].id;
            }
          }

          await query(
            `INSERT INTO bank_transactions 
             (xero_bank_transaction_id, bank_account_code, bank_account_name, date, amount, type, 
              description, reference, contact_id, reconciled, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
            [
              transaction.BankTransactionID,
              transaction.BankAccount?.Code || null,
              transaction.BankAccount?.Name || null,
              transaction.Date ? new Date(transaction.Date) : null,
              transaction.Total || 0,
              transaction.Type || 'SPEND',
              transaction.LineItems?.[0]?.Description || '',
              transaction.Reference || null,
              contactId,
              transaction.Status === 'RECONCILED'
            ]
          );
          result.pulled.created++;
        }
      }
    }
  } catch (error: any) {
    console.error('Bank transactions sync error:', error);
  }

  return result;
}

// Sync Tracking Categories (pull only)
async function syncTrackingCategories(
  tokenData: { accessToken: string; tenantId: string }
): Promise<{ mapped: number }> {
  let mapped = 0;

  try {
    const trackingResponse = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/TrackingCategories', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (trackingResponse.ok) {
      const trackingData = await trackingResponse.json() as { TrackingCategories?: any[] };
      const categories = trackingData.TrackingCategories || [];

      for (const category of categories) {
        // Map tracking categories to cost centers
        const existing = await query(
          'SELECT id FROM cost_centers WHERE xero_tracking_category_id = $1',
          [category.TrackingCategoryID]
        );

        if (existing.rows.length === 0 && category.Options && category.Options.length > 0) {
          // Create cost centers for tracking category options
          for (const option of category.Options) {
            await query(
              `INSERT INTO cost_centers (code, name, xero_tracking_category_id, is_active)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (code) DO UPDATE SET xero_tracking_category_id = $3`,
              [
                option.Name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
                option.Name,
                category.TrackingCategoryID
              ]
            );
            mapped++;
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Tracking categories sync error:', error);
  }

  return { mapped };
}

// Sync data with Xero - performs bidirectional sync
router.post('/sync', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.body; // 'contacts', 'invoices', 'tracking_categories', 'all'

    // Check if connected
    const tokenResult = await query('SELECT * FROM xero_tokens ORDER BY created_at DESC LIMIT 1');
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Xero not connected' });
    }

    const tokenId = tokenResult.rows[0].id;
    const syncResults: {
      success: boolean;
      synced_at: Date;
      last_sync: string;
      results: Record<string, { 
        synced?: number; 
        created?: number; 
        updated?: number; 
        mapped?: number; 
        total?: number; 
        failed?: number;
        pulled_created?: number;
        pulled_updated?: number;
        pushed_created?: number;
        pushed_failed?: number;
      }>;
    } = {
      success: true,
      synced_at: new Date(),
      last_sync: new Date().toISOString(),
      results: {}
    };

    // Get token data for sync operations
    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Helper to make internal API calls
    const makeInternalRequest = async <T = any>(method: string, path: string, body?: any): Promise<T> => {
      const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
      const url = `${baseUrl}${path}`;
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${req.headers.authorization?.replace('Bearer ', '') || ''}`
        }
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sync operation failed: ${errorText}`);
      }
      return response.json() as T;
    };

    try {
      // Sync Contacts (Pull from Xero and Push local to Xero)
    if (type === 'contacts' || type === 'all') {
        try {
          const result = await syncContactsBidirectional(tokenData, makeInternalRequest);
          syncResults.results.contacts = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Contacts sync error:', error);
          syncResults.results.contacts = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Invoices bidirectionally
    if (type === 'invoices' || type === 'all') {
        try {
          const result = await syncInvoicesBidirectional(tokenData, req.user!.id);
          syncResults.results.invoices = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Invoices sync error:', error);
          syncResults.results.invoices = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Quotes bidirectionally
      if (type === 'quotes' || type === 'all') {
        try {
          const result = await syncQuotesBidirectional(tokenData, req.user!.id);
          syncResults.results.quotes = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Quotes sync error:', error);
          syncResults.results.quotes = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Tracking Categories (pull only)
    if (type === 'tracking_categories' || type === 'all') {
        try {
          const result = await syncTrackingCategories(tokenData);
          syncResults.results.tracking_categories = { mapped: result.mapped };
        } catch (error: any) {
          console.error('Tracking categories sync error:', error);
          syncResults.results.tracking_categories = { mapped: 0 };
        }
      }

      // Sync Items bidirectionally
      if (type === 'items' || type === 'all') {
        try {
          const result = await syncItemsBidirectional(tokenData);
          syncResults.results.items = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Items sync error:', error);
          syncResults.results.items = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Purchase Orders bidirectionally
      if (type === 'purchase_orders' || type === 'all') {
        try {
          const result = await syncPurchaseOrdersBidirectional(tokenData);
          syncResults.results.purchase_orders = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Purchase orders sync error:', error);
          syncResults.results.purchase_orders = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Bills bidirectionally
      if (type === 'bills' || type === 'all') {
        try {
          const result = await syncBillsBidirectional(tokenData);
          syncResults.results.bills = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Bills sync error:', error);
          syncResults.results.bills = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Expenses bidirectionally
      if (type === 'expenses' || type === 'all') {
        try {
          const result = await syncExpensesBidirectional(tokenData);
          syncResults.results.expenses = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Expenses sync error:', error);
          syncResults.results.expenses = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Payments bidirectionally
      if (type === 'payments' || type === 'all') {
        try {
          const result = await syncPaymentsBidirectional(tokenData);
          syncResults.results.payments = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Payments sync error:', error);
          syncResults.results.payments = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Credit Notes bidirectionally
      if (type === 'credit_notes' || type === 'all') {
        try {
          const result = await syncCreditNotesBidirectional(tokenData);
          syncResults.results.credit_notes = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created + result.pushed.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated,
            pushed_created: result.pushed.created,
            pushed_failed: result.pushed.failed
          };
        } catch (error: any) {
          console.error('Credit notes sync error:', error);
          syncResults.results.credit_notes = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0, pushed_created: 0, pushed_failed: 0 };
        }
      }

      // Sync Bank Transactions (pull only)
      if (type === 'bank_transactions' || type === 'all') {
        try {
          const result = await syncBankTransactions(tokenData);
          syncResults.results.bank_transactions = {
            synced: result.pulled.created + result.pulled.updated,
            created: result.pulled.created,
            updated: result.pulled.updated,
            pulled_created: result.pulled.created,
            pulled_updated: result.pulled.updated
          };
        } catch (error: any) {
          console.error('Bank transactions sync error:', error);
          syncResults.results.bank_transactions = { synced: 0, created: 0, updated: 0, pulled_created: 0, pulled_updated: 0 };
        }
      }

      // All sync operations complete

      // Update token last sync time after all sync operations complete
    await query(
      'UPDATE xero_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [tokenId]
      );

      // Get updated timestamp for response
      const updatedToken = await query(
        'SELECT updated_at FROM xero_tokens WHERE id = $1',
        [tokenId]
      );
      if (updatedToken.rows.length > 0) {
        syncResults.last_sync = updatedToken.rows[0].updated_at.toISOString();
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, details) 
         VALUES ($1, $2, $3, $4)`,
        [req.user!.id, 'sync', 'xero', JSON.stringify(syncResults)]
      );

      res.json(syncResults);
    } catch (error: any) {
    console.error('Xero sync error:', error);
      // Still update timestamp even on partial failure
      await query(
        'UPDATE xero_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [tokenId]
      );
      res.status(500).json({ 
        error: 'Sync failed', 
        details: error.message,
        partial_results: syncResults.results
      });
    }
  } catch (error: any) {
    console.error('Xero sync error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

// Get invoices from Xero (cached)
router.get('/invoices', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    const { status, client_id, date_from, date_to, include_deleted } = req.query;

    let sql = `
      SELECT xi.*, c.name as client_name
      FROM xero_invoices xi
      LEFT JOIN clients c ON xi.client_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    // Filter deleted invoices unless explicitly requested
    if (include_deleted !== 'true') {
      sql += ` AND xi.deleted_at IS NULL`;
    }

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
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to fetch invoices';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    if (isTableError) {
      // Return empty array with 200 status instead of 500
      console.warn('[Xero] xero_invoices table not found. Returning empty array. Run migrations to create tables.');
      return res.json([]);
    }
    console.error('Failed to fetch invoices:', error);
    // For non-table errors, still return empty array to prevent frontend errors
    res.json([]);
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

// Create invoice from timesheets
router.post('/invoices/from-timesheets', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { client_id, project_id, date_from, date_to, period, due_date } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'Client is required' });
    }

    // Build query for unbilled timesheets
    let sql = `
      SELECT t.*, 
        at.name as activity_type_name,
        at.hourly_rate,
        (t.hours * COALESCE(at.hourly_rate, 0)) as line_total
      FROM timesheets t
      LEFT JOIN activity_types at ON t.activity_type_id = at.id
      WHERE t.client_id = $1 
        AND COALESCE(t.billing_status, 'unbilled') = 'unbilled'
        AND t.deleted_at IS NULL
    `;
    const params: any[] = [client_id];
    let paramCount = 2;

    if (project_id) {
      sql += ` AND t.project_id = $${paramCount++}`;
      params.push(project_id);
    }

    if (date_from) {
      sql += ` AND t.date >= $${paramCount++}`;
      params.push(date_from);
    }

    if (date_to) {
      sql += ` AND t.date <= $${paramCount++}`;
      params.push(date_to);
    } else if (period === 'week') {
      // Last 7 days
      sql += ` AND t.date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      // Current month
      sql += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
    }

    sql += ' ORDER BY t.date, t.created_at';

    const timesheetsResult = await query(sql, params);

    if (timesheetsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No unbilled timesheets found for the selected criteria' });
    }

    // Group by activity type and create line items
    const lineItemsMap = new Map<string, { hours: number; rate: number; description: string }>();
    
    for (const ts of timesheetsResult.rows) {
      const key = ts.activity_type_id || 'other';
      const rate = parseFloat(ts.hourly_rate || '0');
      const hours = parseFloat(ts.hours);
      
      if (!lineItemsMap.has(key)) {
        lineItemsMap.set(key, {
          hours: 0,
          rate,
          description: ts.activity_type_name || 'Other'
        });
      }
      
      const item = lineItemsMap.get(key)!;
      item.hours += hours;
    }

    // Convert to line items array
    const lineItems = Array.from(lineItemsMap.values()).map(item => ({
      description: `${item.description} - ${item.hours.toFixed(2)} hours`,
      quantity: item.hours,
      unit_price: item.rate,
      amount: item.hours * item.rate
    }));

    const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

    // Generate invoice number
    const countResult = await query('SELECT COUNT(*) as count FROM xero_invoices WHERE deleted_at IS NULL');
    const invoiceNumber = `INV-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    // Create invoice locally with pending sync status
    const invoiceResult = await query(
      `INSERT INTO xero_invoices (xero_invoice_id, invoice_number, client_id, project_id, status, line_items, total, amount_due, due_date, issue_date, sync_status, synced_at)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $6, $7, CURRENT_DATE, 'pending', CURRENT_TIMESTAMP)
       RETURNING *`,
      [invoiceNumber, invoiceNumber, client_id, project_id || null, JSON.stringify(lineItems), total, due_date || null]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Update timesheets billing status
    const timesheetIds = timesheetsResult.rows.map(ts => ts.id);
    await query(
      `UPDATE timesheets 
       SET billing_status = 'billed', invoice_id = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ANY($2)`,
      [invoiceId, timesheetIds]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'invoice', invoiceId, JSON.stringify({ 
        invoice_number: invoiceNumber, 
        total, 
        timesheets_count: timesheetIds.length,
        from_timesheets: true,
        sync_status: 'pending'
      })]
    );

    // Queue the Xero sync job (async, non-blocking)
    // Use invoice ID as job ID to prevent duplicate jobs for the same invoice
    try {
      const { addXeroSyncJob, xeroSyncQueue } = await import('../lib/queue');
      
      // Check if a job for this invoice already exists
      if (xeroSyncQueue) {
        const existingJobs = await xeroSyncQueue.getJobs(['waiting', 'active', 'delayed'], 0, -1);
        const duplicateJob = existingJobs.find(
          (job) => job.data.type === 'sync_invoice_from_timesheets' && job.data.data.invoiceId === invoiceId
        );

        if (duplicateJob) {
          console.log(`[Xero Sync] Job already exists for invoice ${invoiceId}, skipping duplicate job creation`);
        } else {
          await addXeroSyncJob('sync_invoice_from_timesheets', {
            invoiceId,
            clientId: client_id,
            projectId: project_id || null,
            lineItems,
            total,
            dueDate: due_date || null,
            timesheetIds,
          }, `invoice-${invoiceId}`); // Use invoiceId as jobId for idempotency
        }
      } else {
        // Fallback if queue not available
        await addXeroSyncJob('sync_invoice_from_timesheets', {
          invoiceId,
          clientId: client_id,
          projectId: project_id || null,
          lineItems,
          total,
          dueDate: due_date || null,
          timesheetIds,
        }, `invoice-${invoiceId}`);
      }
    } catch (queueError: any) {
      console.error('Failed to queue Xero sync job:', queueError);
      // Update invoice sync status to indicate queue failure
      await query(
        `UPDATE xero_invoices 
         SET sync_status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invoiceId]
      );
      // Log the error
      await query(
        `INSERT INTO sync_logs (entity_type, entity_id, request_payload, response_payload, status_code, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        ['invoice', invoiceId, null, null, null, `Queue initialization failed: ${queueError.message}`]
      );
      // Don't fail the request - invoice is created, user can retry sync later
    }

    // Return 202 Accepted - invoice created, sync in progress
    res.status(202).json({
      ...invoiceResult.rows[0],
      timesheets_count: timesheetIds.length,
      sync_status: 'pending',
      message: 'Invoice created. Syncing to Xero in the background...'
    });
  } catch (error) {
    console.error('Failed to create invoice from timesheets:', error);
    res.status(500).json({ error: 'Failed to create invoice from timesheets' });
  }
});

// Get quotes from Xero (cached)
router.get('/quotes', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    const result = await query(`
      SELECT xq.*, c.name as client_name
      FROM xero_quotes xq
      LEFT JOIN clients c ON xq.client_id = c.id
      ORDER BY xq.issue_date DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    // Catch all errors and return empty array - don't fail the request
    console.error('Failed to fetch quotes:', error);
    const errorMessage = error.message || 'Unknown error';
    // Log the actual error for debugging
    console.error('[Xero Quotes] Error details:', {
      message: errorMessage,
      code: error.code,
      stack: error.stack
    });
    // Always return empty array with 200 status
    res.status(200).json([]);
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

// Create payment in Xero
router.post('/payments', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id, amount, payment_date, payment_method, reference, account_code, currency } = req.body;

    if (!invoice_id || !amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: 'Missing required fields: invoice_id, amount, payment_date, payment_method' });
    }

    // Get invoice details
    const invoiceResult = await query('SELECT id, xero_invoice_id, total, amount_due FROM xero_invoices WHERE id = $1', [invoice_id]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const paymentAmount = parseFloat(amount);

    // Validate payment amount
    if (paymentAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }

    if (paymentAmount > parseFloat(invoice.amount_due || invoice.total)) {
      return res.status(400).json({ error: 'Payment amount exceeds invoice amount due' });
    }

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Create payment in Xero (only if invoice has xero_invoice_id)
    let xeroPaymentId: string | undefined;
    if (invoice.xero_invoice_id) {
      const xeroPayment = await createPaymentInXero(
        tokenData,
        {
          invoice_id,
          amount: paymentAmount,
          payment_date,
          payment_method,
          reference,
          account_code,
          currency,
        },
        invoice.xero_invoice_id
      );

      if (xeroPayment) {
        xeroPaymentId = xeroPayment.PaymentID;
      }
    }

    // Store payment in local database
    const paymentId = await storePayment({
      invoice_id,
      amount: paymentAmount,
      payment_date,
      payment_method,
      reference,
      account_code,
      currency: currency || 'USD',
      xero_payment_id: xeroPaymentId,
      user_id: req.user!.id,
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create_payment', 'payment', paymentId, JSON.stringify({ invoice_id, amount: paymentAmount, payment_method })]
    );

    // Get updated payment with invoice details
    const paymentResult = await query(
      `SELECT p.*, xi.invoice_number, c.name as client_name 
       FROM xero_payments p
       LEFT JOIN xero_invoices xi ON p.invoice_id = xi.id
       LEFT JOIN clients c ON xi.client_id = c.id
       WHERE p.id = $1`,
      [paymentId]
    );

    res.status(201).json(paymentResult.rows[0]);
  } catch (error: any) {
    console.error('Failed to create payment:', error);
    res.status(500).json({ error: 'Failed to create payment: ' + (error.message || 'Unknown error') });
  }
});

// Get payments
router.get('/payments', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    const { invoice_id, date_from, date_to, payment_method } = req.query;

    const payments = await getPayments({
      invoice_id: invoice_id as string,
      date_from: date_from as string,
      date_to: date_to as string,
      payment_method: payment_method as string,
    });

    res.json(payments);
  } catch (error: any) {
    // Catch all errors and return empty array - don't fail the request
    console.error('Failed to fetch payments:', error);
    const errorMessage = error.message || 'Unknown error';
    // Log the actual error for debugging
    console.error('[Xero Payments] Error details:', {
      message: errorMessage,
      code: error.code,
      stack: error.stack
    });
    // Always return empty array with 200 status
    res.status(200).json([]);
  }
});

// Mark invoice as paid
router.put('/invoices/:id/mark-paid', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_date, payment_method, reference, account_code } = req.body;

    // Get invoice
    const invoiceResult = await query('SELECT * FROM xero_invoices WHERE id = $1', [req.params.id]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const paymentAmount = amount || parseFloat(invoice.amount_due || invoice.total);
    const paymentDate = payment_date || new Date().toISOString().split('T')[0];
    const paymentMethod = payment_method || 'BANK_TRANSFER';

    // Create payment
    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    let xeroPaymentId: string | undefined;
    if (invoice.xero_invoice_id) {
      const xeroPayment = await createPaymentInXero(
        tokenData,
        {
          invoice_id: invoice.id,
          amount: paymentAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod as any,
          reference,
          account_code,
        },
        invoice.xero_invoice_id
      );

      if (xeroPayment) {
        xeroPaymentId = xeroPayment.PaymentID;
      }
    }

    // Store payment
    const paymentId = await storePayment({
      invoice_id: invoice.id,
      amount: paymentAmount,
      payment_date: paymentDate,
      payment_method: paymentMethod as any,
      reference,
      account_code,
      xero_payment_id: xeroPaymentId,
      user_id: req.user!.id,
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'mark_paid', 'invoice', invoice.id, JSON.stringify({ payment_id: paymentId, amount: paymentAmount })]
    );

    // Get updated invoice
    const updatedInvoice = await query('SELECT * FROM xero_invoices WHERE id = $1', [req.params.id]);

    res.json(updatedInvoice.rows[0]);
  } catch (error: any) {
    console.error('Failed to mark invoice as paid:', error);
    res.status(500).json({ error: 'Failed to mark invoice as paid: ' + (error.message || 'Unknown error') });
  }
});

// Import bank transactions from Xero
router.post('/bank-transactions', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.body;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    const imported = await importBankTransactions(tokenData, date_from, date_to);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'import', 'bank_transactions', JSON.stringify({ imported, date_from, date_to })]
    );

    res.json({
      success: true,
      imported,
      message: `Imported ${imported} bank transaction(s)`,
    });
  } catch (error: any) {
    console.error('Failed to import bank transactions:', error);
    res.status(500).json({ error: 'Failed to import bank transactions: ' + (error.message || 'Unknown error') });
  }
});

// Get bank transactions
router.get('/bank-transactions', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    await ensureXeroTables(); // Ensure tables exist
    const { date_from, date_to, reconciled, payment_id } = req.query;

    const transactions = await getBankTransactions({
      date_from: date_from as string,
      date_to: date_to as string,
      reconciled: reconciled === 'true' ? true : reconciled === 'false' ? false : undefined,
      payment_id: payment_id as string,
    });

    res.status(200).json(transactions);
  } catch (error: any) {
    console.error('Failed to fetch bank transactions:', error);
    res.status(200).json([]); // Return empty array with 200 status on any error
  }
});

// Reconcile bank transaction with payment
router.post('/reconcile', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { transaction_id, payment_id } = req.body;

    if (!transaction_id || !payment_id) {
      return res.status(400).json({ error: 'Missing required fields: transaction_id, payment_id' });
    }

    await reconcileTransaction(transaction_id, payment_id);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'reconcile', 'bank_transaction', JSON.stringify({ transaction_id, payment_id })]
    );

    res.json({ success: true, message: 'Transaction reconciled successfully' });
  } catch (error: any) {
    console.error('Failed to reconcile transaction:', error);
    res.status(500).json({ error: 'Failed to reconcile transaction: ' + (error.message || 'Unknown error') });
  }
});

// Purchase Orders endpoints
router.post('/purchase-orders', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, project_id, date, delivery_date, line_items, notes, currency } = req.body;

    if (!supplier_id || !project_id || !date || !line_items || line_items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: supplier_id, project_id, date, line_items' });
    }

    // Verify project exists (and not soft-deleted)
    const projectResult = await query('SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL', [project_id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get supplier Xero contact ID (and not soft-deleted)
    const supplierResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1 AND deleted_at IS NULL', [supplier_id]);
    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplierXeroId = supplierResult.rows[0].xero_contact_id;

    // Generate PO number
    const countResult = await query('SELECT COUNT(*) as count FROM xero_purchase_orders WHERE deleted_at IS NULL');
    const poNumber = `PO-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    // Store PO in local database with pending sync status
    const poId = await storePurchaseOrder({
      supplier_id,
      project_id,
      date,
      delivery_date,
      line_items,
      notes,
      currency,
      xero_po_id: undefined, // Will be set after sync
      po_number: poNumber,
    });

    // Update sync status to pending
    await query(
      `UPDATE xero_purchase_orders 
       SET sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [poId]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'purchase_order', poId, JSON.stringify({ 
        po_number: poNumber, 
        project_id, 
        supplier_id,
        sync_status: 'pending'
      })]
    );

    // Queue the Xero sync job (async, non-blocking)
    try {
      const { addXeroSyncJob } = await import('../lib/queue');
      await addXeroSyncJob('sync_purchase_order', {
        poId,
        supplierId: supplier_id,
        projectId: project_id,
        date,
        deliveryDate: delivery_date || null,
        lineItems: line_items,
        notes: notes || null,
        currency: currency || 'USD',
        poNumber,
      });
    } catch (queueError: any) {
      console.error('Failed to queue Xero sync job:', queueError);
      // Update PO sync status to indicate queue failure
      await query(
        `UPDATE xero_purchase_orders 
         SET sync_status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [poId]
      );
      // Log the error
      await query(
        `INSERT INTO sync_logs (entity_type, entity_id, request_payload, response_payload, status_code, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        ['purchase_order', poId, null, null, null, `Queue initialization failed: ${queueError.message}`]
      );
      // Don't fail the request - PO is created, user can retry sync later
    }

    // Get created PO with details
    const po = await getPurchaseOrderById(poId);
    
    // Return 202 Accepted - PO created, sync in progress
    res.status(202).json({
      ...po,
      sync_status: 'pending',
      message: 'Purchase order created. Syncing to Xero in the background...'
    });
  } catch (error: any) {
    console.error('Failed to create purchase order:', error);
    res.status(500).json({ error: 'Failed to create purchase order: ' + (error.message || 'Unknown error') });
  }
});

router.get('/purchase-orders', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    const { project_id, supplier_id, status, date_from, date_to } = req.query;

    const pos = await getPurchaseOrders({
      project_id: project_id as string,
      supplier_id: supplier_id as string,
      status: status as string,
      date_from: date_from as string,
      date_to: date_to as string,
    });

    res.json(pos);
  } catch (error: any) {
    // Catch all errors and return empty array - don't fail the request
    console.error('Failed to fetch purchase orders:', error);
    const errorMessage = error.message || 'Unknown error';
    // Log the actual error for debugging
    console.error('[Xero Purchase Orders] Error details:', {
      message: errorMessage,
      code: error.code,
      stack: error.stack
    });
    // Always return empty array with 200 status
    res.status(200).json([]);
  }
});

router.get('/purchase-orders/project/:project_id', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const pos = await getPurchaseOrders({ project_id: req.params.project_id });
    res.json(pos);
  } catch (error) {
    console.error('Failed to fetch purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

// Get sync status for invoice
router.get('/invoices/:id/sync-status', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT sync_status, xero_sync_id FROM xero_invoices WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to get invoice sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Get sync status for purchase order
router.get('/purchase-orders/:id/sync-status', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT sync_status, xero_sync_id FROM xero_purchase_orders WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to get PO sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Get sync logs for an entity
router.get('/sync-logs', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { entity_type, entity_id } = req.query;
    
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id are required' });
    }
    
    const result = await query(
      `SELECT * FROM sync_logs 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [entity_type, entity_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get sync logs:', error);
    res.status(500).json({ error: 'Failed to get sync logs' });
  }
});

router.get('/purchase-orders/:id', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const po = await getPurchaseOrderById(req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json(po);
  } catch (error) {
    console.error('Failed to fetch purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

router.put('/purchase-orders/:id', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, project_id } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (project_id !== undefined) {
      // Allow setting project_id to null to unlink
      if (project_id === null || project_id === '') {
        updates.push(`project_id = NULL`);
      } else {
        // Verify project exists
        const projectResult = await query('SELECT id FROM projects WHERE id = $1', [project_id]);
        if (projectResult.rows.length === 0) {
          return res.status(404).json({ error: 'Project not found' });
        }
        updates.push(`project_id = $${paramCount++}`);
        values.push(project_id);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided. Provide status and/or project_id' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    await query(
      `UPDATE xero_purchase_orders SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    // Log activity
    const logDetails: any = {};
    if (status) logDetails.status = status;
    if (project_id !== undefined) logDetails.project_id = project_id;

    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update', 'purchase_order', req.params.id, JSON.stringify(logDetails)]
    );

    const po = await getPurchaseOrderById(req.params.id);
    res.json(po);
  } catch (error: any) {
    console.error('Failed to update purchase order:', error);
    res.status(500).json({ error: 'Failed to update purchase order: ' + (error.message || 'Unknown error') });
  }
});

router.post('/purchase-orders/:id/convert-to-bill', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const po = await getPurchaseOrderById(req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (po.status === 'BILLED') {
      return res.status(400).json({ error: 'Purchase order already converted to bill' });
    }

    // Get supplier Xero contact ID
    const supplierResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [po.supplier_id]);
    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplierXeroId = supplierResult.rows[0].xero_contact_id;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Convert line items to bill line items
    const lineItems = po.line_items_detail || JSON.parse(po.line_items || '[]');
    const billLineItems = lineItems.map((item: any) => ({
      description: item.description,
      quantity: item.quantity || 1,
      unit_amount: item.unit_amount || item.line_amount,
      account_code: item.account_code,
    }));

    // Create bill in Xero if supplier has Xero ID
    let xeroBillId: string | undefined;
    if (supplierXeroId) {
      const xeroBill = await createBillInXero(
        tokenData,
        {
          supplier_id: po.supplier_id,
          purchase_order_id: po.id,
          project_id: po.project_id,
          date: new Date().toISOString().split('T')[0],
          line_items: billLineItems,
        },
        supplierXeroId
      );

      if (xeroBill) {
        xeroBillId = xeroBill.InvoiceID;
      }
    }

    // Generate bill number
    const countResult = await query('SELECT COUNT(*) as count FROM xero_bills');
    const billNumber = `BILL-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    // Store bill
    const billId = await storeBill({
      supplier_id: po.supplier_id,
      purchase_order_id: po.id,
      project_id: po.project_id,
      date: new Date().toISOString().split('T')[0],
      line_items: billLineItems,
      xero_bill_id: xeroBillId,
      bill_number: billNumber,
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'convert', 'purchase_order', po.id, JSON.stringify({ bill_id: billId, po_id: po.id })]
    );

    const bill = await query(
      `SELECT b.*, c.name as supplier_name, p.code as project_code, p.name as project_name
       FROM xero_bills b
       LEFT JOIN clients c ON b.supplier_id = c.id
       LEFT JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1`,
      [billId]
    );

    res.status(201).json(bill.rows[0]);
  } catch (error: any) {
    console.error('Failed to convert purchase order to bill:', error);
    res.status(500).json({ error: 'Failed to convert purchase order to bill: ' + (error.message || 'Unknown error') });
  }
});

// Bills endpoints
router.post('/bills', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { supplier_id, purchase_order_id, project_id, date, due_date, line_items, reference, currency } = req.body;

    if (!supplier_id || !date || !line_items || line_items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: supplier_id, date, line_items' });
    }

    // Get supplier Xero contact ID
    const supplierResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [supplier_id]);
    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplierXeroId = supplierResult.rows[0].xero_contact_id;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Create bill in Xero if supplier has Xero ID
    let xeroBillId: string | undefined;
    if (supplierXeroId) {
      const xeroBill = await createBillInXero(
        tokenData,
        { supplier_id, purchase_order_id, project_id, date, due_date, line_items, reference, currency },
        supplierXeroId
      );

      if (xeroBill) {
        xeroBillId = xeroBill.InvoiceID;
      }
    }

    // Generate bill number
    const countResult = await query('SELECT COUNT(*) as count FROM xero_bills');
    const billNumber = `BILL-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    // Store bill
    const billId = await storeBill({
      supplier_id,
      purchase_order_id,
      project_id,
      date,
      due_date,
      line_items,
      reference,
      currency,
      xero_bill_id: xeroBillId,
      bill_number: billNumber,
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'bill', billId, JSON.stringify({ bill_number: billNumber, supplier_id })]
    );

    const bill = await query(
      `SELECT b.*, c.name as supplier_name, p.code as project_code, p.name as project_name
       FROM xero_bills b
       LEFT JOIN clients c ON b.supplier_id = c.id
       LEFT JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1`,
      [billId]
    );

    res.status(201).json(bill.rows[0]);
  } catch (error: any) {
    console.error('Failed to create bill:', error);
    res.status(500).json({ error: 'Failed to create bill: ' + (error.message || 'Unknown error') });
  }
});

router.get('/bills', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    const { supplier_id, project_id, purchase_order_id, status, date_from, date_to } = req.query;

    const bills = await getBills({
      supplier_id: supplier_id as string,
      project_id: project_id as string,
      purchase_order_id: purchase_order_id as string,
      status: status as string,
      date_from: date_from as string,
      date_to: date_to as string,
    });

    res.json(bills);
  } catch (error: any) {
    // Catch all errors and return empty array - don't fail the request
    console.error('Failed to fetch bills:', error);
    const errorMessage = error.message || 'Unknown error';
    // Log the actual error for debugging
    console.error('[Xero Bills] Error details:', {
      message: errorMessage,
      code: error.code,
      stack: error.stack
    });
    // Always return empty array with 200 status
    res.status(200).json([]);
  }
});

router.post('/bills/:id/pay', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;

    await markBillAsPaid(req.params.id, amount);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'pay', 'bill', req.params.id, JSON.stringify({ amount })]
    );

    const bill = await query(
      `SELECT b.*, c.name as supplier_name, p.code as project_code, p.name as project_name
       FROM xero_bills b
       LEFT JOIN clients c ON b.supplier_id = c.id
       LEFT JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1`,
      [req.params.id]
    );

    res.json(bill.rows[0]);
  } catch (error: any) {
    console.error('Failed to mark bill as paid:', error);
    res.status(500).json({ error: 'Failed to mark bill as paid: ' + (error.message || 'Unknown error') });
  }
});

// Expenses endpoints
router.post('/expenses', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { project_id, cost_center_id, amount, date, description, receipt_url, currency } = req.body;

    if (!amount || !date || !description) {
      return res.status(400).json({ error: 'Missing required fields: amount, date, description' });
    }

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Get tracking categories if cost center is provided
    let trackingCategories: Array<{ name: string; option: string }> | undefined;
    if (cost_center_id) {
      const costCenterResult = await query(
        'SELECT xero_tracking_category_id, code FROM cost_centers WHERE id = $1',
        [cost_center_id]
      );
      if (costCenterResult.rows.length > 0 && costCenterResult.rows[0].xero_tracking_category_id) {
        // This would need to be expanded based on Xero tracking category structure
      }
    }

    // Create expense in Xero
    const xeroExpense = await createExpenseInXero(
      tokenData,
      { project_id, cost_center_id, amount, date, description, receipt_url, currency },
      trackingCategories
    );

    const xeroExpenseId = xeroExpense?.ExpenseClaimID;

    // Store expense
    const expenseId = await storeExpense({
      project_id,
      cost_center_id,
      amount,
      date,
      description,
      receipt_url,
      xero_expense_id: xeroExpenseId,
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'expense', expenseId, JSON.stringify({ amount, project_id, cost_center_id })]
    );

    const expense = await query(
      `SELECT e.*, p.code as project_code, p.name as project_name, cc.code as cost_center_code, cc.name as cost_center_name
       FROM xero_expenses e
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
       WHERE e.id = $1`,
      [expenseId]
    );

    res.status(201).json(expense.rows[0]);
  } catch (error: any) {
    console.error('Failed to create expense:', error);
    res.status(500).json({ error: 'Failed to create expense: ' + (error.message || 'Unknown error') });
  }
});

router.get('/expenses', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    const { project_id, cost_center_id, status, date_from, date_to } = req.query;

    const expenses = await getExpenses({
      project_id: project_id as string,
      cost_center_id: cost_center_id as string,
      status: status as string,
      date_from: date_from as string,
      date_to: date_to as string,
    });

    res.json(expenses);
  } catch (error: any) {
    // Catch all errors and return empty array - don't fail the request
    console.error('Failed to fetch expenses:', error);
    const errorMessage = error.message || 'Unknown error';
    // Log the actual error for debugging
    console.error('[Xero Expenses] Error details:', {
      message: errorMessage,
      code: error.code,
      stack: error.stack
    });
    // Always return empty array with 200 status
    res.status(200).json([]);
  }
});

// Financial Reports endpoints
router.get('/reports/profit-loss', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(200).json({ error: 'Xero not connected or token expired', report: null });
    }

    const report = await getProfitLossReport(tokenData, date_from as string, date_to as string);
    if (!report) {
      return res.status(200).json({ error: 'Failed to fetch Profit & Loss report', report: null });
    }

    res.status(200).json(report);
  } catch (error: any) {
    console.error('Failed to fetch P&L report:', error);
    res.status(200).json({ error: 'Failed to fetch Profit & Loss report', report: null });
  }
});

router.get('/reports/balance-sheet', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(200).json({ error: 'Xero not connected or token expired', report: null });
    }

    const report = await getBalanceSheetReport(tokenData, date as string);
    if (!report) {
      return res.status(200).json({ error: 'Failed to fetch Balance Sheet report', report: null });
    }

    res.status(200).json(report);
  } catch (error: any) {
    console.error('Failed to fetch Balance Sheet report:', error);
    res.status(200).json({ error: 'Failed to fetch Balance Sheet report', report: null });
  }
});

router.get('/reports/cash-flow', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(200).json({ error: 'Xero not connected or token expired', report: null });
    }

    const report = await getCashFlowReport(tokenData, date_from as string, date_to as string);
    if (!report) {
      return res.status(200).json({ error: 'Failed to fetch Cash Flow report', report: null });
    }

    res.status(200).json(report);
  } catch (error: any) {
    console.error('Failed to fetch Cash Flow report:', error);
    res.status(200).json({ error: 'Failed to fetch Cash Flow report', report: null });
  }
});

router.get('/reports/aged-receivables', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(200).json({ error: 'Xero not connected or token expired', report: null });
    }

    const report = await getAgedReceivablesReport(tokenData, date as string);
    if (!report) {
      return res.status(200).json({ error: 'Failed to fetch Aged Receivables report', report: null });
    }

    res.status(200).json(report);
  } catch (error: any) {
    console.error('Failed to fetch Aged Receivables report:', error);
    res.status(200).json({ error: 'Failed to fetch Aged Receivables report', report: null });
  }
});

router.get('/reports/aged-payables', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(200).json({ error: 'Xero not connected or token expired', report: null });
    }

    const report = await getAgedPayablesReport(tokenData, date as string);
    if (!report) {
      return res.status(200).json({ error: 'Failed to fetch Aged Payables report', report: null });
    }

    res.status(200).json(report);
  } catch (error: any) {
    console.error('Failed to fetch Aged Payables report:', error);
    res.status(200).json({ error: 'Failed to fetch Aged Payables report', report: null });
  }
});

// Items/Inventory endpoints
router.post('/items/sync', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    const synced = await syncItemsFromXero(tokenData);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'sync', 'xero_items', JSON.stringify({ synced })]
    );

    res.json({ success: true, synced, message: `Synced ${synced} item(s)` });
  } catch (error: any) {
    console.error('Failed to sync items:', error);
    res.status(500).json({ error: 'Failed to sync items: ' + (error.message || 'Unknown error') });
  }
});

router.get('/items', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { search, is_tracked } = req.query;

    const items = await getItems({
      search: search as string,
      is_tracked: is_tracked === 'true' ? true : is_tracked === 'false' ? false : undefined,
    });

    res.json(items);
  } catch (error) {
    console.error('Failed to fetch items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.get('/items/:id', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const item = await getItemById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Failed to fetch item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

router.put('/items/:id/stock', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { stock_level } = req.body;

    if (stock_level === undefined || stock_level < 0) {
      return res.status(400).json({ error: 'Valid stock_level is required' });
    }

    await updateItemStock(req.params.id, parseFloat(stock_level));

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'update_stock', 'item', req.params.id, JSON.stringify({ stock_level })]
    );

    const item = await getItemById(req.params.id);
    res.json(item);
  } catch (error: any) {
    console.error('Failed to update item stock:', error);
    res.status(500).json({ error: 'Failed to update item stock: ' + (error.message || 'Unknown error') });
  }
});

// Credit Notes endpoints
router.post('/credit-notes', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id, amount, date, reason, description, currency } = req.body;

    if (!invoice_id || !amount || !date) {
      return res.status(400).json({ error: 'Missing required fields: invoice_id, amount, date' });
    }

    // Get invoice details
    const invoiceResult = await query('SELECT id, xero_invoice_id, client_id, total FROM xero_invoices WHERE id = $1', [invoice_id]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Get client Xero contact ID
    const clientResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [invoice.client_id]);
    if (clientResult.rows.length === 0 || !clientResult.rows[0].xero_contact_id) {
      return res.status(404).json({ error: 'Client Xero contact ID not found' });
    }

    const contactXeroId = clientResult.rows[0].xero_contact_id;

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    // Create credit note in Xero
    let xeroCreditNoteId: string | undefined;
    if (invoice.xero_invoice_id && contactXeroId) {
      const xeroCreditNote = await createCreditNoteInXero(
        tokenData,
        { invoice_id, amount, date, reason, description, currency },
        invoice.xero_invoice_id,
        contactXeroId
      );

      if (xeroCreditNote) {
        xeroCreditNoteId = xeroCreditNote.CreditNoteID;

        // Apply credit note to invoice
        await applyCreditNoteToInvoice(tokenData, xeroCreditNoteId, invoice.xero_invoice_id);
      }
    }

    // Generate credit note number
    const countResult = await query('SELECT COUNT(*) as count FROM xero_credit_notes');
    const creditNoteNumber = `CN-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    // Store credit note
    const creditNoteId = await storeCreditNote({
      invoice_id,
      amount: parseFloat(amount),
      date,
      reason,
      description,
      currency,
      xero_credit_note_id: xeroCreditNoteId,
      credit_note_number: creditNoteNumber,
    });

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'create', 'credit_note', creditNoteId, JSON.stringify({ invoice_id, amount, reason })]
    );

    const creditNote = await query(
      `SELECT cn.*, xi.invoice_number, c.name as client_name
       FROM xero_credit_notes cn
       LEFT JOIN xero_invoices xi ON cn.invoice_id = xi.id
       LEFT JOIN clients c ON xi.client_id = c.id
       WHERE cn.id = $1`,
      [creditNoteId]
    );

    res.status(201).json(creditNote.rows[0]);
  } catch (error: any) {
    console.error('Failed to create credit note:', error);
    res.status(500).json({ error: 'Failed to create credit note: ' + (error.message || 'Unknown error') });
  }
});

router.get('/credit-notes', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id, date_from, date_to, status } = req.query;

    const creditNotes = await getCreditNotes({
      invoice_id: invoice_id as string,
      date_from: date_from as string,
      date_to: date_to as string,
      status: status as string,
    });

    res.json(creditNotes);
  } catch (error) {
    console.error('Failed to fetch credit notes:', error);
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

router.post('/credit-notes/:id/apply', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const creditNoteResult = await query('SELECT xero_credit_note_id, invoice_id FROM xero_credit_notes WHERE id = $1', [req.params.id]);
    if (creditNoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Credit note not found' });
    }

    const creditNote = creditNoteResult.rows[0];
    const invoiceResult = await query('SELECT xero_invoice_id FROM xero_invoices WHERE id = $1', [creditNote.invoice_id]);
    
    if (invoiceResult.rows.length === 0 || !invoiceResult.rows[0].xero_invoice_id) {
      return res.status(404).json({ error: 'Invoice not found or not synced to Xero' });
    }

    const tokenData = await getValidAccessToken();
    if (!tokenData) {
      return res.status(400).json({ error: 'Xero not connected or token expired' });
    }

    const applied = await applyCreditNoteToInvoice(
      tokenData,
      creditNote.xero_credit_note_id,
      invoiceResult.rows[0].xero_invoice_id
    );

    if (!applied) {
      return res.status(500).json({ error: 'Failed to apply credit note to invoice' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'apply', 'credit_note', req.params.id, JSON.stringify({ invoice_id: creditNote.invoice_id })]
    );

    res.json({ success: true, message: 'Credit note applied to invoice successfully' });
  } catch (error: any) {
    console.error('Failed to apply credit note:', error);
    res.status(500).json({ error: 'Failed to apply credit note: ' + (error.message || 'Unknown error') });
  }
});

// Payment Reminders endpoints
router.get('/reminders/schedule', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await getReminderSchedule();
    res.json(schedule);
  } catch (error: any) {
    console.error('Failed to get reminder schedule:', error);
    res.status(500).json({ error: 'Failed to get reminder schedule: ' + (error.message || 'Unknown error') });
  }
});

router.put('/reminders/schedule', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const schedule = req.body;

    await updateReminderSchedule(schedule);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'update', 'reminder_schedule', JSON.stringify(schedule)]
    );

    res.json({ success: true, schedule });
  } catch (error: any) {
    console.error('Failed to update reminder schedule:', error);
    res.status(500).json({ error: 'Failed to update reminder schedule: ' + (error.message || 'Unknown error') });
  }
});

router.post('/reminders/send', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id, reminder_type } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'invoice_id is required' });
    }

    const success = await sendPaymentReminder(invoice_id, reminder_type || 'manual');

    if (!success) {
      return res.status(500).json({ error: 'Failed to send payment reminder' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, 'send_reminder', 'invoice', invoice_id, JSON.stringify({ reminder_type: reminder_type || 'manual' })]
    );

    res.json({ success: true, message: 'Payment reminder sent successfully' });
  } catch (error: any) {
    console.error('Failed to send payment reminder:', error);
    res.status(500).json({ error: 'Failed to send payment reminder: ' + (error.message || 'Unknown error') });
  }
});

router.post('/reminders/process', authenticate, requirePermission('can_sync_xero'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await processPaymentReminders();
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Failed to process payment reminders:', error);
    res.status(500).json({ error: 'Failed to process payment reminders: ' + (error.message || 'Unknown error') });
  }
});

router.get('/reminders/history', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_id, date_from, date_to } = req.query;

    const history = await getReminderHistory({
      invoice_id: invoice_id as string,
      date_from: date_from as string,
      date_to: date_to as string,
    });

    res.json(history);
  } catch (error) {
    console.error('Failed to fetch reminder history:', error);
    res.status(500).json({ error: 'Failed to fetch reminder history' });
  }
});

// Webhooks endpoints
router.post('/webhooks', async (req: AuthRequest, res: Response) => {
  try {
    const signature = req.headers['x-xero-signature'] as string;
    const webhookKey = process.env.XERO_WEBHOOK_KEY || '';

    if (!signature || !webhookKey) {
      return res.status(401).json({ error: 'Missing webhook signature or key' });
    }

    const payload = JSON.stringify(req.body);
    
    // Verify signature
    if (!verifyWebhookSignature(payload, signature, webhookKey)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Process webhook events
    const events = req.body.events || [];
    const eventIds: string[] = [];

    for (const event of events) {
      const eventId = await storeWebhookEvent(
        event.eventType,
        event.resourceId,
        event
      );
      eventIds.push(eventId);

      // Process event asynchronously
      processWebhookEvent(eventId).catch(error => {
        console.error('Error processing webhook event:', error);
      });
    }

    res.status(200).json({ success: true, events_processed: eventIds.length });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing error: ' + (error.message || 'Unknown error') });
  }
});

router.get('/webhooks/status', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const status = await getWebhookStatus();
    res.json(status);
  } catch (error: any) {
    console.error('Failed to get webhook status:', error);
    res.status(500).json({ error: 'Failed to get webhook status: ' + (error.message || 'Unknown error') });
  }
});

router.get('/webhooks/events', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    const { event_type, processed, date_from, date_to } = req.query;

    const events = await getWebhookEvents({
      event_type: event_type as string,
      processed: processed === 'true' ? true : processed === 'false' ? false : undefined,
      date_from: date_from as string,
      date_to: date_to as string,
    });

    res.json(events);
  } catch (error) {
    console.error('Failed to fetch webhook events:', error);
    res.status(500).json({ error: 'Failed to fetch webhook events' });
  }
});

// Get financial summary
router.get('/summary', authenticate, requirePermission('can_view_financials'), async (req: AuthRequest, res: Response) => {
  try {
    // Ensure tables exist before querying (don't fail if this errors)
    try {
      await ensureXeroTables();
    } catch (ensureError: any) {
      console.warn('[Xero] Failed to ensure tables exist:', ensureError.message);
      // Continue anyway - tables might already exist
    }
    
    // Helper function to safely query and return default on ANY error
    const safeQuery = async (sql: string, defaultValue: any) => {
      try {
        const result = await query(sql);
        return result;
      } catch (error: any) {
        // Catch ALL errors and return default - don't throw
        console.warn('[Xero Summary] Query failed, using default value:', error.message);
        return { rows: Array.isArray(defaultValue) ? defaultValue : [defaultValue] };
      }
    };

    // Outstanding invoices
    const outstanding = await safeQuery(`
      SELECT COALESCE(SUM(amount_due), 0) as total
      FROM xero_invoices
      WHERE status IN ('AUTHORISED', 'SUBMITTED')
    `, { total: '0' });

    // Paid this month
    const paidThisMonth = await safeQuery(`
      SELECT COALESCE(SUM(amount_paid), 0) as total
      FROM xero_invoices
      WHERE status = 'PAID'
      AND updated_at >= date_trunc('month', CURRENT_DATE)
    `, { total: '0' });

    // Pending quotes
    const pendingQuotes = await safeQuery(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
      FROM xero_quotes
      WHERE status = 'PENDING'
    `, { total: '0', count: '0' });

    // Revenue last 6 months
    const revenueByMonth = await safeQuery(`
      SELECT 
        date_trunc('month', issue_date) as month,
        COALESCE(SUM(total), 0) as total
      FROM xero_invoices
      WHERE status = 'PAID'
      AND issue_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY date_trunc('month', issue_date)
      ORDER BY month ASC
    `, []);

    // Top clients by revenue
    const topClients = await safeQuery(`
      SELECT 
        c.id, c.name,
        COALESCE(SUM(xi.total), 0) as total_revenue
      FROM clients c
      LEFT JOIN xero_invoices xi ON c.id = xi.client_id AND xi.status = 'PAID'
      GROUP BY c.id, c.name
      ORDER BY total_revenue DESC
      LIMIT 5
    `, []);

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
  } catch (error: any) {
    console.error('Failed to fetch financial summary:', error);
    const errorMessage = error.message || 'Failed to fetch financial summary';
    // Return empty summary instead of error
    res.json({
      outstanding_invoices: 0,
      paid_this_month: 0,
      pending_quotes: { total: 0, count: 0 },
      revenue_by_month: [],
      top_clients: []
    });
  }
});

export default router;
