import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, getCurrentUserProfile } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js'
import { log } from '@/lib/logger';

interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'user';
  permissions: string[];
  avatar?: string;
}

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string, name: string, role?: 'admin' | 'manager' | 'user') => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          const userProfile = await getCurrentUserProfile()
          if (userProfile) {
            setUser(userProfile)
          }
        }
      } catch (error) {
        log.error('Auth check failed', error instanceof Error ? error : undefined, { component: 'AuthContext' });
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const userProfile = await getCurrentUserProfile()
        if (userProfile) {
          setUser(userProfile)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Refresh user profile on token refresh
        const userProfile = await getCurrentUserProfile()
        if (userProfile) {
          setUser(userProfile)
        }
      }
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message)
    }

    if (data.user) {
      const userProfile = await getCurrentUserProfile()
      if (userProfile) {
        setUser(userProfile)
      } else {
        throw new Error('User profile not found')
      }
    }
  };

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  };

  const register = async (email: string, password: string, name: string, role: 'admin' | 'manager' | 'user' = 'user') => {
    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      throw new Error(authError.message)
    }

    if (!authData.user) {
      throw new Error('Registration failed')
    }

    // Create user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        name,
        role,
        is_active: true
      })

    if (profileError) {
      // If profile creation fails, try to clean up auth user
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {})
      throw new Error('Failed to create user profile')
    }

    // Set default permissions based on role
    // This will be handled by a database trigger or backend function
    // For now, we'll set them manually
    const defaultPermissions = getDefaultPermissions(role)
    if (defaultPermissions.length > 0) {
      const permissionInserts = defaultPermissions.map(permission => ({
        user_id: authData.user.id,
        permission,
        granted: true
      }))

      const { error: permError } = await supabase
        .from('user_permissions')
        .insert(permissionInserts)

      if (permError) {
        console.warn('Failed to set default permissions:', permError)
      }
    }

    // Get the full user profile
    const userProfile = await getCurrentUserProfile()
    if (userProfile) {
      setUser(userProfile)
    } else {
      throw new Error('Failed to load user profile after registration')
    }
  };

  const updateUser = (updates: Partial<AppUser>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null)
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.role === 'admin') return true
    return user.permissions.includes(permission)
  };

  const hasRole = (...roles: string[]): boolean => {
    if (!user) return false
    return roles.includes(user.role)
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      register,
      updateUser,
      hasPermission,
      hasRole
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Helper function to get default permissions for a role
function getDefaultPermissions(role: string): string[] {
  const basePermissions = [
    'can_create_timesheets',
    'can_view_own_timesheets',
    'can_edit_own_timesheets',
    'can_delete_own_timesheets',
    'can_view_projects',
    'can_view_clients',
    'can_view_dashboard'
  ];
  
  if (role === 'admin') {
    return [
      ...basePermissions,
      'can_view_financials',
      'can_edit_projects',
      'can_manage_users',
      'can_sync_xero',
      'can_view_all_timesheets',
      'can_edit_activity_types',
      'can_manage_clients',
      'can_manage_cost_centers',
      'can_view_reports',
      'can_export_data',
      'can_manage_settings'
    ];
  }
  
  if (role === 'manager') {
    return [
      ...basePermissions,
      'can_view_financials',
      'can_edit_projects',
      'can_view_all_timesheets',
      'can_manage_clients',
      'can_view_reports',
      'can_export_data'
    ];
  }
  
  return basePermissions;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
