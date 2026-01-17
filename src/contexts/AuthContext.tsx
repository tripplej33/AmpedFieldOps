import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'user';
  permissions: string[];
  avatar?: string;
  isFirstTimeSetup?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ user: User; session: Session }>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<{ user: User; session: Session }>;
  updateUser: (updates: Partial<User>) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Load user profile from public.users table
 * This maps the Supabase auth.users to the app's user profile
 */
async function loadUserProfile(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, avatar')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Failed to load user profile:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Load user permissions
    const { data: permData, error: permError } = await supabase
      .from('user_permissions')
      .select('permission_id')
      .eq('user_id', userId);

    if (permError) {
      console.error('Failed to load user permissions:', permError);
      return { ...data, permissions: [] };
    }

    // Map permission_ids to permission names by querying permissions table
    let permissions: string[] = [];
    if (permData && permData.length > 0) {
      const permIds = permData.map((p) => p.permission_id);
      const { data: permNames, error: nameError } = await supabase
        .from('permissions')
        .select('name')
        .in('id', permIds);

      if (!nameError && permNames) {
        permissions = permNames.map((p) => p.name);
      }
    }

    return {
      ...data,
      permissions,
    };
  } catch (error) {
    console.error('Error loading user profile:', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Failed to get session:', sessionError);
          setIsLoading(false);
          return;
        }

        if (session?.user) {
          setSession(session);
          const userProfile = await loadUserProfile(session.user.id);
          setUser(userProfile);
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      setSession(session);

      if (session?.user) {
        const userProfile = await loadUserProfile(session.user.id);
        setUser(userProfile);
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user || !data.session) {
      throw new Error('Login failed: No user or session returned');
    }

    const userProfile = await loadUserProfile(data.user.id);
    if (!userProfile) {
      throw new Error('Failed to load user profile after login');
    }

    setSession(data.session);
    setUser(userProfile);

    return {
      user: userProfile,
      session: data.session,
    };
  };

  const signup = async (email: string, password: string, name: string) => {
    // Sign up user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user || !data.session) {
      throw new Error('Signup failed: No user or session returned');
    }

    // Create user profile in public.users
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email,
        name,
        role: 'user', // Default role is 'user'
        created_at: new Date().toISOString(),
      });

    if (profileError) {
      // Attempt cleanup of auth user if profile creation fails
      await supabase.auth.signOut();
      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    const userProfile = await loadUserProfile(data.user.id);
    if (!userProfile) {
      throw new Error('Failed to load user profile after signup');
    }

    setSession(data.session);
    setUser(userProfile);

    return {
      user: userProfile,
      session: data.session,
    };
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
    setSession(null);
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions.includes(permission);
  };

  const hasRole = (...roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        signup,
        updateUser,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
