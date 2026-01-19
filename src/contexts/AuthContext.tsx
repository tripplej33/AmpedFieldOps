import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
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
async function loadUserProfile(userId: string, session?: Session | null): Promise<User | null> {
  try {
    console.log('loadUserProfile called for userId:', userId, 'with session:', !!session?.user);
    
    // The Supabase client already carries the current session for authenticated queries
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, avatar_url')
      .eq('id', userId)
      .single();

    console.log('User profile query result:', { data, error });

    if (error) {
      console.error('Failed to load user profile - error details:', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      });
      return null;
    }

    if (!data) {
      return null;
    }

    // Load user permissions
    const { data: permData, error: permError } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', userId);

    if (permError) {
      console.error('Failed to load user permissions:', permError);
      return { ...data, permissions: [] };
    }

    // Map permission_ids to permission names by querying permissions table
    let permissions: string[] = [];
    if (permData && permData.length > 0) {
      // permissions table uses key; user_permissions.permission references that key
      const permKeys = permData.map((p) => p.permission);
      const { data: permNames, error: nameError } = await supabase
        .from('permissions')
        .select('name, key')
        .in('key', permKeys);

      if (!nameError && permNames) {
        permissions = permNames.map((p) => p.key || p.name).filter(Boolean);
      }
    }

    // Check if this is the first-time setup (first user in system)
    let isFirstTimeSetup = false;
    try {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('setup_complete')
        .single();

      // If setup_complete is false, mark this as first-time setup
      if (appSettings && !appSettings.setup_complete) {
        isFirstTimeSetup = true;
      }
    } catch (e) {
      console.warn('Failed to check setup status:', e);
    }

    return {
      ...data,
      permissions,
      isFirstTimeSetup,
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
  const [initComplete, setInitComplete] = useState(false);
  const initRan = React.useRef(false);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      if (initRan.current) {
        return;
      }
      initRan.current = true;
      try {
        console.log('Starting auth initialization...');
        // Get current session - this is the source of truth for initial state
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Failed to get session:', sessionError);
          setInitComplete(true);
          setIsLoading(false);
          return;
        }

        console.log('getSession returned:', !!session?.user);

        if (session?.user) {
          // Propagate token to API client for backend auth
          api.setToken(session.access_token);
          setSession(session);
          const userProfile = await loadUserProfile(session.user.id);
          setUser(userProfile);
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        // Mark initialization complete - now we know the real auth state
        console.log('Auth initialization complete');
        setInitComplete(true);
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth state changes - only update state after initialization
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, 'Session exists:', !!session?.user, 'initComplete:', initComplete);
      
      // Skip INITIAL_SESSION event - we already handled it in initAuth via getSession()
      if (event === 'INITIAL_SESSION') {
        console.log('Skipping INITIAL_SESSION event (handled in initAuth)');
        return;
      }

      // Propagate Supabase access token to API client for backend requests
      api.setToken(session?.access_token || null);
      setSession(session);

      if (!session?.user) {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log('Signed out, clearing auth state');
          setUser(null);
        } else {
          console.log('No session user, clearing auth state');
          setUser(null);
        }
        setIsLoading(false);
        setInitComplete(true);
        return;
      }

      try {
        const userProfile = await loadUserProfile(session.user.id, session);
        if (userProfile) {
          console.log('User profile loaded after auth event:', userProfile.email);
          setUser(userProfile);
        } else {
          console.warn('User profile returned null for user:', session.user.id);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
      } finally {
        setIsLoading(false);
        setInitComplete(true);
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

    // Set backend API token to Supabase access token so protected routes work
    api.setToken(data.session.access_token);

    // Load user profile - but don't fail login if profile load is slow/fails
    // The onAuthStateChange listener will also attempt to load it
    try {
      const userProfile = await loadUserProfile(data.user.id, data.session);
      if (userProfile) {
        console.log('User profile loaded after login:', userProfile.email);
        setSession(data.session);
        setUser(userProfile);
        return { user: userProfile, session: data.session };
      } else {
        console.warn('Profile load returned null, but authentication succeeded');
        // Still set session even if profile isn't loaded yet
        setSession(data.session);
        return { user: null, session: data.session };
      }
    } catch (profileError) {
      console.warn('Profile load failed but auth succeeded, proceeding:', profileError);
      setSession(data.session);
      return { user: null, session: data.session };
    }
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
        isAuthenticated: !!session?.user,
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
