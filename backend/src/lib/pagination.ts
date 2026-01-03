/**
 * Pagination utility functions
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationResult;
}

/**
 * Parse pagination parameters from query string
 * @param query - Express request query object
 * @param defaultLimit - Default items per page (default: 20)
 * @param maxLimit - Maximum items per page (default: 100)
 * @returns Normalized pagination parameters
 */
export function parsePaginationParams(
  query: any,
  defaultLimit = PAGINATION_CONSTANTS.DEFAULT_LIMIT,
  maxLimit = PAGINATION_CONSTANTS.MAX_LIMIT
): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  let limit = parseInt(query.limit as string) || defaultLimit;
  
  // Enforce maximum limit
  if (limit > maxLimit) {
    limit = maxLimit;
  }
  
  // Ensure limit is at least 1
  if (limit < 1) {
    limit = defaultLimit;
  }
  
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
}

/**
 * Create pagination metadata
 * @param total - Total number of items
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Pagination metadata
 */
export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationResult {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Create a paginated response
 * @param data - Array of items for current page
 * @param total - Total number of items
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Paginated response object
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: createPaginationMeta(total, page, limit),
  };
}
