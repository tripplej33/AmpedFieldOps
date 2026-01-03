import winston from 'winston';
import { env } from '../config/env';

/**
 * Winston logger configuration
 * Provides structured logging with different log levels and transports
 */

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development (more readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
];

// File transports for production
if (env.NODE_ENV === 'production') {
  try {
    // Ensure logs directory exists
    const logsDir = path.resolve(process.cwd(), LOG_CONSTANTS.LOG_DIR);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: path.join(LOG_CONSTANTS.LOG_DIR, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: LOG_CONSTANTS.MAX_FILE_SIZE,
        maxFiles: LOG_CONSTANTS.MAX_FILES,
      })
    );

    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: path.join(LOG_CONSTANTS.LOG_DIR, 'combined.log'),
        format: logFormat,
        maxsize: LOG_CONSTANTS.MAX_FILE_SIZE,
        maxFiles: LOG_CONSTANTS.MAX_FILES,
      })
    );
  } catch (error) {
    // If file transport creation fails (e.g., permission issues), 
    // fall back to console-only logging
    console.warn('Failed to create file transports, using console only:', error);
  }
}

// Create logger instance
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'ampedfieldops-api' },
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// If we're not in production, log to console with simpler format
if (env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

/**
 * Helper functions for common logging patterns
 */
export const log = {
  error: (message: string, error?: Error | any, meta?: any) => {
    if (error instanceof Error) {
      logger.error(message, { error: error.message, stack: error.stack, ...meta });
    } else {
      logger.error(message, { error, ...meta });
    }
  },
  
  warn: (message: string, meta?: any) => {
    logger.warn(message, meta);
  },
  
  info: (message: string, meta?: any) => {
    logger.info(message, meta);
  },
  
  debug: (message: string, meta?: any) => {
    logger.debug(message, meta);
  },
  
  // HTTP request logging
  http: (req: any, res: any, responseTime?: number) => {
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: responseTime ? `${responseTime}ms` : undefined,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  },
  
  // Database query logging (for debugging)
  db: (query: string, params?: any[]) => {
    if (env.NODE_ENV === 'development') {
      logger.debug('Database Query', { query, params });
    }
  },
};

export default logger;
