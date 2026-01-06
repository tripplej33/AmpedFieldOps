import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { ValidationError, ForbiddenError } from '../lib/errors';
import { AuthRequest } from './auth';

/**
 * Validates UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitizes project_id to prevent path traversal
 * Ensures project_id is a valid UUID and doesn't contain path traversal sequences
 */
export function sanitizeProjectId(projectId: string): string {
  if (!projectId || typeof projectId !== 'string') {
    throw new ValidationError('Invalid project_id');
  }

  // Remove any path traversal attempts
  const sanitized = projectId.replace(/\.\./g, '').replace(/\//g, '').replace(/\\/g, '');

  // Validate UUID format
  if (!isValidUUID(sanitized)) {
    throw new ValidationError('project_id must be a valid UUID');
  }

  return sanitized;
}

/**
 * Middleware to validate project_id and verify user has access
 * Must be used after authentication middleware
 */
export const validateProjectAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const projectId = req.body?.project_id || req.params?.project_id;

    if (!projectId) {
      return next(new ValidationError('project_id is required'));
    }

    // Sanitize and validate UUID format
    const sanitizedProjectId = sanitizeProjectId(projectId);

    // Verify project exists
    const projectResult = await query(
      'SELECT id, client_id FROM projects WHERE id = $1',
      [sanitizedProjectId]
    );

    if (projectResult.rows.length === 0) {
      return next(new ValidationError('Project not found'));
    }

    const project = projectResult.rows[0];

    // Check if user has access to the project
    // Admins and managers can access all projects
    // Regular users can only access projects they're assigned to (via timesheets)
    if (req.user!.role === 'admin' || req.user!.role === 'manager') {
      // Update request with sanitized project_id
      if (req.body) req.body.project_id = sanitizedProjectId;
      if (req.params) req.params.project_id = sanitizedProjectId;
      return next();
    }

    // For regular users, check if they have any timesheets for this project
    // This is a simple access check - you may want to implement a more sophisticated
    // permission system with explicit project assignments
    const accessResult = await query(
      'SELECT 1 FROM timesheets WHERE project_id = $1 AND user_id = $2 LIMIT 1',
      [sanitizedProjectId, req.user!.id]
    );

    if (accessResult.rows.length === 0) {
      return next(new ForbiddenError('You do not have access to this project'));
    }

    // Update request with sanitized project_id
    if (req.body) req.body.project_id = sanitizedProjectId;
    if (req.params) req.params.project_id = sanitizedProjectId;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to validate project_id format only (no access check)
 * Use this when you need to validate format but access is checked elsewhere
 */
export const validateProjectId = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const projectId = req.body?.project_id || req.params?.project_id;

    if (!projectId) {
      return next(new ValidationError('project_id is required'));
    }

    const sanitized = sanitizeProjectId(projectId);

    // Update request with sanitized project_id
    if (req.body) req.body.project_id = sanitized;
    if (req.params) req.params.project_id = sanitized;

    next();
  } catch (error) {
    next(error);
  }
};
