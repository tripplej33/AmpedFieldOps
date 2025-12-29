import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

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
import dashboardRoutes from './routes/dashboard';
import healthRoutes from './routes/health';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for uploads
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 upload requests per windowMs
  message: 'Too many upload requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Static files for uploads (including project-specific directories)
// Note: In production, you may want to add authentication middleware here
// For now, we allow public access to uploaded files (they're served via Nginx proxy)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health', healthRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

app.listen(env.PORT, async () => {
  console.log(`🚀 AmpedFieldOps API server running on port ${env.PORT}`);
  console.log(`📡 Environment: ${env.NODE_ENV}`);
  console.log(`🌐 Frontend URL: ${env.FRONTEND_URL}`);
  
  // Verify email configuration on startup
  try {
    const { verifyEmailConfig } = await import('./lib/email');
    await verifyEmailConfig();
  } catch (error) {
    // Email verification is optional, don't fail startup
    console.log('📧 Email configuration check skipped');
  }
});

export default app;
