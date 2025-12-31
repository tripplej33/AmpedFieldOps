-- Create sync_logs table to store audit trail for all Xero API calls
-- This table tracks every call to XeroLib integration library

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- e.g., 'invoice', 'purchase_order', 'timesheet'
  entity_id UUID NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  status_code INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity_type ON sync_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity_id ON sync_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status_code ON sync_logs(status_code);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity_lookup ON sync_logs(entity_type, entity_id, created_at DESC);
