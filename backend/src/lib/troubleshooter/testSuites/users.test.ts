import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let createdUserId: string | null = null;

  // Test get all users (admin only)
  results.push(
    await runTest(
      'Get all users',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/users', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Get users did not return an array');
        }
      },
      'users-get-all'
    )
  );

  // Test create user
  results.push(
    await runTest(
      'Create user',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/users', {
          method: 'POST',
          body: {
            email: `TEST_user_${Date.now()}@test.com`,
            password: 'TestPassword123!',
            name: 'Test User',
            role: 'user',
          },
          token: context.adminToken,
          expectedStatus: 201,
        });
        if (!response.id) {
          throw new Error('User creation failed - no ID returned');
        }
        createdUserId = response.id;
        context.testData.userIds.push(response.id);
      },
      'users-create'
    )
  );

  // Test get single user
  if (createdUserId) {
    results.push(
      await runTest(
        'Get single user',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/users/${createdUserId}`, {
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (!response.id || response.id !== createdUserId) {
            throw new Error('Get user returned incorrect user');
          }
        },
        'users-get-one'
      )
    );
  }

  // Test update user
  if (createdUserId) {
    results.push(
      await runTest(
        'Update user',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/users/${createdUserId}`, {
            method: 'PUT',
            body: {
              name: 'Updated Test User',
              role: 'manager',
            },
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (response.name !== 'Updated Test User') {
            throw new Error('User update failed - name not updated');
          }
        },
        'users-update'
      )
    );
  }

  // Test delete user
  if (createdUserId) {
    results.push(
      await runTest(
        'Delete user',
        'CRUD',
        async () => {
          await apiRequest(`/api/users/${createdUserId}`, {
            method: 'DELETE',
            token: context.adminToken,
            expectedStatus: 200,
          });
        },
        'users-delete'
      )
    );
  }

  return results;
}

