-- Make project_id nullable in xero_purchase_orders table
-- This allows purchase orders to be imported without a project and linked later
ALTER TABLE xero_purchase_orders 
ALTER COLUMN project_id DROP NOT NULL;

