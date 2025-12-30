import { query } from '../../db';
import { fetchWithRateLimit } from './rateLimiter';
import { parseXeroError, getErrorMessage } from './errorHandler';

export interface CreateCreditNoteData {
  invoice_id: string;
  amount: number;
  date: string;
  reason?: string;
  description?: string;
  currency?: string;
}

export interface XeroCreditNoteRequest {
  Type: string; // 'ACCPAYCREDIT' or 'ACCRECCREDIT'
  Contact: { ContactID: string };
  Date: string;
  CreditNoteNumber?: string;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
  }>;
  Reference?: string;
}

/**
 * Create a credit note in Xero
 */
export async function createCreditNoteInXero(
  tokenData: { accessToken: string; tenantId: string },
  creditNoteData: CreateCreditNoteData,
  invoiceXeroId: string,
  contactXeroId: string,
  creditNoteType: 'ACCPAYCREDIT' | 'ACCRECCREDIT' = 'ACCRECCREDIT'
): Promise<{ CreditNoteID: string; Date: string; Total: number } | null> {
  try {
    const xeroCreditNote: XeroCreditNoteRequest = {
      Type: creditNoteType,
      Contact: { ContactID: contactXeroId },
      Date: creditNoteData.date,
      LineItems: [{
        Description: creditNoteData.description || creditNoteData.reason || 'Credit Note',
        Quantity: 1,
        UnitAmount: creditNoteData.amount,
      }],
      Reference: creditNoteData.reason,
    };

    const response = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/CreditNotes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ CreditNotes: [xeroCreditNote] }),
    });

    if (!response.ok) {
      const error = await parseXeroError(response);
      const errorMessage = getErrorMessage(error);
      console.error('Xero credit note creation failed:', errorMessage, error);
      throw new Error(errorMessage);
    }

    const result = await response.json() as { CreditNotes: Array<{ CreditNoteID: string; Date: string; Total: number }> };
    return result.CreditNotes?.[0] || null;
  } catch (error) {
    console.error('Error creating credit note in Xero:', error);
    throw error;
  }
}

/**
 * Apply credit note to invoice in Xero
 */
export async function applyCreditNoteToInvoice(
  tokenData: { accessToken: string; tenantId: string },
  creditNoteXeroId: string,
  invoiceXeroId: string
): Promise<boolean> {
  try {
    // In Xero, credit notes are automatically allocated to invoices when they're created
    // This endpoint is for explicit allocation if needed
    // The allocation happens via the Allocations endpoint
    
    const response = await fetchWithRateLimit(`https://api.xero.com/api.xro/2.0/CreditNotes/${creditNoteXeroId}/Allocations`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        Allocations: [{
          Invoice: { InvoiceID: invoiceXeroId },
          AppliedAmount: 0, // Will apply full amount if not specified
        }]
      }),
    });

    if (!response.ok) {
      const error = await parseXeroError(response);
      const errorMessage = getErrorMessage(error);
      console.error('Xero credit note allocation failed:', errorMessage, error);
      throw new Error(errorMessage);
    }

    return true;
  } catch (error) {
    console.error('Error applying credit note to invoice:', error);
    throw error;
  }
}

/**
 * Store credit note in local database
 */
export async function storeCreditNote(creditNoteData: CreateCreditNoteData & { xero_credit_note_id?: string; credit_note_number?: string }): Promise<string> {
  const result = await query(
    `INSERT INTO xero_credit_notes (
      xero_credit_note_id, credit_note_number, invoice_id, amount, date, reason, status, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      creditNoteData.xero_credit_note_id || null,
      creditNoteData.credit_note_number || null,
      creditNoteData.invoice_id,
      creditNoteData.amount,
      creditNoteData.date,
      creditNoteData.reason || creditNoteData.description || null,
      'AUTHORISED',
      creditNoteData.xero_credit_note_id ? new Date() : null,
    ]
  );

  return result.rows[0].id;
}

/**
 * Get credit notes with filters
 */
export async function getCreditNotes(filters: {
  invoice_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
}): Promise<any[]> {
  let sql = `
    SELECT cn.*,
      xi.invoice_number,
      xi.xero_invoice_id,
      c.name as client_name
    FROM xero_credit_notes cn
    LEFT JOIN xero_invoices xi ON cn.invoice_id = xi.id
    LEFT JOIN clients c ON xi.client_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.invoice_id) {
    sql += ` AND cn.invoice_id = $${paramCount++}`;
    params.push(filters.invoice_id);
  }

  if (filters.date_from) {
    sql += ` AND cn.date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND cn.date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  if (filters.status) {
    sql += ` AND cn.status = $${paramCount++}`;
    params.push(filters.status);
  }

  sql += ' ORDER BY cn.date DESC, cn.created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

