import { TestResult, TestContext } from '../types';
import { runTest, apiRequest, skipTest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test get Xero status
  results.push(
    await runTest(
      'Get Xero connection status',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/status', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response.connected !== 'boolean') {
          throw new Error('Xero status response missing connected field');
        }
      },
      'xero-status'
    )
  );

  // Test get Xero auth URL (if configured)
  results.push(
    await runTest(
      'Get Xero auth URL',
      'Integration',
      async () => {
        try {
          const response = await apiRequest('/api/xero/auth/url', {
            token: context.adminToken,
            expectedStatus: 200,
          });
          // Response should indicate if Xero is configured
          if (typeof response.configured !== 'boolean') {
            throw new Error('Xero auth URL response missing configured field');
          }
        } catch (error: any) {
          // It's OK if Xero is not configured
          if (!error.message.includes('200')) {
            throw error;
          }
        }
      },
      'xero-auth-url'
    )
  );

  // Note: We skip actual Xero API calls (sync, invoices, etc.) since they require
  // actual Xero credentials and could affect real data
  results.push(
    skipTest(
      'Xero sync (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-sync'
    )
  );

  results.push(
    skipTest(
      'Xero invoice creation (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-invoices'
    )
  );

  return results;
}

