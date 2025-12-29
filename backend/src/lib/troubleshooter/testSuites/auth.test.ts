import { TestResult, TestContext } from '../types';
import { runTest, apiRequest, skipTest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test login with invalid credentials
  results.push(
    await runTest(
      'Login with invalid credentials fails',
      'Auth',
      async () => {
        try {
          await apiRequest('/api/auth/login', {
            method: 'POST',
            body: { email: 'invalid@test.com', password: 'wrongpassword' },
            expectedStatus: 401,
          });
        } catch (error: any) {
          if (!error.message.includes('401')) {
            throw error;
          }
        }
      },
      'auth-login-invalid'
    )
  );

  // Test login with valid test credentials (using context tokens means users exist)
  results.push(
    await runTest(
      'Login with valid credentials succeeds',
      'Auth',
      async () => {
        // Use test user credentials (created in testData.ts, email is normalized to lowercase)
        const response = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: { email: 'test_admin@test.com', password: 'TestPassword123!' },
          expectedStatus: 200,
        });
        if (!response.token || !response.user) {
          throw new Error('Login response missing token or user');
        }
      },
      'auth-login-valid'
    )
  );

  // Test get current user with valid token
  results.push(
    await runTest(
      'Get current user with valid token',
      'Auth',
      async () => {
        const response = await apiRequest('/api/auth/me', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!response.id || !response.email) {
          throw new Error('User response missing required fields');
        }
      },
      'auth-me-valid'
    )
  );

  // Test get current user with invalid token
  results.push(
    await runTest(
      'Get current user with invalid token fails',
      'Auth',
      async () => {
        try {
          await apiRequest('/api/auth/me', {
            token: 'invalid-token',
            expectedStatus: 401,
          });
        } catch (error: any) {
          if (!error.message.includes('401')) {
            throw error;
          }
        }
      },
      'auth-me-invalid'
    )
  );

  // Test protected route access
  results.push(
    await runTest(
      'Protected route requires authentication',
      'Auth',
      async () => {
        try {
          await apiRequest('/api/clients', {
            expectedStatus: 401,
          });
        } catch (error: any) {
          if (!error.message.includes('401')) {
            throw error;
          }
        }
      },
      'auth-protected-route'
    )
  );

  return results;
}

