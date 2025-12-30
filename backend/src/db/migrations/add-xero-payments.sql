-- Add Xero Payments table
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

-- Add Bank Transactions table
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

-- Update xero_invoices table to add last_payment_date
ALTER TABLE xero_invoices 
ADD COLUMN IF NOT EXISTS last_payment_date DATE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_xero_payments_invoice_id ON xero_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_xero_payments_payment_date ON xero_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_xero_payments_xero_payment_id ON xero_payments(xero_payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(reconciled);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_payment_id ON bank_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_xero_bank_transaction_id ON bank_transactions(xero_bank_transaction_id);

