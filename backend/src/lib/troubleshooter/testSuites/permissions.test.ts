import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test that admin can access protected routes
  results.push(
    await runTest(
      'Admin can access protected routes',
      'Security',
      async () => {
        await apiRequest('/api/users', {
          token: context.adminToken,
          expectedStatus: 200,
        });
      },
      'permissions-admin-access'
    )
  );

  // Test that manager cannot access admin-only routes
  results.push(
    await runTest(
      'Manager cannot access admin-only routes',
      'Security',
      async () => {
        try {
          await apiRequest('/api/users', {
            token: context.managerToken,
            expectedStatus: 403,
          });
        } catch (error: any) {
          if (!error.message.includes('403')) {
            throw error;
          }
        }
      },
      'permissions-manager-restricted'
    )
  );

  // Test that regular user cannot access protected routes
  results.push(
    await runTest(
      'Regular user cannot access protected routes',
      'Security',
      async () => {
        try {
          await apiRequest('/api/users', {
            token: context.userToken,
            expectedStatus: 403,
          });
        } catch (error: any) {
          if (!error.message.includes('403')) {
            throw error;
          }
        }
      },
      'permissions-user-restricted'
    )
  );

  // Test permission-based access control
  results.push(
    await runTest(
      'Permission-based access control works',
      'Security',
      async () => {
        // Test that admin can manage clients (has can_manage_clients permission)
        await apiRequest('/api/clients', {
          method: 'POST',
          body: {
            name: `TEST_Permission Test ${Date.now()}`,
          },
          token: context.adminToken,
          expectedStatus: 201,
        });
      },
      'permissions-permission-check'
    )
  );

  return results;
}

