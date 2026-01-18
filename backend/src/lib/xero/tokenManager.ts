import { supabase as supabaseClient } from '../../db/supabase';
import { log } from '../logger';

const supabase = supabaseClient!;

interface XeroToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  organizationId?: string;
  organizationName?: string;
}

/**
 * Retrieve stored Xero token from Supabase
 */
export async function getXeroToken(userId: string, orgId?: string): Promise<XeroToken | null> {
  try {
    const query = supabase
      .from('xero_auth')
      .select('*')
      .eq('user_id', userId);

    if (orgId) {
      query.eq('organization_id', orgId);
    } else {
      query.is('organization_id', null);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      log.warn('Xero token not found', { userId, orgId, error: error?.message });
      return null;
    }

    return {
      accessToken: (data as any).access_token,
      refreshToken: (data as any).refresh_token,
      expiresAt: new Date((data as any).expires_at),
      organizationId: (data as any).organization_id,
      organizationName: (data as any).organization_name
    };
  } catch (error) {
    log.error('Error retrieving Xero token', error);
    return null;
  }
}

/**
 * Save or update Xero token in Supabase
 */
export async function saveXeroToken(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;  // seconds from now
    organizationId: string;
    organizationName: string;
  }
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expiresIn);

    const { error } = await supabase.from('xero_auth').upsert({
      user_id: userId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: expiresAt.toISOString(),
      organization_id: tokens.organizationId,
      organization_name: tokens.organizationName,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,organization_id' });

    if (error) {
      log.error('Failed to save Xero token', error);
      throw error;
    }

    log.info('Xero token saved successfully', {
      userId,
      organizationId: tokens.organizationId,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    log.error('Error saving Xero token', error);
    throw error;
  }
}

/**
 * Refresh Xero access token using refresh token
 * Returns new access token
 */
export async function refreshXeroAccessToken(userId: string, orgId?: string): Promise<string> {
  try {
    const token = await getXeroToken(userId, orgId);
    if (!token) {
      throw new Error('Xero not connected - no refresh token found');
    }

    log.info('Refreshing Xero access token', { userId, orgId });

    // Exchange refresh token for new access token
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.XERO_CLIENT_ID!,
        client_secret: process.env.XERO_CLIENT_SECRET!,
        refresh_token: token.refreshToken
      }).toString()
    });

    const data = await response.json() as any;

    if (!response.ok) {
      log.error('Xero token refresh failed', {
        status: response.status,
        error: data.error,
        error_description: data.error_description
      });
      throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
    }

    // Save new token
    await saveXeroToken(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      organizationId: token.organizationId || 'default',
      organizationName: token.organizationName || ''
    });

    log.info('Xero token refreshed successfully', { userId });
    return data.access_token;
  } catch (error) {
    log.error('Error refreshing Xero token', error);
    throw error;
  }
}

/**
 * Get a valid, non-expired Xero access token
 * Automatically refreshes if token expires within 5 minutes
 */
export async function getValidXeroToken(userId: string, orgId?: string): Promise<string> {
  try {
    let token = await getXeroToken(userId, orgId);
    if (!token) {
      throw new Error('Xero not connected');
    }

    // Check if token expires in < 5 minutes (300 seconds)
    const expiryBuffer = new Date(Date.now() + 5 * 60 * 1000);
    if (token.expiresAt < expiryBuffer) {
      log.info('Xero token expiring soon, refreshing', {
        userId,
        expiresAt: token.expiresAt,
        refreshBuffer: expiryBuffer
      });
      return await refreshXeroAccessToken(userId, orgId);
    }

    return token.accessToken;
  } catch (error) {
    log.error('Error getting valid Xero token', error);
    throw error;
  }
}

/**
 * Revoke/disconnect Xero connection
 */
export async function revokeXeroToken(userId: string, orgId?: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('xero_auth')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', orgId || null);

    if (error) {
      log.error('Failed to revoke Xero token', error);
      throw error;
    }

    log.info('Xero token revoked', { userId, orgId });
  } catch (error) {
    log.error('Error revoking Xero token', error);
    throw error;
  }
}

/**
 * Check if user has valid Xero connection
 */
export async function isXeroConnected(userId: string, orgId?: string): Promise<boolean> {
  try {
    const token = await getXeroToken(userId, orgId);
    if (!token) return false;

    // Check if token is expired
    if (token.expiresAt < new Date()) {
      log.warn('Xero token expired', { userId, orgId });
      return false;
    }

    return true;
  } catch (error) {
    log.error('Error checking Xero connection status', error);
    return false;
  }
}
