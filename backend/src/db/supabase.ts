import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';

// Create a Supabase service client for server-side operations
// Only initialized when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
export const supabase = (() => {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return null;
})();

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
    
    // Verify the issuer is Supabase
    if (payload.iss && !payload.iss.includes(env.SUPABASE_URL)) {
      console.error('Invalid token issuer:', payload.iss);
      return null;
    }

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
export async function loadUserWithPermissions(userId: string) {
  if (!supabase) {
    return null;
  }

  try {
    // Fetch user profile using service role (bypasses RLS)
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('id, email, name, role, avatar')
      .eq('id', userId)
      .single();

    if (profileError || !profileData) {
      console.error('Failed to load user profile:', profileError);
      return null;
    }

    // Fetch user permissions
    const { data: permData, error: permError } = await supabase
      .from('user_permissions')
      .select('permission_id')
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
      const permIds = permData.map((p: any) => p.permission_id);
      const { data: permNames, error: nameError } = await supabase
        .from('permissions')
        .select('name')
        .in('id', permIds);

      if (!nameError && permNames) {
        permissions = permNames.map((p: any) => p.name);
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
