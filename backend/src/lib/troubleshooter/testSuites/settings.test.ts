import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test get all settings
  results.push(
    await runTest(
      'Get all settings',
      'Configuration',
      async () => {
        const response = await apiRequest('/api/settings', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response !== 'object') {
          throw new Error('Get settings did not return an object');
        }
      },
      'settings-get-all'
    )
  );

  // Test get specific setting
  results.push(
    await runTest(
      'Get specific setting',
      'Configuration',
      async () => {
        // Try to get a common setting (might not exist, that's OK)
        try {
          await apiRequest('/api/settings/company_name', {
            token: context.adminToken,
            expectedStatus: 200,
          });
        } catch (error: any) {
          // 404 is acceptable if setting doesn't exist
          if (!error.message.includes('404')) {
            throw error;
          }
        }
      },
      'settings-get-one'
    )
  );

  // Test update setting (admin only)
  results.push(
    await runTest(
      'Update setting',
      'Configuration',
      async () => {
        const testKey = `TEST_setting_${Date.now()}`;
        const testValue = 'test-value';
        
        const response = await apiRequest(`/api/settings/${testKey}`, {
          method: 'PUT',
          body: {
            value: testValue,
            global: true,
          },
          token: context.adminToken,
          expectedStatus: 200,
        });
        
        // Verify update
        const getResponse = await apiRequest(`/api/settings/${testKey}`, {
          token: context.adminToken,
          expectedStatus: 200,
        });
        
        if (getResponse.value !== testValue) {
          throw new Error('Setting update failed - value not updated correctly');
        }
      },
      'settings-update'
    )
  );

  // Test that non-admin cannot update global settings
  results.push(
    await runTest(
      'Non-admin cannot update global settings',
      'Configuration',
      async () => {
        try {
          await apiRequest('/api/settings/test_setting', {
            method: 'PUT',
            body: {
              value: 'test',
              global: true,
            },
            token: context.userToken,
            expectedStatus: 403,
          });
        } catch (error: any) {
          if (!error.message.includes('403')) {
            throw error;
          }
        }
      },
      'settings-permission-check'
    )
  );

  return results;
}

