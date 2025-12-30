import { query, getClient } from './index';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const isFresh = process.argv.includes('--fresh');

const migrations = `
-- Drop tables if fresh migration
${isFresh ? `
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS xero_tokens CASCADE;
DROP TABLE IF EXISTS timesheets CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS cost_centers CASCADE;
DROP TABLE IF EXISTS activity_types CASCADE;
DROP TABLE IF EXISTS user_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
` : ''}

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  avatar VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, permission)
);

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
  status VARCHAR(20) DEFAULT 'quoted' CHECK (status IN ('quoted', 'in-progress', 'completed', 'invoiced')),
  budget DECIMAL(15,2) DEFAULT 0,
  actual_cost DECIMAL(15,2) DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,
  value TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key, user_id)
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
  line_items JSONB,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Add invoice_id column to timesheets after xero_invoices table exists
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL;

-- Activity Logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_timesheets_user_id ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_project_id ON timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(date);
CREATE INDEX IF NOT EXISTS idx_timesheets_billing_status ON timesheets(billing_status);
CREATE INDEX IF NOT EXISTS idx_timesheets_invoice_id ON timesheets(invoice_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_clients_search ON clients USING gin(to_tsvector('english', name || ' ' || COALESCE(contact_name, '') || ' ' || COALESCE(address, '')));
CREATE INDEX IF NOT EXISTS idx_projects_search ON projects USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_timesheets_search ON timesheets USING gin(to_tsvector('english', COALESCE(notes, '')));
`;

async function runMigration() {
  console.log('🔄 Running database migrations...');
  
  try {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Run main migrations
      await client.query(migrations);
      
      // Run additional migration files from migrations directory
      const migrationsDir = path.join(__dirname, 'migrations');
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs.readdirSync(migrationsDir)
          .filter(file => file.endsWith('.sql'))
          .sort(); // Run in alphabetical order
        
        for (const file of migrationFiles) {
          const filePath = path.join(migrationsDir, file);
          const sql = fs.readFileSync(filePath, 'utf8');
          try {
            console.log(`  Running migration: ${file}`);
            await client.query(sql);
          } catch (err: any) {
            console.error(`  ❌ Error in migration ${file}:`, err.message);
            // If it's a "already exists" error, it's usually safe to continue
            // since we use IF NOT EXISTS everywhere
            if (err.code === '42P07' || err.code === '23505') {
              console.log(`  ⚠️  Migration ${file} skipped (object already exists)`);
              continue;
            }
            throw err;
          }
        }
      }
      
      await client.query('COMMIT');
      console.log('✅ Migrations completed successfully!');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

runMigration();
