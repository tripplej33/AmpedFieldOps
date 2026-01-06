import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { createDynamicCorsOrigin, initializeCorsCache } from './config/cors';
import { logger, log } from './lib/logger';
import { RATE_LIMIT_CONSTANTS } from './lib/constants';
import { requestIdMiddleware, requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import clientsRoutes from './routes/clients';
import projectsRoutes from './routes/projects';
import timesheetsRoutes from './routes/timesheets';
import costCentersRoutes from './routes/costCenters';
import activityTypesRoutes from './routes/activityTypes';
import searchRoutes from './routes/search';
import setupRoutes from './routes/setup';
import xeroRoutes from './routes/xero';
import settingsRoutes from './routes/settings';
import permissionsRoutes from './routes/permissions';
import rolePermissionsRoutes from './routes/role-permissions';
import dashboardRoutes from './routes/dashboard';
import healthRoutes from './routes/health';
import troubleshooterRoutes from './routes/troubleshooter';
import filesRoutes from './routes/files';
import safetyDocumentsRoutes from './routes/safetyDocuments';
import backupsRoutes from './routes/backups';
import documentScanRoutes from './routes/documentScan';

const app = express();

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Security headers with enhanced configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"], // Allow data URIs and external images
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API server
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: createDynamicCorsOrigin(),
  credentials: true
}));

// Request size limits to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging middleware
app.use(requestLogger);

// Global API rate limiting - applies to all API endpoints
// More lenient than auth endpoints to allow normal usage
// Note: React apps make multiple simultaneous requests on page load
const globalApiRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONSTANTS.GLOBAL_API_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.GLOBAL_API_MAX_REQUESTS,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests to be more lenient
  skip: (req) => {
    // Skip rate limiting for health check endpoint
    return req.path === '/api/health';
  },
  // Use IP-based rate limiting only
  // Note: We removed unsafe JWT parsing here for security
  // If user-specific rate limiting is needed, it should be done after authentication
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

// Rate limiting for uploads
const uploadRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONSTANTS.UPLOAD_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.UPLOAD_MAX_REQUESTS,
  message: 'Too many upload requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Static files for uploads (including project-specific directories)
// Note: In production, you may want to add authentication middleware here
// For now, we allow public access to uploaded files (they're served via Nginx proxy)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Apply global rate limiting to all API routes
app.use('/api', globalApiRateLimit);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/timesheets', timesheetsRoutes);
app.use('/api/cost-centers', costCentersRoutes);
app.use('/api/activity-types', activityTypesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/xero', xeroRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/role-permissions', rolePermissionsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/troubleshooter', troubleshooterRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/safety-documents', safetyDocumentsRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/document-scan', documentScanRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(env.PORT, async () => {
  logger.info('🚀 AmpedFieldOps API server starting', {
    port: env.PORT,
    environment: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
  });
  
  // Initialize CORS cache (extracts frontend URL from Xero redirect URI)
  try {
    await initializeCorsCache();
    logger.info('🔒 CORS configuration initialized');
  } catch (error) {
    log.error('❌ Failed to initialize CORS cache', error);
    // Don't fail startup - CORS will use fallback values
  }
  
  // Verify email configuration on startup
  try {
    const { verifyEmailConfig } = await import('./lib/email');
    await verifyEmailConfig();
  } catch (error) {
    // Email verification is optional, don't fail startup
    logger.debug('📧 Email configuration check skipped');
  }

  // Start backup scheduler
  try {
    const { startBackupScheduler } = await import('./jobs/backupScheduler');
    startBackupScheduler();
    logger.info('💾 Backup scheduler initialized');
  } catch (error) {
    log.error('❌ Failed to start backup scheduler', error);
  }

  // Initialize Xero sync queue worker
  try {
    const { xeroSyncWorker } = await import('./lib/queue');
    logger.info('🔄 Xero sync queue worker initialized');
  } catch (error) {
    log.error('❌ Failed to initialize Xero sync queue worker', error);
    // Don't fail startup if Redis is not available - queue will retry
  }
});

export default app;
