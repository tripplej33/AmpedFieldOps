-- Add sync status and xero_sync_id columns to support async Xero syncing
-- This migration adds sync tracking to timesheets, invoices, and purchase orders

-- Create sync_status enum type
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status_enum') THEN
    CREATE TYPE sync_status_enum AS ENUM ('pending', 'synced', 'failed');
  END IF;
END $$;

-- Timesheets table
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS sync_status sync_status_enum DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS xero_sync_id UUID NULL;

-- Xero Invoices table
ALTER TABLE xero_invoices 
ADD COLUMN IF NOT EXISTS sync_status sync_status_enum DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS xero_sync_id UUID NULL;

-- Xero Purchase Orders table
ALTER TABLE xero_purchase_orders 
ADD COLUMN IF NOT EXISTS sync_status sync_status_enum DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS xero_sync_id UUID NULL;

-- Create indexes for sync status queries
CREATE INDEX IF NOT EXISTS idx_timesheets_sync_status ON timesheets(sync_status);
CREATE INDEX IF NOT EXISTS idx_timesheets_xero_sync_id ON timesheets(xero_sync_id);
CREATE INDEX IF NOT EXISTS idx_xero_invoices_sync_status ON xero_invoices(sync_status);
CREATE INDEX IF NOT EXISTS idx_xero_invoices_xero_sync_id ON xero_invoices(xero_sync_id);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_sync_status ON xero_purchase_orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_xero_sync_id ON xero_purchase_orders(xero_sync_id);
