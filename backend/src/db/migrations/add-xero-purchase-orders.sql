-- Add Purchase Orders table
CREATE TABLE IF NOT EXISTS xero_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_po_id VARCHAR(100) UNIQUE,
  po_number VARCHAR(50),
  supplier_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'BILLED', 'CANCELLED')),
  date DATE NOT NULL,
  delivery_date DATE,
  total_amount DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  line_items JSONB,
  bill_id UUID, -- References xero_bills(id) when converted
  notes TEXT,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add Purchase Order Line Items table for detailed tracking
CREATE TABLE IF NOT EXISTS xero_purchase_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES xero_purchase_orders(id) ON DELETE CASCADE,
  description TEXT,
  quantity DECIMAL(10,2),
  unit_amount DECIMAL(15,2),
  account_code VARCHAR(50),
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  item_id UUID, -- References xero_items(id) when items table exists
  line_amount DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add Bills table
CREATE TABLE IF NOT EXISTS xero_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_bill_id VARCHAR(100) UNIQUE,
  bill_number VARCHAR(50),
  supplier_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES xero_purchase_orders(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  amount DECIMAL(15,2) NOT NULL,
  amount_paid DECIMAL(15,2) DEFAULT 0,
  amount_due DECIMAL(15,2),
  currency VARCHAR(10) DEFAULT 'USD',
  date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'AUTHORISED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED')),
  paid_date DATE,
  line_items JSONB,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add Expenses table
CREATE TABLE IF NOT EXISTS xero_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_expense_id VARCHAR(100) UNIQUE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  amount DECIMAL(15,2) NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  receipt_url TEXT,
  status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID')),
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update projects table to add PO commitments tracking
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS po_commitments DECIMAL(15,2) DEFAULT 0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_project_id ON xero_purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_supplier_id ON xero_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_status ON xero_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_date ON xero_purchase_orders(date);
CREATE INDEX IF NOT EXISTS idx_xero_po_line_items_po_id ON xero_purchase_order_line_items(po_id);
CREATE INDEX IF NOT EXISTS idx_xero_po_line_items_cost_center_id ON xero_purchase_order_line_items(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_supplier_id ON xero_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_purchase_order_id ON xero_bills(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_project_id ON xero_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_status ON xero_bills(status);
CREATE INDEX IF NOT EXISTS idx_xero_expenses_project_id ON xero_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_xero_expenses_cost_center_id ON xero_expenses(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_xero_expenses_date ON xero_expenses(date);

