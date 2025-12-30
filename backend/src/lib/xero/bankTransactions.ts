import { query } from '../../db';

export interface BankTransaction {
  id: string;
  xero_bank_transaction_id?: string;
  bank_account_code?: string;
  bank_account_name?: string;
  date: string;
  amount: number;
  type: 'RECEIVE' | 'SPEND';
  description?: string;
  reference?: string;
  contact_id?: string;
  reconciled: boolean;
  payment_id?: string;
}

/**
 * Import bank transactions from Xero
 */
export async function importBankTransactions(
  tokenData: { accessToken: string; tenantId: string },
  dateFrom?: string,
  dateTo?: string
): Promise<number> {
  try {
    let url = 'https://api.xero.com/api.xro/2.0/BankTransactions';
    const params = new URLSearchParams();
    
    if (dateFrom) {
      params.append('where', `Date >= DateTime(${dateFrom})`);
    }
    if (dateTo) {
      const whereClause = dateFrom 
        ? `Date >= DateTime(${dateFrom}) AND Date <= DateTime(${dateTo})`
        : `Date <= DateTime(${dateTo})`;
      params.append('where', whereClause);
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero bank transactions fetch failed:', errorText);
      return 0;
    }

    interface XeroBankTransactionsResponse {
      BankTransactions: Array<{
        BankTransactionID: string;
        Type: string;
        Contact?: { ContactID: string };
        Date: string;
        BankAccount: { Code: string; Name: string };
        LineItems: Array<{ Description: string; LineAmount: number }>;
        Reference?: string;
      }>;
    }

    const data = await response.json() as XeroBankTransactionsResponse;
    const transactions = data.BankTransactions || [];
    let imported = 0;

    for (const txn of transactions) {
      const amount = Math.abs(txn.LineItems.reduce((sum, item) => sum + (item.LineAmount || 0), 0));
      const description = txn.LineItems.map(item => item.Description).join(', ');

      // Check if transaction already exists
      const existing = await query(
        'SELECT id FROM bank_transactions WHERE xero_bank_transaction_id = $1',
        [txn.BankTransactionID]
      );

      if (existing.rows.length === 0) {
        // Look up client by Xero contact ID
        let clientId = null;
        if (txn.Contact?.ContactID) {
          const clientResult = await query(
            'SELECT id FROM clients WHERE xero_contact_id = $1 LIMIT 1',
            [txn.Contact.ContactID]
          );
          if (clientResult.rows.length > 0) {
            clientId = clientResult.rows[0].id;
          }
        }

        await query(
          `INSERT INTO bank_transactions (
            xero_bank_transaction_id, bank_account_code, bank_account_name,
            date, amount, type, description, reference, contact_id, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
          [
            txn.BankTransactionID,
            txn.BankAccount.Code,
            txn.BankAccount.Name,
            txn.Date.split('T')[0],
            amount,
            txn.Type,
            description,
            txn.Reference || null,
            clientId,
          ]
        );
        imported++;
      }
    }

    return imported;
  } catch (error) {
    console.error('Error importing bank transactions:', error);
    return 0;
  }
}

/**
 * Get bank transactions with filters
 */
export async function getBankTransactions(filters: {
  date_from?: string;
  date_to?: string;
  reconciled?: boolean;
  payment_id?: string;
}): Promise<any[]> {
  let sql = `
    SELECT bt.*, 
      c.name as contact_name,
      CASE 
        WHEN bt.contact_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN c.name
        ELSE NULL
      END as client_name
    FROM bank_transactions bt
    LEFT JOIN clients c ON (
      bt.contact_id::text = c.id::text OR bt.contact_id = c.xero_contact_id
    )
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.date_from) {
    sql += ` AND bt.date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND bt.date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  if (filters.reconciled !== undefined) {
    sql += ` AND bt.reconciled = $${paramCount++}`;
    params.push(filters.reconciled);
  }

  if (filters.payment_id) {
    sql += ` AND bt.payment_id = $${paramCount++}`;
    params.push(filters.payment_id);
  }

  sql += ' ORDER BY bt.date DESC, bt.created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Reconcile a bank transaction with a payment
 */
export async function reconcileTransaction(transactionId: string, paymentId: string): Promise<void> {
  await query(
    `UPDATE bank_transactions 
     SET payment_id = $1, reconciled = true, reconciled_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [paymentId, transactionId]
  );
}

