import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';
import { createTestClient } from '../testData';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let clientId: string | null = null;
  let createdProjectId: string | null = null;

  // Create a test client first
  try {
    clientId = await createTestClient(`TEST_Project Client ${Date.now()}`);
    context.testData.clientIds.push(clientId);
  } catch (error: any) {
    results.push({
      id: 'projects-setup',
      name: 'Setup test client for projects',
      category: 'CRUD',
      status: 'failed',
      duration: 0,
      message: `Failed to create test client: ${error.message}`,
      error: { message: error.message },
      timestamp: new Date().toISOString(),
    });
    return results;
  }

  // Test create project
  results.push(
    await runTest(
      'Create project',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/projects', {
          method: 'POST',
          body: {
            name: `TEST_Project ${Date.now()}`,
            client_id: clientId,
            status: 'in-progress',
            budget: 10000,
          },
          token: context.adminToken,
          expectedStatus: 201,
        });
        if (!response.id) {
          throw new Error('Project creation failed - no ID returned');
        }
        createdProjectId = response.id;
        context.testData.projectIds.push(response.id);
      },
      'projects-create'
    )
  );

  // Test get all projects
  results.push(
    await runTest(
      'Get all projects',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/projects', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Get projects did not return an array');
        }
      },
      'projects-get-all'
    )
  );

  // Test get single project
  if (createdProjectId) {
    results.push(
      await runTest(
        'Get single project',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/projects/${createdProjectId}`, {
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (!response.id || response.id !== createdProjectId) {
            throw new Error('Get project returned incorrect project');
          }
        },
        'projects-get-one'
      )
    );
  }

  // Test update project
  if (createdProjectId) {
    results.push(
      await runTest(
        'Update project',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/projects/${createdProjectId}`, {
            method: 'PUT',
            body: {
              status: 'completed',
              budget: 15000,
            },
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (response.status !== 'completed') {
            throw new Error('Project update failed - status not updated');
          }
        },
        'projects-update'
      )
    );
  }

  // Test delete project
  if (createdProjectId) {
    results.push(
      await runTest(
        'Delete project',
        'CRUD',
        async () => {
          await apiRequest(`/api/projects/${createdProjectId}`, {
            method: 'DELETE',
            token: context.adminToken,
            expectedStatus: 200,
          });
        },
        'projects-delete'
      )
    );
  }

  return results;
}

