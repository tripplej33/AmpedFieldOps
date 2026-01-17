import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { env } from '../config/env';
import { supabase, verifySupabaseToken, loadUserWithPermissions } from '../db/supabase';

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
    
    // Prefer Supabase JWT verification when configured
    if (supabase && env.SUPABASE_URL) {
      const tokenInfo = await verifySupabaseToken(token);
      if (!tokenInfo) {
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }

      const userId = tokenInfo.userId;
      const email = tokenInfo.email || '';

      // Load app-specific role and permissions from our public schema
      const userProfile = await loadUserWithPermissions(userId);

      if (!userProfile) {
        return res.status(403).json({ error: 'Profile not found' });
      }

      req.user = {
        id: userId,
        email,
        name: userProfile.name,
        role: userProfile.role as 'admin' | 'manager' | 'user',
        permissions: userProfile.permissions || []
      };

      return next();
    }

    // Fallback to legacy JWT verification
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      name: string;
      role: string;
    };

    const permResult = await query(
      'SELECT permission FROM user_permissions WHERE user_id = $1 AND granted = true',
      [decoded.id]
    );

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role as 'admin' | 'manager' | 'user',
      permissions: permResult.rows.map(p => p.permission)
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
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
      
      // Try Supabase JWT first
      if (supabase && env.SUPABASE_URL) {
        const tokenInfo = await verifySupabaseToken(token);
        if (tokenInfo) {
          const userProfile = await loadUserWithPermissions(tokenInfo.userId);
          if (userProfile) {
            req.user = {
              id: tokenInfo.userId,
              email: tokenInfo.email || '',
              name: userProfile.name,
              role: userProfile.role as 'admin' | 'manager' | 'user',
              permissions: userProfile.permissions || []
            };
            return next();
          }
        }
      }

      // Fallback to legacy JWT
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        id: string;
        email: string;
        name: string;
        role: string;
      };
      
      const permResult = await query(
        'SELECT permission FROM user_permissions WHERE user_id = $1 AND granted = true',
        [decoded.id]
      );
      
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role as 'admin' | 'manager' | 'user',
        permissions: permResult.rows.map(p => p.permission)
      };
    }
    
    next();
  } catch (error) {
    // Silently continue without auth
    next();
  }
};
