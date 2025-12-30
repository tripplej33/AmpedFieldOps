-- Add Xero Items table
CREATE TABLE IF NOT EXISTS xero_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_item_id VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  purchase_price DECIMAL(15,2) DEFAULT 0,
  sale_price DECIMAL(15,2) DEFAULT 0,
  stock_level DECIMAL(10,2) DEFAULT 0,
  is_tracked BOOLEAN DEFAULT false,
  inventory_asset_account_code VARCHAR(50),
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_xero_items_code ON xero_items(code);
CREATE INDEX IF NOT EXISTS idx_xero_items_name ON xero_items(name);
CREATE INDEX IF NOT EXISTS idx_xero_items_is_tracked ON xero_items(is_tracked);
CREATE INDEX IF NOT EXISTS idx_xero_items_xero_item_id ON xero_items(xero_item_id);

