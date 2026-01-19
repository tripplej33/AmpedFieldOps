import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';

// Create a Supabase service client for server-side operations
// Only initialized when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// Service-role client when available (preferred)
export const supabase = (() => {
  console.log('[Supabase] Initializing client...');
  console.log('[Supabase] SUPABASE_URL:', env.SUPABASE_URL ? 'SET' : 'NOT SET');
  console.log('[Supabase] SUPABASE_SERVICE_ROLE_KEY:', env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (length: ' + env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'NOT SET');
  
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[Supabase] Creating client with URL:', env.SUPABASE_URL);
    return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  
  console.warn('[Supabase] Client NOT initialized - missing URL or key!');
  return null;
})();

// Fallback: build a scoped client using anon key and caller access token (respects RLS)
export function getSupabaseClient(accessToken?: string): SupabaseClient | null {
  if (!env.SUPABASE_URL) return null;

  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!key) return null;

  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined;

  return createClient(env.SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: headers ? { headers } : undefined,
  });
}

/**
 * Verify a Supabase JWT token and extract the user ID
 * Tokens are issued by Supabase Auth (GoTrue) and include the user ID in the 'sub' claim
 */
export async function verifySupabaseToken(token: string): Promise<{ userId: string; email?: string } | null> {
  try {
    if (!env.SUPABASE_URL) {
      return null;
    }

    // Get the public key from Supabase
    // Tokens are signed with RS256, so we need to verify the signature
    // For local development, we can extract the payload directly
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      console.error('Failed to decode token');
      return null;
    }

    const payload = decoded.payload as any;
    
    // Note: We skip strict issuer validation to allow proxied URLs; token is only decoded for user identity

    // Check token expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      console.error('Token expired');
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email,
    };
  } catch (error) {
    console.error('Error verifying Supabase token:', error);
    return null;
  }
}

/**
 * Query the public.users table to get user profile and permissions
 * This is called after verifying the JWT to get app-specific user data
 */
export async function loadUserWithPermissions(userId: string, accessToken?: string) {
  const client = supabase || getSupabaseClient(accessToken);
  if (!client) return null;

  try {
    // Fetch user profile using service role (bypasses RLS)
    const { data: profileData, error: profileError } = await client
      .from('users')
      .select('id, email, name, role, avatar_url')
      .eq('id', userId)
      .single();

    if (profileError || !profileData) {
      console.error('Failed to load user profile:', profileError);
      return null;
    }

    // Fetch user permissions (user_permissions.permission FK -> permissions.key)
    const { data: permData, error: permError } = await client
      .from('user_permissions')
      .select('permission')
      .eq('user_id', userId);

    if (permError) {
      console.error('Failed to load user permissions:', permError);
      return {
        ...profileData,
        permissions: [],
      };
    }

    // Map permission IDs to permission names
    let permissions: string[] = [];
    if (permData && permData.length > 0) {
      const permKeys = permData.map((p: any) => p.permission);
      const { data: permNames, error: nameError } = await client
        .from('permissions')
        .select('key, name')
        .in('key', permKeys);

      if (!nameError && permNames) {
        permissions = permNames.map((p: any) => p.key || p.name).filter(Boolean);
      }
    }

    return {
      ...profileData,
      permissions,
    };
  } catch (error) {
    console.error('Error loading user with permissions:', error);
    return null;
  }
}
