-- Add soft delete support (deleted_at columns) to main tables
-- This migration adds deleted_at columns to support soft deletes

-- Clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Timesheets table
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Xero-related tables
ALTER TABLE xero_invoices 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE xero_purchase_orders 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE xero_bills 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE xero_expenses 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE xero_quotes 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE xero_payments 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE xero_credit_notes 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Create indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_timesheets_deleted_at ON timesheets(deleted_at);
CREATE INDEX IF NOT EXISTS idx_xero_invoices_deleted_at ON xero_invoices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_deleted_at ON xero_purchase_orders(deleted_at);
