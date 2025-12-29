import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test dashboard metrics endpoint
  results.push(
    await runTest(
      'Get dashboard metrics',
      'Business Logic',
      async () => {
        const response = await apiRequest('/api/dashboard/metrics', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response.totalProjects !== 'number') {
          throw new Error('Dashboard metrics missing required fields');
        }
      },
      'dashboard-metrics'
    )
  );

  // Test recent timesheets endpoint
  results.push(
    await runTest(
      'Get recent timesheets',
      'Business Logic',
      async () => {
        const response = await apiRequest('/api/dashboard/recent-timesheets', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Recent timesheets did not return an array');
        }
      },
      'dashboard-recent-timesheets'
    )
  );

  // Test active projects endpoint
  results.push(
    await runTest(
      'Get active projects',
      'Business Logic',
      async () => {
        const response = await apiRequest('/api/dashboard/active-projects', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Active projects did not return an array');
        }
      },
      'dashboard-active-projects'
    )
  );

  // Test quick stats endpoint
  results.push(
    await runTest(
      'Get quick stats',
      'Business Logic',
      async () => {
        const response = await apiRequest('/api/dashboard/quick-stats', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response.budgetUtilization !== 'number') {
          throw new Error('Quick stats missing required fields');
        }
      },
      'dashboard-quick-stats'
    )
  );

  return results;
}

