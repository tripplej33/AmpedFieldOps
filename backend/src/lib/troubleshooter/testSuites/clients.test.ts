import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let createdClientId: string | null = null;

  // Test create client
  results.push(
    await runTest(
      'Create client',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/clients', {
          method: 'POST',
          body: {
            name: `TEST_Client ${Date.now()}`,
            contact_name: 'Test Contact',
            email: 'test@example.com',
            phone: '1234567890',
          },
          token: context.adminToken,
          expectedStatus: 201,
        });
        if (!response.id) {
          throw new Error('Client creation failed - no ID returned');
        }
        createdClientId = response.id;
        context.testData.clientIds.push(response.id);
      },
      'clients-create'
    )
  );

  // Test get all clients
  results.push(
    await runTest(
      'Get all clients',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/clients', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Get clients did not return an array');
        }
      },
      'clients-get-all'
    )
  );

  // Test get single client
  if (createdClientId) {
    results.push(
      await runTest(
        'Get single client',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/clients/${createdClientId}`, {
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (!response.id || response.id !== createdClientId) {
            throw new Error('Get client returned incorrect client');
          }
        },
        'clients-get-one'
      )
    );
  }

  // Test update client
  if (createdClientId) {
    results.push(
      await runTest(
        'Update client',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/clients/${createdClientId}`, {
            method: 'PUT',
            body: {
              name: `TEST_Updated Client ${Date.now()}`,
              phone: '9876543210',
            },
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (response.phone !== '9876543210') {
            throw new Error('Client update failed - phone not updated');
          }
        },
        'clients-update'
      )
    );
  }

  // Test delete client (only if created)
  if (createdClientId) {
    results.push(
      await runTest(
        'Delete client',
        'CRUD',
        async () => {
          await apiRequest(`/api/clients/${createdClientId}`, {
            method: 'DELETE',
            token: context.adminToken,
            expectedStatus: 200,
          });
          // Verify deletion
          try {
            await apiRequest(`/api/clients/${createdClientId}`, {
              token: context.adminToken,
              expectedStatus: 404,
            });
          } catch (error: any) {
            if (!error.message.includes('404')) {
              throw new Error('Client was not deleted');
            }
          }
        },
        'clients-delete'
      )
    );
  }

  return results;
}

