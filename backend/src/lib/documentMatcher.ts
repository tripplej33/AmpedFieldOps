/**
 * Document Matching Algorithm
 * Matches scanned documents to existing financial records
 */
import { query } from '../db';
import { log } from './logger';
import { fuzzyMatch } from './utils/stringUtils';
import { distance } from 'fastest-levenshtein';

export interface DocumentMatch {
  id: string;
  entity_type: 'purchase_order' | 'invoice' | 'bill' | 'expense';
  entity_id: string;
  confidence_score: number;
  match_reasons: string[];
  entity_data: any;
}

export interface ExtractedData {
  document_number?: string;
  date?: string;
  amount?: number;
  total_amount?: number;
  vendor_name?: string;
}

/**
 * Find matches for a scanned document
 */
export async function findMatches(
  scanId: string,
  extractedData: ExtractedData,
  documentType: string
): Promise<DocumentMatch[]> {
  const matches: DocumentMatch[] = [];

  try {
    // Match based on document type
    if (documentType === 'purchase_order' || documentType === 'unknown') {
      const poMatches = await matchPurchaseOrders(extractedData);
      matches.push(...poMatches);
    }

    if (documentType === 'invoice' || documentType === 'unknown') {
      const invoiceMatches = await matchInvoices(extractedData);
      matches.push(...invoiceMatches);
    }

    if (documentType === 'bill' || documentType === 'unknown') {
      const billMatches = await matchBills(extractedData);
      matches.push(...billMatches);
    }

    if (documentType === 'receipt' || documentType === 'expense' || documentType === 'unknown') {
      const expenseMatches = await matchExpenses(extractedData);
      matches.push(...expenseMatches);
    }

    // Sort by confidence score (highest first)
    matches.sort((a, b) => b.confidence_score - a.confidence_score);

    // Return top 5 matches
    return matches.slice(0, 5);
  } catch (error) {
    log.error('Error finding document matches', error, { scanId });
    return [];
  }
}

/**
 * Match against purchase orders
 */
