import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';
import { createTestClient, createTestProject, createTestActivityType, createTestCostCenter } from '../testData';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let clientId: string | null = null;
  let projectId: string | null = null;
  let activityTypeId: string | null = null;
  let costCenterId: string | null = null;
  let createdTimesheetId: string | null = null;

  // Setup test data
  try {
    clientId = await createTestClient(`TEST_Timesheet Client ${Date.now()}`);
    context.testData.clientIds.push(clientId);
    projectId = await createTestProject(clientId, `TEST_Timesheet Project ${Date.now()}`);
    context.testData.projectIds.push(projectId);
    activityTypeId = await createTestActivityType(`TEST_Timesheet Activity ${Date.now()}`);
    context.testData.activityTypeIds.push(activityTypeId);
    costCenterId = await createTestCostCenter(`TEST_TCC${Date.now()}`, `TEST_Timesheet Cost Center ${Date.now()}`);
    context.testData.costCenterIds.push(costCenterId);
  } catch (error: any) {
    results.push({
      id: 'timesheets-setup',
      name: 'Setup test data for timesheets',
      category: 'CRUD',
      status: 'failed',
      duration: 0,
      message: `Failed to create test data: ${error.message}`,
      error: { message: error.message },
      timestamp: new Date().toISOString(),
    });
    return results;
  }

  // Test create timesheet
  results.push(
    await runTest(
      'Create timesheet',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/timesheets', {
          method: 'POST',
          body: {
            project_id: projectId,
            client_id: clientId,
            activity_type_id: activityTypeId,
            cost_center_id: costCenterId,
            date: new Date().toISOString().split('T')[0],
            hours: 8,
            notes: 'TEST_Timesheet entry for testing',
          },
          token: context.adminToken,
          expectedStatus: 201,
        });
        if (!response.id) {
          throw new Error('Timesheet creation failed - no ID returned');
        }
        createdTimesheetId = response.id;
        context.testData.timesheetIds.push(response.id);
      },
      'timesheets-create'
    )
  );

  // Test get all timesheets
  results.push(
    await runTest(
      'Get all timesheets',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/timesheets', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Get timesheets did not return an array');
        }
      },
      'timesheets-get-all'
    )
  );

  // Test get single timesheet
  if (createdTimesheetId) {
    results.push(
      await runTest(
        'Get single timesheet',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/timesheets/${createdTimesheetId}`, {
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (!response.id || response.id !== createdTimesheetId) {
            throw new Error('Get timesheet returned incorrect timesheet');
          }
        },
        'timesheets-get-one'
      )
    );
  }

  // Test update timesheet
  if (createdTimesheetId) {
    results.push(
      await runTest(
        'Update timesheet',
        'CRUD',
        async () => {
          const response = await apiRequest(`/api/timesheets/${createdTimesheetId}`, {
            method: 'PUT',
            body: {
              hours: 9,
              notes: 'TEST_Updated timesheet entry',
            },
            token: context.adminToken,
            expectedStatus: 200,
          });
          if (parseFloat(response.hours) !== 9) {
            throw new Error('Timesheet update failed - hours not updated');
          }
        },
        'timesheets-update'
      )
    );
  }

  // Test delete timesheet
  if (createdTimesheetId) {
    results.push(
      await runTest(
        'Delete timesheet',
        'CRUD',
        async () => {
          await apiRequest(`/api/timesheets/${createdTimesheetId}`, {
            method: 'DELETE',
            token: context.adminToken,
            expectedStatus: 200,
          });
        },
        'timesheets-delete'
      )
    );
  }

  return results;
}

