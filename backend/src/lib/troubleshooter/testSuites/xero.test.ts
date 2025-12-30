import { TestResult, TestContext } from '../types';
import { runTest, apiRequest, skipTest } from '../testHelpers';
import { query } from '../../../db';
import { createTestClient, createTestProject } from '../testData';

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

  // Test Xero invoices endpoint
  results.push(
    await runTest(
      'Get Xero invoices',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/invoices', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero invoices endpoint should return an array');
        }
      },
      'xero-invoices-get'
    )
  );

  // Test Xero quotes endpoint
  results.push(
    await runTest(
      'Get Xero quotes',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/quotes', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero quotes endpoint should return an array');
        }
      },
      'xero-quotes-get'
    )
  );

  // Test Xero payments endpoint
  results.push(
    await runTest(
      'Get Xero payments',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/payments', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero payments endpoint should return an array');
        }
      },
      'xero-payments-get'
    )
  );

  // Test Xero purchase orders endpoint
  results.push(
    await runTest(
      'Get Xero purchase orders',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/purchase-orders', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero purchase orders endpoint should return an array');
        }
      },
      'xero-purchase-orders-get'
    )
  );

  // Test Xero bills endpoint
  results.push(
    await runTest(
      'Get Xero bills',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/bills', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero bills endpoint should return an array');
        }
      },
      'xero-bills-get'
    )
  );

  // Test Xero expenses endpoint
  results.push(
    await runTest(
      'Get Xero expenses',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/expenses', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero expenses endpoint should return an array');
        }
      },
      'xero-expenses-get'
    )
  );

  // Test Xero credit notes endpoint
  results.push(
    await runTest(
      'Get Xero credit notes',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/credit-notes', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero credit notes endpoint should return an array');
        }
      },
      'xero-credit-notes-get'
    )
  );

  // Test Xero items endpoint
  results.push(
    await runTest(
      'Get Xero items',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/items', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero items endpoint should return an array');
        }
      },
      'xero-items-get'
    )
  );

  // Test Xero bank transactions endpoint
  results.push(
    await runTest(
      'Get Xero bank transactions',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/bank-transactions', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero bank transactions endpoint should return an array');
        }
      },
      'xero-bank-transactions-get'
    )
  );

  // Test Xero summary endpoint
  results.push(
    await runTest(
      'Get Xero summary',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/summary', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response !== 'object' || response === null) {
          throw new Error('Xero summary endpoint should return an object');
        }
      },
      'xero-summary-get'
    )
  );

  // Test Xero reports endpoints
  results.push(
    await runTest(
      'Get Xero profit-loss report endpoint',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reports/profit-loss', {
          token: context.adminToken,
          expectedStatus: [200, 400, 404], // 400/404 if not connected or no data
        });
        // Should return an object or error message
        if (typeof response !== 'object') {
          throw new Error('Xero profit-loss report should return an object or error');
        }
      },
      'xero-reports-profit-loss'
    )
  );

  results.push(
    await runTest(
      'Get Xero balance-sheet report endpoint',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reports/balance-sheet', {
          token: context.adminToken,
          expectedStatus: [200, 400, 404],
        });
        if (typeof response !== 'object') {
          throw new Error('Xero balance-sheet report should return an object or error');
        }
      },
      'xero-reports-balance-sheet'
    )
  );

  results.push(
    await runTest(
      'Get Xero cash-flow report endpoint',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reports/cash-flow', {
          token: context.adminToken,
          expectedStatus: [200, 400, 404],
        });
        if (typeof response !== 'object') {
          throw new Error('Xero cash-flow report should return an object or error');
        }
      },
      'xero-reports-cash-flow'
    )
  );

  results.push(
    await runTest(
      'Get Xero aged-receivables report endpoint',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reports/aged-receivables', {
          token: context.adminToken,
          expectedStatus: [200, 400, 404],
        });
        if (typeof response !== 'object') {
          throw new Error('Xero aged-receivables report should return an object or error');
        }
      },
      'xero-reports-aged-receivables'
    )
  );

  results.push(
    await runTest(
      'Get Xero aged-payables report endpoint',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reports/aged-payables', {
          token: context.adminToken,
          expectedStatus: [200, 400, 404],
        });
        if (typeof response !== 'object') {
          throw new Error('Xero aged-payables report should return an object or error');
        }
      },
      'xero-reports-aged-payables'
    )
  );

  // Test Xero reminders endpoints
  results.push(
    await runTest(
      'Get Xero reminders schedule',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reminders/schedule', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response !== 'object') {
          throw new Error('Xero reminders schedule should return an object');
        }
      },
      'xero-reminders-schedule-get'
    )
  );

  results.push(
    await runTest(
      'Get Xero reminders history',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/reminders/history', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero reminders history should return an array');
        }
      },
      'xero-reminders-history-get'
    )
  );

  // Test Xero webhooks endpoints
  results.push(
    await runTest(
      'Get Xero webhooks status',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/webhooks/status', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (typeof response !== 'object') {
          throw new Error('Xero webhooks status should return an object');
        }
      },
      'xero-webhooks-status-get'
    )
  );

  results.push(
    await runTest(
      'Get Xero webhooks events',
      'Integration',
      async () => {
        const response = await apiRequest('/api/xero/webhooks/events', {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!Array.isArray(response)) {
          throw new Error('Xero webhooks events should return an array');
        }
      },
      'xero-webhooks-events-get'
    )
  );

  // Test purchase order project linking (if we have a purchase order)
  results.push(
    await runTest(
      'Purchase order project linking endpoint accessible',
      'Integration',
      async () => {
        // First check if we have any purchase orders
        const poResult = await query('SELECT id FROM xero_purchase_orders LIMIT 1');
        if (poResult.rows.length === 0) {
          // Skip if no purchase orders exist
          return;
        }
        
        const poId = poResult.rows[0].id;
        // Create a test project to link
        const clientId = await createTestClient();
        const projectId = await createTestProject(clientId);
        
        // Test linking (PUT endpoint)
        const response = await apiRequest(`/api/xero/purchase-orders/${poId}`, {
          token: context.adminToken,
          method: 'PUT',
          body: { project_id: projectId },
          expectedStatus: 200,
        });
        
        if (typeof response !== 'object') {
          throw new Error('Purchase order update should return an object');
        }
        
        // Clean up test project
        await query('DELETE FROM projects WHERE id = $1', [projectId]);
        await query('DELETE FROM clients WHERE id = $1', [clientId]);
      },
      'xero-purchase-order-link-project'
    )
  );

  // Test purchase order by project endpoint
  results.push(
    await runTest(
      'Get purchase orders by project',
      'Integration',
      async () => {
        // Create a test project
        const clientId = await createTestClient();
        const projectId = await createTestProject(clientId);
        
        const response = await apiRequest(`/api/xero/purchase-orders/project/${projectId}`, {
          token: context.adminToken,
          expectedStatus: 200,
        });
        
        if (!Array.isArray(response)) {
          throw new Error('Purchase orders by project should return an array');
        }
        
        // Clean up
        await query('DELETE FROM projects WHERE id = $1', [projectId]);
        await query('DELETE FROM clients WHERE id = $1', [clientId]);
      },
      'xero-purchase-orders-by-project'
    )
  );

  // Test Xero database tables exist
  results.push(
    await runTest(
      'Xero database tables exist',
      'Integration',
      async () => {
        const tables = [
          'xero_invoices',
          'xero_quotes',
          'xero_purchase_orders',
          'xero_purchase_order_line_items',
          'xero_bills',
          'xero_expenses',
          'xero_payments',
          'bank_transactions',
          'xero_credit_notes'
        ];
        
        for (const tableName of tables) {
          const result = await query(
            `SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            )`,
            [tableName]
          );
          
          if (!result.rows[0].exists) {
            throw new Error(`Xero table ${tableName} does not exist. Run migrations to create it.`);
          }
        }
      },
      'xero-tables-exist'
    )
  );

  // Note: We skip actual Xero API calls (sync, create operations, etc.) since they require
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
      'xero-invoices-create'
    )
  );

  results.push(
    skipTest(
      'Xero purchase order creation (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-purchase-orders-create'
    )
  );

  results.push(
    skipTest(
      'Xero bill creation (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-bills-create'
    )
  );

  results.push(
    skipTest(
      'Xero expense creation (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-expenses-create'
    )
  );

  results.push(
    skipTest(
      'Xero credit note creation (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-credit-notes-create'
    )
  );

  results.push(
    skipTest(
      'Xero items sync (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-items-sync'
    )
  );

  results.push(
    skipTest(
      'Xero bank transactions import (requires actual Xero connection)',
      'Integration',
      'Skipped: Requires actual Xero credentials',
      'xero-bank-transactions-import'
    )
  );

  return results;
}

