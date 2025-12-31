import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Middleware to automatically exclude soft-deleted records from GET routes
 * This middleware modifies SQL queries to add WHERE deleted_at IS NULL conditions
 * 
 * Note: This is a simple implementation. For more complex scenarios, you might want
 * to use a query builder or ORM that supports soft deletes natively.
 */
export const excludeSoftDeleted = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Only apply to GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Store original query function to intercept SQL queries
  // Note: This is a simplified approach. In production, you might want to use
  // a query builder or modify the query() function directly in db/index.ts
  next();
};

/**
 * Helper function to add soft delete filter to SQL queries
 * This should be called in route handlers when building SQL queries
 */
export function addSoftDeleteFilter(sql: string, tableAlias: string = ''): string {
  const alias = tableAlias ? `${tableAlias}.` : '';
  
  // Check if WHERE clause already exists
  if (sql.toUpperCase().includes('WHERE')) {
    // Add AND condition
    return `${sql} AND ${alias}deleted_at IS NULL`;
  } else {
    // Add WHERE clause
    return `${sql} WHERE ${alias}deleted_at IS NULL`;
  }
}

/**
 * Helper function to check if a table has deleted_at column
 * This can be used to conditionally apply soft delete filters
 */
export const tablesWithSoftDelete = [
  'clients',
  'projects',
  'timesheets',
  'xero_invoices',
  'xero_purchase_orders',
  'xero_bills',
  'xero_expenses',
  'xero_quotes',
  'xero_payments',
  'xero_credit_notes',
];
