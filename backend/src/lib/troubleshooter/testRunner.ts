import { TestResult, TestSuite, TroubleshooterRunResult, TestContext } from './types';
import { createTestUsers, cleanupTestData, TestUser } from './testData';

interface TestSuiteModule {
  name: string;
  category: string;
  runTests: (context: TestContext) => Promise<TestResult[]>;
}

export class TestRunner {
  private testSuites: TestSuiteModule[] = [];
  private testContext: TestContext | null = null;

  /**
   * Register a test suite
   */
  registerSuite(suite: TestSuiteModule) {
    this.testSuites.push(suite);
  }

  /**
   * Initialize test context (create test users, etc.)
   */
  async initializeContext(): Promise<TestContext> {
    // Clean up any existing test data
    await cleanupTestData();

    // Create test users
    const testUsers = await createTestUsers();

    const context: TestContext = {
      adminToken: testUsers.find(u => u.role === 'admin')!.token,
      managerToken: testUsers.find(u => u.role === 'manager')!.token,
      userToken: testUsers.find(u => u.role === 'user')!.token,
      testData: {
        userIds: testUsers.map(u => u.id),
        clientIds: [],
        projectIds: [],
        timesheetIds: [],
        activityTypeIds: [],
        costCenterIds: [],
      },
    };

    this.testContext = context;
    return context;
  }

  /**
   * Clean up test context
   */
  async cleanupContext(): Promise<void> {
    await cleanupTestData();
    this.testContext = null;
  }

  /**
   * Run all registered test suites
   */
  async runAll(): Promise<TroubleshooterRunResult> {
    const startTime = Date.now();
    const allResults: TestResult[] = [];

    try {
      // Initialize context
      const context = await this.initializeContext();

      // Run each test suite
      for (const suite of this.testSuites) {
        try {
          const suiteResults = await suite.runTests(context);
          allResults.push(...suiteResults);
        } catch (error: any) {
          // If a suite fails to run, add an error result
          allResults.push({
            id: `suite-error-${suite.name}`,
            name: `Suite Error: ${suite.name}`,
            category: suite.category,
            status: 'failed',
            duration: 0,
            message: `Failed to run test suite: ${error.message}`,
            error: {
              message: error.message,
              stack: error.stack,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Cleanup
      await this.cleanupContext();
    } catch (error: any) {
      // If initialization fails, return error result
      allResults.push({
        id: 'initialization-error',
        name: 'Test Initialization',
        category: 'System',
        status: 'failed',
        duration: 0,
        message: `Failed to initialize tests: ${error.message}`,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;
    const passed = allResults.filter(r => r.status === 'passed').length;
    const failed = allResults.filter(r => r.status === 'failed').length;
    const skipped = allResults.filter(r => r.status === 'skipped').length;

    return {
      success: failed === 0,
      totalTests: allResults.length,
      passed,
      failed,
      skipped,
      duration,
      results: allResults,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run tests for a specific category
   */
  async runCategory(category: string): Promise<TroubleshooterRunResult> {
    const startTime = Date.now();
    const allResults: TestResult[] = [];

    try {
      const context = await this.initializeContext();

      const suites = this.testSuites.filter(s => s.category === category);
      for (const suite of suites) {
        try {
          const suiteResults = await suite.runTests(context);
          allResults.push(...suiteResults);
        } catch (error: any) {
          allResults.push({
            id: `suite-error-${suite.name}`,
            name: `Suite Error: ${suite.name}`,
            category: suite.category,
            status: 'failed',
            duration: 0,
            message: `Failed to run test suite: ${error.message}`,
            error: {
              message: error.message,
              stack: error.stack,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }

      await this.cleanupContext();
    } catch (error: any) {
      allResults.push({
        id: 'initialization-error',
        name: 'Test Initialization',
        category: 'System',
        status: 'failed',
        duration: 0,
        message: `Failed to initialize tests: ${error.message}`,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;
    const passed = allResults.filter(r => r.status === 'passed').length;
    const failed = allResults.filter(r => r.status === 'failed').length;
    const skipped = allResults.filter(r => r.status === 'skipped').length;

    return {
      success: failed === 0,
      totalTests: allResults.length,
      passed,
      failed,
      skipped,
      duration,
      results: allResults,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get list of registered test suites
   */
  getTestSuites(): Array<{ name: string; category: string }> {
    return this.testSuites.map(s => ({ name: s.name, category: s.category }));
  }
}

