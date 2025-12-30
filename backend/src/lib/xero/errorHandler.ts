/**
 * Xero API Error Handler
 * 
 * Parses and handles Xero API errors according to their documentation
 */

export interface XeroApiError {
  error: string;
  error_description?: string;
  message?: string;
  validationErrors?: Array<{
    message: string;
    field?: string;
  }>;
  statusCode?: number;
  originalError?: any;
}

/**
 * Parse Xero API error response
 */
export async function parseXeroError(response: Response): Promise<XeroApiError> {
  const statusCode = response.status;
  let errorData: any = {};

  try {
    const text = await response.text();
    if (text) {
      errorData = JSON.parse(text);
    }
  } catch (e) {
    // If response isn't JSON, use status text
    errorData = { message: response.statusText || 'Unknown error' };
  }

  const error: XeroApiError = {
    error: errorData.error || errorData.Message || 'Unknown error',
    error_description: errorData.error_description || errorData.message || errorData.Message,
    message: errorData.message || errorData.Message || errorData.error_description,
    statusCode,
    originalError: errorData
  };

  // Parse validation errors if present
  if (errorData.Elements && Array.isArray(errorData.Elements)) {
    error.validationErrors = errorData.Elements
      .filter((el: any) => el.ValidationErrors && Array.isArray(el.ValidationErrors))
      .flatMap((el: any) => 
        el.ValidationErrors.map((ve: any) => ({
          message: ve.Message || ve.message || 'Validation error',
          field: ve.FieldName || ve.fieldName
        }))
      );
  } else if (errorData.ValidationErrors && Array.isArray(errorData.ValidationErrors)) {
    error.validationErrors = errorData.ValidationErrors.map((ve: any) => ({
      message: ve.Message || ve.message || 'Validation error',
      field: ve.FieldName || ve.fieldName
    }));
  }

  return error;
}

/**
 * Get user-friendly error message from Xero error
 */
export function getErrorMessage(error: XeroApiError): string {
  if (error.statusCode === 401) {
    return 'Authentication failed. Please reconnect to Xero.';
  }
  
  if (error.statusCode === 403) {
    return 'Access denied. Check your Xero app permissions.';
  }
  
  if (error.statusCode === 429) {
    return 'Rate limit exceeded. Please try again in a moment.';
  }
  
  if (error.statusCode === 400) {
    if (error.validationErrors && error.validationErrors.length > 0) {
      const validationMessages = error.validationErrors.map(ve => 
        ve.field ? `${ve.field}: ${ve.message}` : ve.message
      ).join(', ');
      return `Validation error: ${validationMessages}`;
    }
    return error.message || error.error_description || 'Invalid request';
  }
  
  if (error.statusCode === 404) {
    return 'Resource not found in Xero.';
  }
  
  if (error.statusCode === 500 || error.statusCode === 502 || error.statusCode === 503) {
    return 'Xero API is temporarily unavailable. Please try again later.';
  }

  return error.message || error.error_description || error.error || 'Unknown error occurred';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: XeroApiError): boolean {
  if (!error.statusCode) return true; // Network errors are retryable
  
  // Retry on server errors and rate limits
  return error.statusCode === 429 || 
         error.statusCode === 500 || 
         error.statusCode === 502 || 
         error.statusCode === 503 ||
         error.statusCode === 504;
}

