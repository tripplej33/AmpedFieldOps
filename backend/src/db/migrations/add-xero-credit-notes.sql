-- Add Credit Notes table
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_invoice_id ON xero_credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_date ON xero_credit_notes(date);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_status ON xero_credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_xero_credit_note_id ON xero_credit_notes(xero_credit_note_id);

