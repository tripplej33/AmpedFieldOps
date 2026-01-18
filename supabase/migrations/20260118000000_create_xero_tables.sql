-- Xero Integration Tables
-- Created: 2026-01-18
-- Phase 1: OAuth tokens + invoice storage

-- OAuth tokens table
CREATE TABLE xero_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  organization_id text,  -- Xero tenant ID (not a UUID)
  organization_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Enable RLS
ALTER TABLE xero_auth ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only see their own tokens
CREATE POLICY "xero_auth_self" ON xero_auth
  FOR ALL USING (auth.uid() = user_id);

-- Create index for frequent queries
CREATE INDEX idx_xero_auth_user ON xero_auth(user_id);
CREATE INDEX idx_xero_auth_expires ON xero_auth(expires_at);

-- Invoices table
CREATE TABLE xero_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_id text NOT NULL UNIQUE,
  invoice_number text NOT NULL,
  client_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  status text,  -- DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  type text,    -- ACCREC (sales), ACCPAY (bills)
  total decimal(12,2),
  amount_due decimal(12,2),
  amount_paid decimal(12,2),
  issued_date date,
  due_date date,
  currency_code text DEFAULT 'NZD',
  line_items jsonb,
  synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE xero_invoices ENABLE ROW LEVEL SECURITY;

-- RLS policy: All users can read invoices (they're company-wide data)
CREATE POLICY "xero_invoices_read" ON xero_invoices
  FOR SELECT USING (true);

-- RLS policy: Only admins/finance can write
CREATE POLICY "xero_invoices_write" ON xero_invoices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'finance')
    )
  );

CREATE INDEX idx_xero_invoices_number ON xero_invoices(invoice_number);
CREATE INDEX idx_xero_invoices_status ON xero_invoices(status);
CREATE INDEX idx_xero_invoices_synced ON xero_invoices(synced_at);
CREATE INDEX idx_xero_invoices_client ON xero_invoices(client_id);
CREATE INDEX idx_xero_invoices_project ON xero_invoices(project_id);
