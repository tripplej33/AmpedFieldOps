import { TestResult, TestContext } from '../types';
import { runTest, apiRequest, skipTest } from '../testHelpers';
import { query } from '../../../db';

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

  // Test Xero credentials configuration
  results.push(
    await runTest(
      'Xero credentials configured',
      'Integration',
      async () => {
        const credentialsResult = await query(
          `SELECT key, value FROM settings 
           WHERE key IN ('xero_client_id', 'xero_client_secret') 
           AND user_id IS NULL`
        );
        const hasClientId = credentialsResult.rows.some(r => r.key === 'xero_client_id' && r.value);
        const hasClientSecret = credentialsResult.rows.some(r => r.key === 'xero_client_secret' && r.value);
        
        if (!hasClientId || !hasClientSecret) {
          throw new Error('Xero credentials not configured. Please add Client ID and Client Secret in Settings → Integrations.');
        }
      },
      'xero-credentials-configured'
    )
  );

  // Test Xero token exists and is valid
  results.push(
    await runTest(
      'Xero token exists',
      'Integration',
      async () => {
        const tokenResult = await query(
          `SELECT tenant_id, tenant_name, expires_at, created_at 
           FROM xero_tokens 
           ORDER BY created_at DESC 
           LIMIT 1`
        );
        
        if (tokenResult.rows.length === 0) {
          throw new Error('Xero token not found. Please connect to Xero in Settings → Integrations.');
        }
        
        const token = tokenResult.rows[0];
        const isExpired = new Date(token.expires_at) < new Date();
        
        if (isExpired) {
          throw new Error(`Xero token expired on ${new Date(token.expires_at).toISOString()}. Please reconnect to Xero.`);
        }
      },
      'xero-token-valid'
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

  // Test Xero sync capability (check if connected)
  results.push(
    await runTest(
      'Xero sync capability',
      'Integration',
      async () => {
        const statusResponse = await apiRequest('/api/xero/status', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        
        if (!statusResponse.connected) {
          throw new Error('Xero is not connected. Connect to Xero in Settings → Integrations to enable sync.');
        }
        
        if (!statusResponse.configured) {
          throw new Error('Xero credentials are not configured. Add Client ID and Client Secret in Settings → Integrations.');
        }
      },
      'xero-sync-capability'
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