async function matchPurchaseOrders(data: ExtractedData): Promise<DocumentMatch[]> {
  const matches: DocumentMatch[] = [];

  if (!data.document_number && !data.amount && !data.vendor_name) {
    return matches;
  }

  let sql = 'SELECT id, po_number, supplier_id, project_id, total_amount, date FROM xero_purchase_orders WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  // Match by PO number
  if (data.document_number) {
    sql += ` AND (po_number ILIKE $${paramCount} OR po_number ILIKE $${paramCount + 1})`;
    params.push(`%${data.document_number}%`, data.document_number);
    paramCount += 2;
  }

  const result = await query(sql, params);

  for (const po of result.rows) {
    const reasons: string[] = [];
    let confidence = 0;

    // Match by PO number (exact or fuzzy)
    if (data.document_number && po.po_number) {
      const poNumberMatch = fuzzyMatch(data.document_number, po.po_number);
      if (poNumberMatch > 0.8) {
        confidence += 0.5;
        reasons.push(`PO number match: ${po.po_number}`);
      } else if (poNumberMatch > 0.6) {
        confidence += 0.3;
        reasons.push(`PO number partial match: ${po.po_number}`);
      }
    }

    // Match by amount (within $0.01 tolerance)
    if (data.total_amount && po.total_amount) {
      const amountDiff = Math.abs(data.total_amount - parseFloat(po.total_amount));
      if (amountDiff < 0.01) {
        confidence += 0.4;
        reasons.push(`Amount match: $${po.total_amount}`);
      } else if (amountDiff < 1.0) {
        confidence += 0.2;
        reasons.push(`Amount close match: $${po.total_amount} (diff: $${amountDiff.toFixed(2)})`);
      }
    }

    // Match by date (within 7 days)
    if (data.date && po.date) {
      const scanDate = new Date(data.date);
      const poDate = new Date(po.date);
      const daysDiff = Math.abs((scanDate.getTime() - poDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        confidence += 0.1;
        reasons.push(`Date within range: ${po.date} (${daysDiff.toFixed(0)} days)`);
      }
    }

    if (confidence > 0.3) {
      matches.push({
        id: po.id,
        entity_type: 'purchase_order',
        entity_id: po.id,
        confidence_score: Math.min(confidence, 1.0),
        match_reasons: reasons,
        entity_data: po,
      });
    }
  }

  return matches;
}

/**
 * Match against invoices
 */
async function matchInvoices(data: ExtractedData): Promise<DocumentMatch[]> {
  const matches: DocumentMatch[] = [];

  if (!data.document_number && !data.amount) {
    return matches;
  }

  let sql = 'SELECT id, invoice_number, client_id, project_id, total, issue_date FROM xero_invoices WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  // Match by invoice number
  if (data.document_number) {
    sql += ` AND invoice_number ILIKE $${paramCount}`;
    params.push(`%${data.document_number}%`);
    paramCount++;
  }

  const result = await query(sql, params);

  for (const invoice of result.rows) {
    const reasons: string[] = [];
    let confidence = 0;

    // Match by invoice number
    if (data.document_number && invoice.invoice_number) {
      const invMatch = fuzzyMatch(data.document_number, invoice.invoice_number);
      if (invMatch > 0.8) {
        confidence += 0.5;
        reasons.push(`Invoice number match: ${invoice.invoice_number}`);
      } else if (invMatch > 0.6) {
        confidence += 0.3;
        reasons.push(`Invoice number partial match: ${invoice.invoice_number}`);
      }
    }

    // Match by amount
    if (data.total_amount && invoice.total) {
      const amountDiff = Math.abs(data.total_amount - parseFloat(invoice.total));
      if (amountDiff < 0.01) {
        confidence += 0.4;
        reasons.push(`Amount match: $${invoice.total}`);
      } else if (amountDiff < 1.0) {
        confidence += 0.2;
        reasons.push(`Amount close match: $${invoice.total}`);
      }
    }

    // Match by date
    if (data.date && invoice.issue_date) {
      const scanDate = new Date(data.date);
      const invDate = new Date(invoice.issue_date);
      const daysDiff = Math.abs((scanDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        confidence += 0.1;
        reasons.push(`Date within range: ${invoice.issue_date}`);
      }
    }

    if (confidence > 0.3) {
      matches.push({
        id: invoice.id,
        entity_type: 'invoice',
        entity_id: invoice.id,
        confidence_score: Math.min(confidence, 1.0),
        match_reasons: reasons,
        entity_data: invoice,
      });
    }
  }

  return matches;
}

/**
 * Match against bills
 */
async function matchBills(data: ExtractedData): Promise<DocumentMatch[]> {
  const matches: DocumentMatch[] = [];

  if (!data.document_number && !data.amount && !data.vendor_name) {
    return matches;
  }

  let sql = 'SELECT id, bill_number, supplier_id, project_id, amount, date FROM xero_bills WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  // Match by bill number
  if (data.document_number) {
    sql += ` AND bill_number ILIKE $${paramCount}`;
    params.push(`%${data.document_number}%`);
    paramCount++;
  }

  const result = await query(sql, params);

  for (const bill of result.rows) {
    const reasons: string[] = [];
    let confidence = 0;

    // Match by bill number
    if (data.document_number && bill.bill_number) {
      const billMatch = fuzzyMatch(data.document_number, bill.bill_number);
      if (billMatch > 0.8) {
        confidence += 0.5;
        reasons.push(`Bill number match: ${bill.bill_number}`);
      }
    }

    // Match by amount
    if (data.total_amount && bill.amount) {
      const amountDiff = Math.abs(data.total_amount - parseFloat(bill.amount));
      if (amountDiff < 0.01) {
        confidence += 0.4;
        reasons.push(`Amount match: $${bill.amount}`);
      }
    }

    // Match by date
    if (data.date && bill.date) {
      const scanDate = new Date(data.date);
      const billDate = new Date(bill.date);
      const daysDiff = Math.abs((scanDate.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        confidence += 0.1;
        reasons.push(`Date within range: ${bill.date}`);
      }
    }

    // Match by vendor (if we have supplier info)
    if (data.vendor_name && bill.supplier_id) {
      const supplierResult = await query('SELECT name FROM clients WHERE id = $1', [bill.supplier_id]);
      if (supplierResult.rows.length > 0) {
        const supplierName = supplierResult.rows[0].name;
        const vendorMatch = fuzzyMatch(data.vendor_name, supplierName);
        if (vendorMatch > 0.7) {
          confidence += 0.3;
          reasons.push(`Vendor match: ${supplierName}`);
        }
      }
    }

    if (confidence > 0.3) {
      matches.push({
        id: bill.id,
        entity_type: 'bill',
        entity_id: bill.id,
        confidence_score: Math.min(confidence, 1.0),
        match_reasons: reasons,
        entity_data: bill,
      });
    }
  }

  return matches;
}

/**
 * Match against expenses
 */
async function matchExpenses(data: ExtractedData): Promise<DocumentMatch[]> {
  const matches: DocumentMatch[] = [];

  if (!data.amount && !data.vendor_name) {
    return matches;
  }

  let sql = 'SELECT id, project_id, cost_center_id, amount, date, description FROM xero_expenses WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  // Match by amount (within $1 tolerance for expenses)
  if (data.total_amount) {
    sql += ` AND ABS(amount - $${paramCount}) < 1.0`;
    params.push(data.total_amount);
    paramCount++;
  }

  const result = await query(sql, params);

  for (const expense of result.rows) {
    const reasons: string[] = [];
    let confidence = 0;

    // Match by amount
    if (data.total_amount && expense.amount) {
      const amountDiff = Math.abs(data.total_amount - parseFloat(expense.amount));
      if (amountDiff < 0.01) {
        confidence += 0.5;
        reasons.push(`Amount exact match: $${expense.amount}`);
      } else if (amountDiff < 1.0) {
        confidence += 0.3;
        reasons.push(`Amount close match: $${expense.amount}`);
      }
    }

    // Match by date
    if (data.date && expense.date) {
      const scanDate = new Date(data.date);
      const expDate = new Date(expense.date);
      const daysDiff = Math.abs((scanDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        confidence += 0.2;
        reasons.push(`Date within range: ${expense.date}`);
      }
    }

    // Match by vendor name in description
    if (data.vendor_name && expense.description) {
      const descMatch = fuzzyMatch(data.vendor_name, expense.description);
      if (descMatch > 0.6) {
        confidence += 0.2;
        reasons.push(`Vendor name in description`);
      }
    }

    if (confidence > 0.3) {
      matches.push({
        id: expense.id,
        entity_type: 'expense',
        entity_id: expense.id,
        confidence_score: Math.min(confidence, 1.0),
        match_reasons: reasons,
        entity_data: expense,
      });
    }
  }

  return matches;
}
