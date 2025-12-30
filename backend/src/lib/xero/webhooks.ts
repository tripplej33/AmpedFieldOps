import { query } from '../../db';
import * as crypto from 'crypto';

/**
 * Verify webhook signature from Xero
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookKey: string
): boolean {
  try {
    const hash = crypto.createHmac('sha256', webhookKey).update(payload).digest('base64');
    return hash === signature;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Store webhook event
 */
export async function storeWebhookEvent(
  eventType: string,
  entityId: string,
  payload: any,
  processed: boolean = false
): Promise<string> {
  const result = await query(
    `INSERT INTO xero_webhook_events (event_type, entity_id, payload, processed, created_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     RETURNING id`,
    [eventType, entityId, JSON.stringify(payload), processed]
  );

  return result.rows[0].id;
}

/**
 * Process webhook event
 */
export async function processWebhookEvent(eventId: string): Promise<boolean> {
  try {
    const eventResult = await query('SELECT * FROM xero_webhook_events WHERE id = $1', [eventId]);
    
    if (eventResult.rows.length === 0) {
      return false;
    }

    const event = eventResult.rows[0];
    
    if (event.processed) {
      return true; // Already processed
    }

    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    // Process based on event type
    switch (event.event_type) {
      case 'INVOICE':
        await handleInvoiceWebhook(event.entity_id, payload);
        break;
      case 'PAYMENT':
        await handlePaymentWebhook(event.entity_id, payload);
        break;
      case 'CONTACT':
        await handleContactWebhook(event.entity_id, payload);
        break;
      case 'BILL':
        await handleBillWebhook(event.entity_id, payload);
        break;
      case 'PURCHASEORDER':
        await handlePurchaseOrderWebhook(event.entity_id, payload);
        break;
      case 'BANKTRANSACTION':
        await handleBankTransactionWebhook(event.entity_id, payload);
        break;
      default:
        console.log(`Unknown webhook event type: ${event.event_type}`);
    }

    // Mark as processed
    await query(
      'UPDATE xero_webhook_events SET processed = true, processed_at = CURRENT_TIMESTAMP WHERE id = $1',
      [eventId]
    );

    return true;
  } catch (error) {
    console.error('Error processing webhook event:', error);
    return false;
  }
}

/**
 * Handle invoice webhook
 */
async function handleInvoiceWebhook(entityId: string, payload: any): Promise<void> {
  // Update invoice status, amounts, etc.
  // This would sync invoice changes from Xero to local database
  if (payload.InvoiceID) {
    // In a full implementation, you would fetch the invoice from Xero and update the local database
    console.log(`Processing invoice webhook for ${payload.InvoiceID}`);
  }
}

/**
 * Handle payment webhook
 */
async function handlePaymentWebhook(entityId: string, payload: any): Promise<void> {
  // Update payment status, link to invoices
  if (payload.PaymentID) {
    console.log(`Processing payment webhook for ${payload.PaymentID}`);
  }
}

/**
 * Handle contact webhook
 */
async function handleContactWebhook(entityId: string, payload: any): Promise<void> {
  // Update client information
  if (payload.ContactID) {
    const result = await query(
      'UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE xero_contact_id = $1',
      [payload.ContactID]
    );
    console.log(`Processing contact webhook for ${payload.ContactID}`);
  }
}

/**
 * Handle bill webhook
 */
async function handleBillWebhook(entityId: string, payload: any): Promise<void> {
  if (payload.InvoiceID) {
    console.log(`Processing bill webhook for ${payload.InvoiceID}`);
  }
}

/**
 * Handle purchase order webhook
 */
async function handlePurchaseOrderWebhook(entityId: string, payload: any): Promise<void> {
  if (payload.PurchaseOrderID) {
    console.log(`Processing purchase order webhook for ${payload.PurchaseOrderID}`);
  }
}

/**
 * Handle bank transaction webhook
 */
async function handleBankTransactionWebhook(entityId: string, payload: any): Promise<void> {
  if (payload.BankTransactionID) {
    console.log(`Processing bank transaction webhook for ${payload.BankTransactionID}`);
  }
}

/**
 * Get webhook subscription status
 */
export async function getWebhookStatus(): Promise<any> {
  // In a full implementation, this would query Xero API for webhook subscription status
  return {
    subscribed: false,
    events: [],
  };
}

/**
 * Get webhook events
 */
export async function getWebhookEvents(filters: {
  event_type?: string;
  processed?: boolean;
  date_from?: string;
  date_to?: string;
}): Promise<any[]> {
  let sql = `
    SELECT * FROM xero_webhook_events
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.event_type) {
    sql += ` AND event_type = $${paramCount++}`;
    params.push(filters.event_type);
  }

  if (filters.processed !== undefined) {
    sql += ` AND processed = $${paramCount++}`;
    params.push(filters.processed);
  }

  if (filters.date_from) {
    sql += ` AND created_at >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND created_at <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  sql += ' ORDER BY created_at DESC LIMIT 100';

  const result = await query(sql, params);
  return result.rows;
}

