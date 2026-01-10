import { createClient } from '@supabase/supabase-js'

// Get Supabase URL and anon key from environment variables
// For local development, default to local Supabase instance
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
// Local Supabase uses a default anon key (for production, use VITE_SUPABASE_ANON_KEY)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// Helper function to get the current user's profile with role and permissions
export async function getCurrentUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return null
  }

  // Fetch user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    console.error('Error fetching user profile:', profileError)
    return null
  }

  // Fetch user permissions
  const { data: permissions, error: permissionsError } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', user.id)
    .eq('granted', true)

  const permissionList = permissions?.map(p => p.permission) || []

  return {
    id: user.id,
    email: user.email || '',
    name: profile.name,
    role: profile.role as 'admin' | 'manager' | 'user',
    permissions: permissionList,
    avatar: profile.avatar
  }
}
