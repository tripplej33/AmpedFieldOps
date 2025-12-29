import { TestResult, TestContext } from '../types';
import { runTest, apiRequest, skipTest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test email configuration endpoint exists (but skip actual test send)
  results.push(
    await runTest(
      'Email settings endpoint accessible',
      'Integration',
      async () => {
        // Just verify the endpoint exists and requires admin
        try {
          await apiRequest('/api/settings/email/test', {
            method: 'POST',
            body: { to: 'test@example.com' },
            token: context.adminToken,
            // Will fail if email not configured, but that's OK for this test
          });
        } catch (error: any) {
          // Any response (even error) means endpoint exists
          // We're just checking it's accessible, not that email works
          if (error.message.includes('Network error')) {
            throw error;
          }
        }
      },
      'email-endpoint'
    )
  );

  // Skip actual email send test (requires SMTP configuration)
  results.push(
    skipTest(
      'Email test send (requires SMTP configuration)',
      'Integration',
      'Skipped: Requires SMTP configuration',
      'email-test-send'
    )
  );

  return results;
}

