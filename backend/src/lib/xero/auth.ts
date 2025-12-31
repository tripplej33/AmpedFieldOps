import { query } from '../../db';
import { env } from '../../config/env';

/**
 * Get Xero credentials from settings or environment variables
 */
export async function getXeroCredentials() {
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
  const savedRedirectUri = redirectUriResult.rows[0]?.value;
  let redirectUri = savedRedirectUri || env.XERO_REDIRECT_URI;
  
  if (!redirectUri || redirectUri.trim() === '') {
    const frontendUrl = env.FRONTEND_URL;
    if (frontendUrl && !frontendUrl.includes('localhost')) {
      redirectUri = `${frontendUrl}/api/xero/callback`;
    } else {
      const backendUrl = env.BACKEND_URL || 'http://localhost:3001';
      redirectUri = `${backendUrl}/api/xero/callback`;
    }
  }
  
  return { clientId, clientSecret, redirectUri };
}

/**
 * Get a valid Xero access token, refreshing if necessary
 * This is a shared function used by both routes and workers
 */
export async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string } | null> {
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
