import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Create Supabase client with service role key for backend operations
// Service role key bypasses RLS - use carefully!
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
