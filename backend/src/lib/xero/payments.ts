import { query } from '../../db';

export interface CreatePaymentData {
  invoice_id: string;
  amount: number;
  payment_date: string; // ISO date string
  payment_method: 'CASH' | 'CHECK' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'ONLINE';
  reference?: string;
  account_code?: string;
  currency?: string;
}

export interface XeroPaymentRequest {
  Invoice: { InvoiceID: string };
  Account?: { Code: string };
  Date: string;
  Amount: number;
  Reference?: string;
  PaymentMethod?: string;
}

/**
 * Create a payment in Xero
 */
export async function createPaymentInXero(
  tokenData: { accessToken: string; tenantId: string },
  paymentData: CreatePaymentData,
  invoiceXeroId: string
): Promise<{ PaymentID: string; Date: string; Amount: number } | null> {
  try {
    const xeroPayment: XeroPaymentRequest = {
      Invoice: { InvoiceID: invoiceXeroId },
      Date: paymentData.payment_date,
      Amount: paymentData.amount,
      Reference: paymentData.reference,
    };

    // Map payment method to Xero payment method
    const paymentMethodMap: Record<string, string> = {
      'CASH': 'Cash',
      'CHECK': 'Check',
      'BANK_TRANSFER': 'Bank Transfer',
      'CREDIT_CARD': 'Credit Card',
      'ONLINE': 'Online',
    };
    
    if (paymentData.payment_method && paymentMethodMap[paymentData.payment_method]) {
      xeroPayment.PaymentMethod = paymentMethodMap[paymentData.payment_method];
    }

    if (paymentData.account_code) {
      xeroPayment.Account = { Code: paymentData.account_code };
    }

    const response = await fetch('https://api.xero.com/api.xro/2.0/Payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ Payments: [xeroPayment] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero payment creation failed:', errorText);
      return null;
    }

    const result = await response.json() as { Payments: Array<{ PaymentID: string; Date: string; Amount: number }> };
    return result.Payments?.[0] || null;
  } catch (error) {
    console.error('Error creating payment in Xero:', error);
    return null;
  }
}

/**
 * Store payment in local database
 */
export async function storePayment(paymentData: CreatePaymentData & { xero_payment_id?: string; user_id: string }): Promise<string> {
  const result = await query(
    `INSERT INTO xero_payments (
      xero_payment_id, invoice_id, amount, payment_date, payment_method, 
      reference, account_code, currency, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      paymentData.xero_payment_id || null,
      paymentData.invoice_id,
      paymentData.amount,
      paymentData.payment_date,
      paymentData.payment_method,
      paymentData.reference || null,
      paymentData.account_code || null,
      paymentData.currency || 'USD',
      paymentData.xero_payment_id ? new Date() : null,
    ]
  );

  const paymentId = result.rows[0].id;

  // Update invoice payment amounts
  await query(
    `UPDATE xero_invoices 
     SET amount_paid = COALESCE(amount_paid, 0) + $1,
         amount_due = GREATEST(0, COALESCE(amount_due, total) - $1),
         last_payment_date = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [paymentData.amount, paymentData.payment_date, paymentData.invoice_id]
  );

  // Update invoice status if fully paid
  await query(
    `UPDATE xero_invoices 
     SET status = CASE 
       WHEN amount_due <= 0 THEN 'PAID'
       WHEN amount_due < total THEN 'PARTIALLY_PAID'
       ELSE status
     END
     WHERE id = $1`,
    [paymentData.invoice_id]
  );

  return paymentId;
}

/**
 * Get payments with filters
 */
export async function getPayments(filters: {
  invoice_id?: string;
  date_from?: string;
  date_to?: string;
  payment_method?: string;
}): Promise<any[]> {
  let sql = `
    SELECT p.*, 
      xi.invoice_number,
      xi.xero_invoice_id,
      c.name as client_name
    FROM xero_payments p
    LEFT JOIN xero_invoices xi ON p.invoice_id = xi.id
    LEFT JOIN clients c ON xi.client_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.invoice_id) {
    sql += ` AND p.invoice_id = $${paramCount++}`;
    params.push(filters.invoice_id);
  }

  if (filters.date_from) {
    sql += ` AND p.payment_date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND p.payment_date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  if (filters.payment_method) {
    sql += ` AND p.payment_method = $${paramCount++}`;
    params.push(filters.payment_method);
  }

  sql += ' ORDER BY p.payment_date DESC, p.created_at DESC';

  try {
    const result = await query(sql, params);
    return result.rows;
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to fetch payments';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    if (isTableError) {
      throw new Error('Database tables not found. Please run migrations: docker exec -it ampedfieldops-backend-1 node dist/db/migrate.js');
    }
    throw error;
  }
}

