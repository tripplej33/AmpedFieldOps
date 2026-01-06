import { Request, Response, NextFunction } from 'express';
import { AppError, mapDatabaseError, createErrorResponse } from '../lib/errors';
import { env } from '../config/env';
import { log } from '../lib/logger';
import { ValidationError as ExpressValidationError } from 'express-validator';

/**
 * Centralized error handling middleware
 * Handles all errors and returns standardized error responses
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Get request ID if available
  const requestId = (req as any).requestId;

  // Handle express-validator errors
  if (err.name === 'ValidationError' || Array.isArray((err as any).errors)) {
    const validationErrors = (err as any).errors || [];
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: validationErrors,
      requestId,
    });
  }

  // Handle PostgreSQL errors
  if ((err as any).code && (err as any).code.match(/^[0-9A-Z]{5}$/)) {
    const dbError = mapDatabaseError(err);
    log.error('Database error', dbError, {
      requestId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userId: (req as any).user?.id,
    });

    return res.status(dbError.statusCode).json(createErrorResponse(dbError, requestId));
  }

  // Handle AppError instances
  if (err instanceof AppError) {
    // Only log non-operational errors (unexpected errors)
    if (!err.isOperational) {
      log.error('Application error', err, {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: (req as any).user?.id,
        stack: err.stack,
      });
    } else {
      // Log operational errors at warn level (expected errors like validation)
      log.warn('Operational error', {
        requestId,
        method: req.method,
        url: req.url,
        code: err.code,
        message: err.message,
        userId: (req as any).user?.id,
      });
    }

    return res.status(err.statusCode).json(createErrorResponse(err, requestId));
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    log.warn('JWT error', {
      requestId,
      method: req.method,
      url: req.url,
      error: err.name,
      message: err.message,
    });

    return res.status(401).json({
      error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      code: 'UNAUTHORIZED',
      requestId,
    });
  }

  // Handle multer errors (file upload)
  if (err.name === 'MulterError') {
    const multerError = err as any;
    let message = 'File upload error';
    
    if (multerError.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds maximum allowed size';
    } else if (multerError.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded';
    } else if (multerError.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }

    log.warn('File upload error', {
      requestId,
      method: req.method,
      url: req.url,
      code: multerError.code,
      message,
    });

    return res.status(400).json({
      error: message,
      code: 'FILE_UPLOAD_ERROR',
      details: { code: multerError.code },
      requestId,
    });
  }

  // Handle unknown errors
  log.error('Unhandled error', err, {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: (req as any).user?.id,
    stack: err.stack,
  });

  // Return generic error response
  // Never expose internal error details in production
  const errorResponse: any = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
  };

  // Only include error details in development
  if (env.NODE_ENV === 'development') {
    errorResponse.details = {
      message: err.message,
      stack: err.stack,
    };
  }

  return res.status(500).json(errorResponse);
};
