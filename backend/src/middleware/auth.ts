import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { query } from '../db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'manager' | 'user';
    permissions: string[];
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token with Supabase
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
    
    if (error || !supabaseUser) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Get user profile
    const profileResult = await query(
      'SELECT name, role, is_active FROM user_profiles WHERE id = $1',
      [supabaseUser.id]
    );
    
    if (profileResult.rows.length === 0) {
      return res.status(401).json({ error: 'User profile not found' });
    }
    
    const profile = profileResult.rows[0];
    
    if (!profile.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    // Get user permissions
    const permResult = await query(
      'SELECT permission FROM user_permissions WHERE user_id = $1 AND granted = true',
      [supabaseUser.id]
    );
    
    const permissions = permResult.rows.map(p => p.permission);
    
    req.user = {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      name: profile.name,
      role: profile.role as 'admin' | 'manager' | 'user',
      permissions
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

export const requirePermission = (...permissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Admins have all permissions
    if (req.user.role === 'admin') {
      return next();
    }
    
    const hasPermission = permissions.some(p => req.user!.permissions.includes(p));
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    next();
  };
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      // Verify token with Supabase
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
      
      if (!error && supabaseUser) {
        // Get user profile
        const profileResult = await query(
          'SELECT name, role, is_active FROM user_profiles WHERE id = $1',
          [supabaseUser.id]
        );
        
        if (profileResult.rows.length > 0) {
          const profile = profileResult.rows[0];
          
          if (profile.is_active) {
            // Get user permissions
            const permResult = await query(
              'SELECT permission FROM user_permissions WHERE user_id = $1 AND granted = true',
              [supabaseUser.id]
            );
            
            req.user = {
              id: supabaseUser.id,
              email: supabaseUser.email || '',
              name: profile.name,
              role: profile.role as 'admin' | 'manager' | 'user',
              permissions: permResult.rows.map(p => p.permission)
            };
          }
        }
      }
    }
    
    next();
  } catch (error) {
    // Silently continue without auth
    next();
  }
};
