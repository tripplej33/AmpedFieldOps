/**
 * Custom error classes for structured error handling
 * Provides consistent error responses and error categorization
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, { resource, identifier });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', true, details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: any) {
    super(message, 500, 'DATABASE_ERROR', false, {
      originalError: originalError?.message,
      code: originalError?.code,
    });
  }
}

export class FileError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'FILE_ERROR', true, details);
  }
}

/**
 * Maps PostgreSQL error codes to user-friendly messages
 */
export function mapDatabaseError(error: any): AppError {
  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  const code = error.code;
  const message = error.message || 'Database error occurred';

  switch (code) {
    case '23505': // unique_violation
      return new ConflictError('A record with this value already exists', {
        constraint: error.constraint,
        detail: error.detail,
      });

    case '23503': // foreign_key_violation
      return new ValidationError('Referenced record does not exist', {
        constraint: error.constraint,
        detail: error.detail,
      });

    case '23502': // not_null_violation
      return new ValidationError('Required field is missing', {
        column: error.column,
      });

    case '23514': // check_violation
      return new ValidationError('Data validation failed', {
        constraint: error.constraint,
      });

    case '42P01': // undefined_table
      return new DatabaseError('Database table does not exist. Please run migrations.', error);

    case '42703': // undefined_column
      return new DatabaseError('Database column does not exist', error);

    case '08003': // connection_does_not_exist
    case '08006': // connection_failure
      return new DatabaseError('Database connection failed', error);

    case '53300': // too_many_connections
      return new DatabaseError('Database connection limit exceeded', error);

    default:
      return new DatabaseError('Database operation failed', error);
  }
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
  requestId?: string;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: Error | AppError,
  requestId?: string
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      details: error.details,
      requestId,
    };
  }

  // For non-AppError instances, return generic error
  return {
    error: error.message || 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    requestId,
  };
}
