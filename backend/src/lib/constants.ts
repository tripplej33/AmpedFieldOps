/**
 * Application constants
 * Centralized configuration values to avoid magic numbers
 */

// Authentication & Security
export const AUTH_CONSTANTS = {
  JWT_EXPIRATION: '7d', // JWT token expiration
  JWT_PASSWORD_RESET_EXPIRATION: '1h', // Password reset token expiration
  BCRYPT_ROUNDS: 12, // Password hashing rounds
  MIN_PASSWORD_LENGTH: 8, // Minimum password length
  MIN_JWT_SECRET_LENGTH: 32, // Minimum JWT secret length
} as const;

// Rate Limiting
export const RATE_LIMIT_CONSTANTS = {
  AUTH_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  AUTH_MAX_REQUESTS: 5, // Max auth requests per window
  PASSWORD_RESET_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  PASSWORD_RESET_MAX_REQUESTS: 3, // Max password reset requests per hour
  UPLOAD_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  UPLOAD_MAX_REQUESTS: 50, // Max upload requests per window
  GLOBAL_API_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  GLOBAL_API_MAX_REQUESTS: 1000, // Max API requests per window (increased for normal app usage)
} as const;

// Pagination
export const PAGINATION_CONSTANTS = {
  DEFAULT_LIMIT: 20, // Default items per page
  MAX_LIMIT: 100, // Maximum items per page
  KANBAN_LIMIT: 100, // Limit for Kanban boards (load more items)
  TIMESHEETS_DEFAULT_LIMIT: 50, // Default limit for timesheets
} as const;

// File Upload
export const FILE_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB max file size
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  UPLOAD_DIR: 'uploads', // Upload directory
} as const;

// Logging
export const LOG_CONSTANTS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB max log file size
  MAX_FILES: 5, // Maximum number of log files to keep
  LOG_DIR: 'logs', // Log directory
} as const;

// Database
export const DB_CONSTANTS = {
  CONNECTION_POOL_MIN: 2, // Minimum connections in pool
  CONNECTION_POOL_MAX: 10, // Maximum connections in pool
  QUERY_TIMEOUT: 30000, // 30 seconds query timeout
} as const;

// Activity Logs
export const ACTIVITY_LOG_CONSTANTS = {
  MAX_RECENT_SEARCHES: 10, // Maximum recent searches to store
  MAX_ERROR_LOGS: 200, // Maximum error logs in frontend
  MAX_NOTIFICATIONS: 50, // Maximum notifications in frontend
} as const;

// Project Code Generation
export const PROJECT_CODE_CONSTANTS = {
  PREFIX: 'PRJ', // Project code prefix
  YEAR_FORMAT: 'YYYY', // Year format in project code
  PADDING_LENGTH: 3, // Number padding length
} as const;

// Backup
export const BACKUP_CONSTANTS = {
  DEFAULT_RETENTION_DAYS: 30, // Default backup retention period
  MAX_BACKUP_SIZE: 500 * 1024 * 1024, // 500MB max backup size
} as const;
