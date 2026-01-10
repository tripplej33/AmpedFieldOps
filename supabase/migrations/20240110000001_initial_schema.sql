-- Initial Schema Migration for AmpedFieldOps
-- This migration creates the core business tables
-- Note: users table is replaced by Supabase Auth (auth.users)

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Activity Types table
CREATE TABLE IF NOT EXISTS activity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50) NOT NULL DEFAULT 'Wrench',
  color VARCHAR(100) NOT NULL DEFAULT 'bg-electric/20 border-electric text-electric',
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cost Centers table
CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  budget DECIMAL(15,2) DEFAULT 0,
  xero_tracking_category_id VARCHAR(100),
  client_po_number VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  location VARCHAR(255),
  billing_address TEXT,
  billing_email VARCHAR(255),
  xero_contact_id VARCHAR(100),
  client_type VARCHAR(20) DEFAULT 'customer' CHECK (client_type IN ('customer', 'supplier', 'both')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'quoted' CHECK (status IN ('quoted', 'in-progress', 'completed', 'invoiced', 'paid')),
  budget DECIMAL(15,2) DEFAULT 0,
  actual_cost DECIMAL(15,2) DEFAULT 0,
  po_commitments DECIMAL(15,2) DEFAULT 0,
  description TEXT,
  start_date DATE,
  end_date DATE,
  xero_project_id VARCHAR(100),
  files TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project Cost Centers junction table
CREATE TABLE IF NOT EXISTS project_cost_centers (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, cost_center_id)
);

-- Timesheets table
-- Note: user_id references auth.users(id) instead of users(id)
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  activity_type_id UUID REFERENCES activity_types(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  notes TEXT,
  image_urls TEXT[],
  location VARCHAR(255),
  synced BOOLEAN DEFAULT false,
  xero_timesheet_id VARCHAR(100),
  billing_status VARCHAR(20) DEFAULT 'unbilled' CHECK (billing_status IN ('unbilled', 'billed', 'paid')),
  invoice_id UUID, -- Will reference xero_invoices after it's created
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
-- Note: user_id references auth.users(id)
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,
  value TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key, user_id)
);

-- Activity Logs table
-- Note: user_id references auth.users(id)
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table (defines available permissions)
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  is_custom BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User permissions table
-- Note: user_id references auth.users(id)
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, permission)
);

-- Enable Row Level Security on all tables
ALTER TABLE activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
