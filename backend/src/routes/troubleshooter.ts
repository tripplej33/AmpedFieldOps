import { Router, Response } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { TestRunner } from '../lib/troubleshooter/testRunner';
import { scanRoutes } from '../lib/troubleshooter/routeScanner';
import { log } from '../lib/logger';

const router = Router();

// Import test suites
import * as authTests from '../lib/troubleshooter/testSuites/auth.test';
import * as clientsTests from '../lib/troubleshooter/testSuites/clients.test';
import * as projectsTests from '../lib/troubleshooter/testSuites/projects.test';
import * as timesheetsTests from '../lib/troubleshooter/testSuites/timesheets.test';
import * as usersTests from '../lib/troubleshooter/testSuites/users.test';
import * as permissionsTests from '../lib/troubleshooter/testSuites/permissions.test';
import * as settingsTests from '../lib/troubleshooter/testSuites/settings.test';
import * as xeroTests from '../lib/troubleshooter/testSuites/xero.test';
import * as emailTests from '../lib/troubleshooter/testSuites/email.test';
import * as dashboardTests from '../lib/troubleshooter/testSuites/dashboard.test';
import * as healthTests from '../lib/troubleshooter/testSuites/health.test';

// Create test runner instance
function createTestRunner(): TestRunner {
  const runner = new TestRunner();

  // Register all test suites
  runner.registerSuite({
    name: 'Authentication',
    category: 'Auth',
    runTests: authTests.runTests,
  });

  runner.registerSuite({
    name: 'Clients',
    category: 'CRUD',
    runTests: clientsTests.runTests,
  });

  runner.registerSuite({
    name: 'Projects',
    category: 'CRUD',
    runTests: projectsTests.runTests,
  });

  runner.registerSuite({
    name: 'Timesheets',
    category: 'CRUD',
    runTests: timesheetsTests.runTests,
  });

  runner.registerSuite({
    name: 'Users',
    category: 'CRUD',
    runTests: usersTests.runTests,
  });

  runner.registerSuite({
    name: 'Permissions',
    category: 'Security',
    runTests: permissionsTests.runTests,
  });

  runner.registerSuite({
    name: 'Settings',
    category: 'Configuration',
    runTests: settingsTests.runTests,
  });

  runner.registerSuite({
    name: 'Xero',
    category: 'Integration',
    runTests: xeroTests.runTests,
  });

  runner.registerSuite({
    name: 'Email',
    category: 'Integration',
    runTests: emailTests.runTests,
  });

  runner.registerSuite({
    name: 'Dashboard',
    category: 'Business Logic',
    runTests: dashboardTests.runTests,
  });

  runner.registerSuite({
    name: 'Health',
    category: 'System',
    runTests: healthTests.runTests,
  });

  return runner;
}

// Run all tests (Admin only)
router.post('/run', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.body;
    const runner = createTestRunner();

    const result = category
      ? await runner.runCategory(category)
      : await runner.runAll();

    res.json(result);
  } catch (error: any) {
    log.error('Troubleshooter error', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run troubleshooter',
    });
  }
});

// Get discovered routes (Admin only)
router.get('/routes', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const routes = await scanRoutes();
    res.json(routes);
  } catch (error: any) {
    log.error('Route scan error', error);
    res.status(500).json({ error: 'Failed to scan routes' });
  }
});

// Get test suites info (Admin only)
router.get('/suites', authenticate, requirePermission('can_manage_users'), async (req: AuthRequest, res: Response) => {
  try {
    const runner = createTestRunner();
    const suites = runner.getTestSuites();
    res.json(suites);
  } catch (error: any) {
    log.error('Get suites error', error);
    res.status(500).json({ error: 'Failed to get test suites' });
  }
});

export default router;

