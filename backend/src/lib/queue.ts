import { Queue, Worker, QueueEvents } from 'bullmq';
import { query } from '../db';
import { parseXeroError, getErrorMessage } from './xero/errorHandler';
import { fetchWithRateLimit } from './xero/rateLimiter';
import { getValidAccessToken } from './xero/auth';

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy: (times: number) => {
    // Retry with exponential backoff, max 3 times
    if (times > 3) {
      return null; // Stop retrying
    }
    return Math.min(times * 200, 2000);
  },
  enableReadyCheck: false, // Don't fail if Redis isn't ready immediately
};

// Create queues with error handling
let xeroSyncQueue: Queue;
let xeroSyncQueueEvents: QueueEvents;

try {
  xeroSyncQueue = new Queue('xero-sync', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });

  // Queue event listeners for monitoring
  xeroSyncQueueEvents = new QueueEvents('xero-sync', {
    connection: redisConnection,
  });
} catch (error) {
  console.warn('[Queue] Failed to initialize queues. Redis may not be available. Xero syncs will not work until Redis is configured.');
  // Create dummy queues that will fail gracefully
  xeroSyncQueue = null as any;
  xeroSyncQueueEvents = null as any;
}

export { xeroSyncQueue, xeroSyncQueueEvents };

// Helper function to log sync attempts to sync_logs table
async function logSyncAttempt(
  entityType: string,
  entityId: string,
  requestPayload: any,
  responsePayload: any,
  statusCode: number | null,
  errorMessage: string | null = null
) {
  try {
    await query(
      `INSERT INTO sync_logs (entity_type, entity_id, request_payload, response_payload, status_code, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        JSON.stringify(requestPayload),
        JSON.stringify(responsePayload),
        statusCode,
        errorMessage,
      ]
    );
  } catch (error) {
    console.error('Failed to log sync attempt:', error);
    // Don't throw - logging failures shouldn't break the sync
  }
}

// Worker to process Xero sync jobs
let xeroSyncWorker: Worker;

try {
  xeroSyncWorker = new Worker(
  'xero-sync',
  async (job) => {
    const { type, data } = job.data;

    try {
      switch (type) {
        case 'sync_invoice_from_timesheets': {
          const { invoiceId, clientId, projectId, lineItems, total, dueDate, timesheetIds } = data;

          // Get Xero token
          const tokenData = await getValidAccessToken();
          if (!tokenData) {
            throw new Error('Xero not connected or token expired');
          }

          // Get client's Xero contact ID
          const clientResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [clientId]);
          if (clientResult.rows.length === 0 || !clientResult.rows[0].xero_contact_id) {
            throw new Error('Client does not have a Xero contact ID');
          }

          const xeroContactId = clientResult.rows[0].xero_contact_id;

          // Build Xero invoice payload
          const xeroInvoicePayload = {
            Type: 'ACCREC',
            Contact: { ContactID: xeroContactId },
            Date: new Date().toISOString().split('T')[0],
            DueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            LineItems: lineItems.map((item: any) => ({
              Description: item.description,
              Quantity: item.quantity,
              UnitAmount: item.unit_price,
              LineAmount: item.amount,
              AccountCode: '200', // Default revenue account - should be configurable
            })),
            Status: 'DRAFT',
          };

          // Create invoice in Xero
          const requestPayload = { Invoices: [xeroInvoicePayload] };
          let responsePayload: any = {};
          let statusCode: number | null = null;
          let xeroInvoiceId: string | null = null;
          let errorMessage: string | null = null;

          try {
            const response = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Invoices', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokenData.accessToken}`,
                'Xero-Tenant-Id': tokenData.tenantId,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(requestPayload),
            });

            statusCode = response.status;
            responsePayload = await response.json();

            if (!response.ok) {
              const error = await parseXeroError(response);
              errorMessage = getErrorMessage(error);
              throw new Error(errorMessage);
            }

            const invoices = responsePayload.Invoices || [];
            if (invoices.length > 0) {
              xeroInvoiceId = invoices[0].InvoiceID;
            }

            // Update local invoice with Xero ID and sync status
            await query(
              `UPDATE xero_invoices 
               SET xero_invoice_id = $1, sync_status = 'synced', xero_sync_id = $2, synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [xeroInvoiceId, job.id, invoiceId]
            );

            // Log successful sync
            await logSyncAttempt('invoice', invoiceId, requestPayload, responsePayload, statusCode);

            return { success: true, xeroInvoiceId, invoiceId };
          } catch (error: any) {
            errorMessage = error.message || 'Unknown error';
            statusCode = statusCode || 500;

            // Update invoice sync status to failed
            await query(
              `UPDATE xero_invoices 
               SET sync_status = 'failed', xero_sync_id = $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [job.id, invoiceId]
            );

            // Log failed sync
            await logSyncAttempt('invoice', invoiceId, requestPayload, responsePayload, statusCode, errorMessage);

            throw error;
          }
        }

        case 'sync_purchase_order': {
          const { poId, supplierId, projectId, date, deliveryDate, lineItems, notes, currency, poNumber } = data;

          // Get Xero token
          const tokenData = await getValidAccessToken();
          if (!tokenData) {
            throw new Error('Xero not connected or token expired');
          }

          // Get supplier's Xero contact ID
          const supplierResult = await query('SELECT xero_contact_id FROM clients WHERE id = $1', [supplierId]);
          if (supplierResult.rows.length === 0 || !supplierResult.rows[0].xero_contact_id) {
            throw new Error('Supplier does not have a Xero contact ID');
          }

          const xeroContactId = supplierResult.rows[0].xero_contact_id;

          // Build Xero PO payload
          const xeroPOPayload = {
            Contact: { ContactID: xeroContactId },
            Date: date,
            DeliveryDate: deliveryDate || null,
            LineItems: lineItems.map((item: any) => ({
              Description: item.description,
              Quantity: item.quantity || 1,
              UnitAmount: item.unit_amount || item.line_amount,
              LineAmount: item.line_amount,
              AccountCode: item.account_code || '200',
            })),
            Status: 'DRAFT',
          };

          // Create PO in Xero
          const requestPayload = { PurchaseOrders: [xeroPOPayload] };
          let responsePayload: any = {};
          let statusCode: number | null = null;
          let xeroPoId: string | null = null;
          let errorMessage: string | null = null;

          try {
            const response = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/PurchaseOrders', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokenData.accessToken}`,
                'Xero-Tenant-Id': tokenData.tenantId,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(requestPayload),
            });

            statusCode = response.status;
            responsePayload = await response.json();

            if (!response.ok) {
              const error = await parseXeroError(response);
              errorMessage = getErrorMessage(error);
              throw new Error(errorMessage);
            }

            const purchaseOrders = responsePayload.PurchaseOrders || [];
            if (purchaseOrders.length > 0) {
              xeroPoId = purchaseOrders[0].PurchaseOrderID;
            }

            // Update local PO with Xero ID and sync status
            await query(
              `UPDATE xero_purchase_orders 
               SET xero_po_id = $1, sync_status = 'synced', xero_sync_id = $2, synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [xeroPoId, job.id, poId]
            );

            // Log successful sync
            await logSyncAttempt('purchase_order', poId, requestPayload, responsePayload, statusCode);

            return { success: true, xeroPoId, poId };
          } catch (error: any) {
            errorMessage = error.message || 'Unknown error';
            statusCode = statusCode || 500;

            // Update PO sync status to failed
            await query(
              `UPDATE xero_purchase_orders 
               SET sync_status = 'failed', xero_sync_id = $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [job.id, poId]
            );

            // Log failed sync
            await logSyncAttempt('purchase_order', poId, requestPayload, responsePayload, statusCode, errorMessage);

            throw error;
          }
        }

        default:
          throw new Error(`Unknown sync job type: ${type}`);
      }
    } catch (error: any) {
      console.error(`[Xero Sync Worker] Job ${job.id} failed:`, error);
      throw error; // Re-throw to mark job as failed
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs
      duration: 1000, // Per second (Xero rate limit consideration)
    },
  }
);

  // Worker event listeners
  xeroSyncWorker.on('completed', (job) => {
    console.log(`[Xero Sync Worker] Job ${job.id} completed successfully`);
  });

  xeroSyncWorker.on('failed', (job, err) => {
    console.error(`[Xero Sync Worker] Job ${job?.id} failed:`, err);
  });

  xeroSyncWorker.on('error', (err) => {
    console.error('[Xero Sync Worker] Worker error:', err);
  });
} catch (error) {
  console.warn('[Queue] Failed to initialize worker. Redis may not be available. Xero syncs will not work until Redis is configured.');
  xeroSyncWorker = null as any;
}

export { xeroSyncWorker };

// Export helper function to add jobs to queue
export async function addXeroSyncJob(type: string, data: any) {
  if (!xeroSyncQueue) {
    throw new Error('Queue not initialized. Please ensure Redis is running and configured.');
  }
  return await xeroSyncQueue.add(type, { type, data });
}
