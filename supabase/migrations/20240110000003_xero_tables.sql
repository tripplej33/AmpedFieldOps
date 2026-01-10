-- Xero Integration Tables Migration
-- All tables related to Xero accounting integration

-- Xero Tokens table
CREATE TABLE IF NOT EXISTS xero_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  id_token TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  tenant_id VARCHAR(100),
  tenant_name VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Xero Invoices table (cached from Xero)
CREATE TABLE IF NOT EXISTS xero_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_invoice_id VARCHAR(100) UNIQUE NOT NULL,
  invoice_number VARCHAR(50),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status VARCHAR(50),
  amount_due DECIMAL(15,2),
  amount_paid DECIMAL(15,2),
  total DECIMAL(15,2),
  currency VARCHAR(10) DEFAULT 'USD',
  issue_date DATE,
  due_date DATE,
  last_payment_date DATE,
  reference VARCHAR(500),
  line_items JSONB,
  synced_at TIMESTAMP,
  scanned_document_id UUID, -- Will reference document_scans after it's created
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add invoice_id foreign key to timesheets
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL;

-- Xero Quotes table (cached from Xero)
CREATE TABLE IF NOT EXISTS xero_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_quote_id VARCHAR(100) UNIQUE NOT NULL,
  quote_number VARCHAR(50),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status VARCHAR(50),
  total DECIMAL(15,2),
  currency VARCHAR(10) DEFAULT 'USD',
  issue_date DATE,
  expiry_date DATE,
  line_items JSONB,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Xero Purchase Orders table
CREATE TABLE IF NOT EXISTS xero_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_po_id VARCHAR(100) UNIQUE,
  po_number VARCHAR(50),
  supplier_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'BILLED', 'CANCELLED')),
  date DATE NOT NULL,
  delivery_date DATE,
  total_amount DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  line_items JSONB,
  bill_id UUID,
  notes TEXT,
  scanned_document_id UUID, -- Will reference document_scans after it's created
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Order Line Items table
CREATE TABLE IF NOT EXISTS xero_purchase_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES xero_purchase_orders(id) ON DELETE CASCADE,
  description TEXT,
  quantity DECIMAL(10,2),
  unit_amount DECIMAL(15,2),
  account_code VARCHAR(50),
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  item_id UUID,
  line_amount DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Xero Bills table
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
  scanned_document_id UUID, -- Will reference document_scans after it's created
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Xero Expenses table
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
  scanned_document_id UUID, -- Will reference document_scans after it's created
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Xero Payments table
CREATE TABLE IF NOT EXISTS xero_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_payment_id VARCHAR(100) UNIQUE,
  invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  reference VARCHAR(255),
  bank_transaction_id UUID,
  account_code VARCHAR(50),
  currency VARCHAR(10) DEFAULT 'USD',
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank Transactions table
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_bank_transaction_id VARCHAR(100) UNIQUE,
  bank_account_code VARCHAR(50),
  bank_account_name VARCHAR(255),
  date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('RECEIVE', 'SPEND')),
  description TEXT,
  reference VARCHAR(255),
  contact_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  reconciled BOOLEAN DEFAULT false,
  payment_id UUID REFERENCES xero_payments(id) ON DELETE SET NULL,
  reconciled_date DATE,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Xero Credit Notes table
CREATE TABLE IF NOT EXISTS xero_credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_credit_note_id VARCHAR(100) UNIQUE,
  credit_note_number VARCHAR(50),
  invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL,
  amount DECIMAL(15,2) NOT NULL,
  date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'AUTHORISED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'VOIDED')),
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security on all Xero tables
ALTER TABLE xero_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_purchase_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_credit_notes ENABLE ROW LEVEL SECURITY;
