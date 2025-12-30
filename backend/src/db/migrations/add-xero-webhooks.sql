-- Add Webhook Events table
CREATE TABLE IF NOT EXISTS xero_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_xero_webhook_events_event_type ON xero_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_xero_webhook_events_processed ON xero_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_xero_webhook_events_created_at ON xero_webhook_events(created_at);

