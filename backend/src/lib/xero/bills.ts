import { query } from '../../db';
import { fetchWithRateLimit } from './rateLimiter';
import { parseXeroError, getErrorMessage } from './errorHandler';

export interface CreateBillData {
  supplier_id: string;
  purchase_order_id?: string;
  project_id?: string;
  date: string;
  due_date?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_amount: number;
    account_code?: string;
  }>;
  reference?: string;
  currency?: string;
}

export interface XeroBillRequest {
  Contact: { ContactID: string };
  Date: string;
  DueDate?: string;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
  }>;
  Reference?: string;
}

/**
 * Create a bill in Xero
 */
export async function createBillInXero(
  tokenData: { accessToken: string; tenantId: string },
  billData: CreateBillData,
  supplierXeroId: string
): Promise<{ InvoiceID: string; Date: string; Total: number } | null> {
  try {
    const xeroBill: XeroBillRequest = {
      Contact: { ContactID: supplierXeroId },
      Date: billData.date,
      DueDate: billData.due_date,
      LineItems: billData.line_items.map(item => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unit_amount,
        AccountCode: item.account_code,
      })),
      Reference: billData.reference,
    };

    // Xero Bills are created using the Invoices endpoint with Type: 'ACCPAY'
    // This is the correct approach per Xero API documentation
    const xeroBillWithType = {
      ...xeroBill,
      Type: 'ACCPAY' // Accounts Payable (Bill)
    };

    const response = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ Invoices: [xeroBillWithType] }),
    });

    if (!response.ok) {
      const error = await parseXeroError(response);
      const errorMessage = getErrorMessage(error);
      console.error('Xero bill creation failed:', errorMessage, error);
      throw new Error(errorMessage);
    }

    const result = await response.json() as { Invoices: Array<{ InvoiceID: string; Date: string; Total: number; Type: string }> };
    const invoice = result.Invoices?.[0];
    
    // Verify it's a bill (ACCPAY type)
    if (invoice && invoice.Type === 'ACCPAY') {
      return invoice;
    }
    
    throw new Error('Created invoice is not a bill (Type is not ACCPAY)');
  } catch (error) {
    console.error('Error creating bill in Xero:', error);
    throw error;
  }
}

/**
 * Store bill in local database
 */
export async function storeBill(billData: CreateBillData & { xero_bill_id?: string; bill_number?: string }): Promise<string> {
  const totalAmount = billData.line_items.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);

  const result = await query(
    `INSERT INTO xero_bills (
      xero_bill_id, bill_number, supplier_id, purchase_order_id, project_id,
      date, due_date, amount, amount_due, currency, line_items, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`,
    [
      billData.xero_bill_id || null,
      billData.bill_number || null,
      billData.supplier_id,
      billData.purchase_order_id || null,
      billData.project_id || null,
      billData.date,
      billData.due_date || null,
      totalAmount,
      totalAmount, // amount_due initially equals total
      billData.currency || 'USD',
      JSON.stringify(billData.line_items),
      billData.xero_bill_id ? new Date() : null,
    ]
  );

  const billId = result.rows[0].id;

  // If bill was created from a purchase order, update PO status and link
  if (billData.purchase_order_id) {
    await query(
      `UPDATE xero_purchase_orders 
       SET status = 'BILLED', bill_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [billId, billData.purchase_order_id]
    );
  }

  // Update project actual_cost if project_id is provided
  if (billData.project_id) {
    await query(
      `UPDATE projects 
       SET actual_cost = COALESCE(actual_cost, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [totalAmount, billData.project_id]
    );

    // Reduce PO commitments if this bill came from a PO
    if (billData.purchase_order_id) {
      const poResult = await query(
        'SELECT total_amount FROM xero_purchase_orders WHERE id = $1',
        [billData.purchase_order_id]
      );
      if (poResult.rows.length > 0) {
        const poAmount = parseFloat(poResult.rows[0].total_amount || '0');
        await query(
          `UPDATE projects 
           SET po_commitments = GREATEST(0, COALESCE(po_commitments, 0) - $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [poAmount, billData.project_id]
        );
      }
    }
  }

  return billId;
}

/**
 * Get bills with filters
 */
export async function getBills(filters: {
  supplier_id?: string;
  project_id?: string;
  purchase_order_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<any[]> {
  let sql = `
    SELECT b.*,
      c.name as supplier_name,
      p.code as project_code,
      p.name as project_name,
      po.po_number
    FROM xero_bills b
    LEFT JOIN clients c ON b.supplier_id = c.id
    LEFT JOIN projects p ON b.project_id = p.id
    LEFT JOIN xero_purchase_orders po ON b.purchase_order_id = po.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.supplier_id) {
    sql += ` AND b.supplier_id = $${paramCount++}`;
    params.push(filters.supplier_id);
  }

  if (filters.project_id) {
    sql += ` AND b.project_id = $${paramCount++}`;
    params.push(filters.project_id);
  }

  if (filters.purchase_order_id) {
    sql += ` AND b.purchase_order_id = $${paramCount++}`;
    params.push(filters.purchase_order_id);
  }

  if (filters.status) {
    sql += ` AND b.status = $${paramCount++}`;
    params.push(filters.status);
  }

  if (filters.date_from) {
    sql += ` AND b.date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND b.date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  sql += ' ORDER BY b.date DESC, b.created_at DESC';

  try {
    const result = await query(sql, params);
    return result.rows;
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to fetch bills';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    if (isTableError) {
      // Return empty array instead of error - tables will be created when migrations run
      console.warn('[Xero] xero_bills table not found. Returning empty array. Run migrations to create tables.');
      return [];
    }
    throw error;
  }
}

/**
 * Mark bill as paid
 */
export async function markBillAsPaid(billId: string, amount?: number): Promise<void> {
  const billResult = await query('SELECT amount, amount_paid FROM xero_bills WHERE id = $1', [billId]);
  
  if (billResult.rows.length === 0) {
    throw new Error('Bill not found');
  }

  const bill = billResult.rows[0];
  const paymentAmount = amount || parseFloat(bill.amount_due || bill.amount);
  const newAmountPaid = parseFloat(bill.amount_paid || '0') + paymentAmount;
  const newAmountDue = parseFloat(bill.amount) - newAmountPaid;

  await query(
    `UPDATE xero_bills 
     SET amount_paid = $1,
         amount_due = $2,
         status = CASE WHEN $2 <= 0 THEN 'PAID' ELSE status END,
         paid_date = CASE WHEN $2 <= 0 THEN CURRENT_DATE ELSE paid_date END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [newAmountPaid, newAmountDue, billId]
  );
}

