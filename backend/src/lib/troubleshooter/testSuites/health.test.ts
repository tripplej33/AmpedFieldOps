import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test health endpoint
  results.push(
    await runTest(
      'Health check endpoint accessible',
      'System',
      async () => {
        const response = await apiRequest('/api/health', { expectedStatus: 200 });
        if (!response.status || response.status !== 'healthy') {
          throw new Error('Health check returned unhealthy status');
        }
      },
      'health-check'
    )
  );

  // Test database connection via health endpoint
  results.push(
    await runTest(
      'Database connection via health endpoint',
      'System',
      async () => {
        const response = await apiRequest('/api/health', { expectedStatus: 200 });
        if (!response.database || !response.database.healthy) {
          throw new Error('Database health check failed');
        }
      },
      'health-database'
    )
  );

  return results;
}

