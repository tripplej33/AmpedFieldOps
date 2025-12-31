import { query } from '../../db';

/**
 * Wraps Xero API calls with audit trail logging
 * Every call to XeroLib integration library should be wrapped with this function
 * 
 * @param entityType - Type of entity being synced (e.g., 'invoice', 'purchase_order')
 * @param entityId - UUID of the entity in the local database
 * @param apiCall - Async function that makes the Xero API call
 * @returns The result of the API call
 */
export async function withAuditTrail<T>(
  entityType: string,
  entityId: string,
  apiCall: () => Promise<{ response: Response; data?: any }>
): Promise<T> {
  let requestPayload: any = null;
  let responsePayload: any = null;
  let statusCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    // Execute the API call
    const result = await apiCall();
    
    // Extract response details
    const response = result.response;
    statusCode = response.status;
    responsePayload = result.data || {};

    // Log successful sync
    await logSyncAttempt(
      entityType,
      entityId,
      requestPayload,
      responsePayload,
      statusCode,
      errorMessage
    );

    return result.data as T;
  } catch (error: any) {
    // Extract error details
    errorMessage = error.message || 'Unknown error';
    statusCode = error.statusCode || error.status || 500;

    // Try to extract response if available
    if (error.response) {
      try {
        responsePayload = await error.response.json();
      } catch {
        responsePayload = { error: errorMessage };
      }
      statusCode = error.response.status || statusCode;
    } else {
      responsePayload = { error: errorMessage };
    }

    // Log failed sync
    await logSyncAttempt(
      entityType,
      entityId,
      requestPayload,
      responsePayload,
      statusCode,
      errorMessage
    );

    // Re-throw the error
    throw error;
  }
}

/**
 * Internal function to log sync attempts to sync_logs table
 */
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
        requestPayload ? JSON.stringify(requestPayload) : null,
        responsePayload ? JSON.stringify(responsePayload) : null,
        statusCode,
        errorMessage,
      ]
    );
  } catch (error) {
    console.error('Failed to log sync attempt:', error);
    // Don't throw - logging failures shouldn't break the sync
  }
}

// Type for Response (matching fetch Response)
interface Response {
  status: number;
  ok: boolean;
  json(): Promise<any>;
}
