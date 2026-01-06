import { Request, Response, NextFunction } from 'express';

/**
 * Input sanitization middleware
 * Removes potentially dangerous characters and HTML/script tags from user input
 * 
 * Note: This is a basic sanitization. For production, consider using a library like DOMPurify
 * or validator.js for more comprehensive sanitization.
 */

/**
 * Sanitizes a string by removing HTML tags and dangerous characters
 */
function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Remove script tags and their content (more aggressive)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: and data: protocols
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Recursively sanitizes an object's string values
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Skip sanitization for certain fields that may legitimately contain HTML
        // or special characters (like file paths, URLs, etc.)
        const skipSanitization = [
          'password',
          'password_hash',
          'token',
          'access_token',
          'refresh_token',
          'file_path',
          'url',
          'image_url',
          'redirect_uri',
          'details', // JSON fields that may contain structured data
        ];

        if (skipSanitization.includes(key.toLowerCase())) {
          sanitized[key] = obj[key];
        } else {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Middleware to sanitize request body, query, and params
 * 
 * Note: This middleware should be used carefully as it modifies the request object.
 * Consider using it selectively on routes that accept user-generated content.
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize route parameters (be careful with UUIDs and IDs)
  if (req.params && typeof req.params === 'object') {
    // Only sanitize string params, preserve IDs as-is
    const sanitizedParams: any = {};
    for (const key in req.params) {
      if (Object.prototype.hasOwnProperty.call(req.params, key)) {
        const value = req.params[key];
        // Don't sanitize IDs (UUIDs, numeric IDs)
        if (key.toLowerCase().includes('id') || /^[0-9a-f-]{36}$/i.test(value)) {
          sanitizedParams[key] = value;
        } else {
          sanitizedParams[key] = sanitizeString(value);
        }
      }
    }
    req.params = sanitizedParams;
  }

  next();
};

/**
 * Selective sanitization - only sanitize specific fields
 * Use this when you want to preserve most data but sanitize specific fields
 */
export const sanitizeFields = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        if (req.body[field] && typeof req.body[field] === 'string') {
          req.body[field] = sanitizeString(req.body[field]);
        }
      }
    }
    next();
  };
};
