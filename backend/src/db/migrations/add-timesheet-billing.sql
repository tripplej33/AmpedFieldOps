-- Add billing status and invoice linking to timesheets
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'unbilled' CHECK (billing_status IN ('unbilled', 'billed', 'paid')),
ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL;

-- Create index for billing status queries
CREATE INDEX IF NOT EXISTS idx_timesheets_billing_status ON timesheets(billing_status);
CREATE INDEX IF NOT EXISTS idx_timesheets_invoice_id ON timesheets(invoice_id);

