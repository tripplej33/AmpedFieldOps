/**
 * Frontend Logger Utility
 * Provides structured logging for React components with environment awareness
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Log informational message
   */
  info(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context || '');
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext) {
    console.warn(`[WARN] ${message}`, context || '');
    // TODO: Send to error tracking service (Sentry, etc.)
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext) {
    console.error(`[ERROR] ${message}`, error, context || '');
    // TODO: Send to error tracking service (Sentry, etc.)
    
    // Log additional error details in development
    if (this.isDevelopment && error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }

  /**
   * Log API error with standardized format
   */
  apiError(message: string, error: any, context?: LogContext) {
    const errorDetails = {
      message: error?.message || 'Unknown error',
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      ...context,
    };

    this.error(message, error, errorDetails);
  }

  /**
   * Log component lifecycle event (development only)
   */
  lifecycle(component: string, event: 'mount' | 'unmount' | 'update', context?: LogContext) {
    if (this.isDevelopment) {
      this.debug(`Component ${event}`, { component, ...context });
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Convenience exports
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, error?: Error | unknown, context?: LogContext) => 
    logger.error(message, error, context),
  apiError: (message: string, error: any, context?: LogContext) => 
    logger.apiError(message, error, context),
};
