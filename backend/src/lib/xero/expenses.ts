import { query } from '../../db';

export interface CreateExpenseData {
  project_id?: string;
  cost_center_id?: string;
  amount: number;
  date: string;
  description: string;
  receipt_url?: string;
  currency?: string;
}

export interface XeroExpenseRequest {
  Contact?: { ContactID: string };
  Date: string;
  LineAmount: number;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
    Tracking?: Array<{ Name: string; Option: string }>;
  }>;
  Reference?: string;
}

/**
 * Create an expense claim in Xero
 */
export async function createExpenseInXero(
  tokenData: { accessToken: string; tenantId: string },
  expenseData: CreateExpenseData,
  trackingCategories?: Array<{ name: string; option: string }>
): Promise<{ ExpenseClaimID: string; Date: string; Total: number } | null> {
  try {
    const xeroExpense: XeroExpenseRequest = {
      Date: expenseData.date,
      LineAmount: expenseData.amount,
      LineItems: [{
        Description: expenseData.description,
        Quantity: 1,
        UnitAmount: expenseData.amount,
        Tracking: trackingCategories?.map(tc => ({ Name: tc.name, Option: tc.option })),
      }],
      Reference: expenseData.description,
    };

    const response = await fetch('https://api.xero.com/api.xro/2.0/ExpenseClaims', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ ExpenseClaims: [xeroExpense] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero expense creation failed:', errorText);
      return null;
    }

    const result = await response.json() as { ExpenseClaims: Array<{ ExpenseClaimID: string; Date: string; Total: number }> };
    return result.ExpenseClaims?.[0] || null;
  } catch (error) {
    console.error('Error creating expense in Xero:', error);
    return null;
  }
}

/**
 * Store expense in local database
 */
export async function storeExpense(expenseData: CreateExpenseData & { xero_expense_id?: string }): Promise<string> {
  const result = await query(
    `INSERT INTO xero_expenses (
      xero_expense_id, project_id, cost_center_id, amount, date, description, receipt_url, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      expenseData.xero_expense_id || null,
      expenseData.project_id || null,
      expenseData.cost_center_id || null,
      expenseData.amount,
      expenseData.date,
      expenseData.description,
      expenseData.receipt_url || null,
      expenseData.xero_expense_id ? new Date() : null,
    ]
  );

  const expenseId = result.rows[0].id;

  // Update project actual_cost if project_id is provided
  if (expenseData.project_id) {
    await query(
      `UPDATE projects 
       SET actual_cost = COALESCE(actual_cost, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [expenseData.amount, expenseData.project_id]
    );
  }

  return expenseId;
}

/**
 * Get expenses with filters
 */
export async function getExpenses(filters: {
  project_id?: string;
  cost_center_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<any[]> {
  let sql = `
    SELECT e.*,
      p.code as project_code,
      p.name as project_name,
      cc.code as cost_center_code,
      cc.name as cost_center_name
    FROM xero_expenses e
    LEFT JOIN projects p ON e.project_id = p.id
    LEFT JOIN cost_centers cc ON e.cost_center_id = cc.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.project_id) {
    sql += ` AND e.project_id = $${paramCount++}`;
    params.push(filters.project_id);
  }

  if (filters.cost_center_id) {
    sql += ` AND e.cost_center_id = $${paramCount++}`;
    params.push(filters.cost_center_id);
  }

  if (filters.status) {
    sql += ` AND e.status = $${paramCount++}`;
    params.push(filters.status);
  }

  if (filters.date_from) {
    sql += ` AND e.date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND e.date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  sql += ' ORDER BY e.date DESC, e.created_at DESC';

  try {
    const result = await query(sql, params);
    return result.rows;
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to fetch expenses';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    if (isTableError) {
      throw new Error('Database tables not found. Please run migrations: docker exec -it ampedfieldops-backend-1 node dist/db/migrate.js');
    }
    throw error;
  }
}

