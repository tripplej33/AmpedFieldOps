import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../lib/logger';

/**
 * Request ID middleware
 * Generates a unique request ID for each request and attaches it to the request object
 * This ID is included in all logs and error responses for traceability
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Generate or use existing request ID from header (for distributed systems)
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  // Attach to request object
  (req as any).requestId = requestId;
  
  // Add to response header
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

/**
 * Request logging middleware
 * Logs all HTTP requests with relevant context information
 * Excludes health check and other noise endpoints
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();
  const requestId = (req as any).requestId;

  // Skip logging for health checks and other noise
  const skipPaths = ['/api/health', '/health'];
  if (skipPaths.includes(req.path)) {
    return next();
  }

  // Log request start
  log.info('HTTP Request', {
    requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?.id,
  });

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  (res as any).end = function (chunk?: any, encoding?: any, cb?: () => void): Response {
    const duration = Date.now() - startTime;
    
    log.info('HTTP Response', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.id,
    });

    // Call original end and return the result
    return originalEnd(chunk, encoding, cb);
  };

  next();
};
