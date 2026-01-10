-- File Management Tables Migration
-- Tables for project files, safety documents, OCR processing, and backups

-- Project Files table
-- Note: uploaded_by references auth.users(id)
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Safety Documents table
-- Note: created_by and approved_by reference auth.users(id)
CREATE TABLE IF NOT EXISTS safety_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('jsa', 'electrical_compliance', 'electrical_safety_certificate')),
  title VARCHAR(255) NOT NULL,
  data JSONB NOT NULL,
  file_path VARCHAR(500),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'approved')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document Scans table (for OCR processing)
-- Note: user_id references auth.users(id)
CREATE TABLE IF NOT EXISTS document_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES project_files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  document_type VARCHAR(50) CHECK (document_type IN ('receipt', 'invoice', 'purchase_order', 'bill', 'expense', 'unknown')),
  extracted_data JSONB,
  confidence DECIMAL(3,2),
  error_message TEXT,
  xero_attachment_id VARCHAR(100),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document Matches table (suggested matches between scans and records)
-- Note: confirmed_by references auth.users(id)
CREATE TABLE IF NOT EXISTS document_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES document_scans(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) CHECK (entity_type IN ('purchase_order', 'invoice', 'bill', 'expense')),
  entity_id UUID,
  confidence_score DECIMAL(3,2),
  match_reasons JSONB,
  confirmed BOOLEAN DEFAULT false,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- File Migrations table (for tracking file migration to storage abstraction layer)
CREATE TABLE IF NOT EXISTS file_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID, -- References project_files.id or NULL for timesheet images
  entity_type VARCHAR(50) NOT NULL, -- 'project_file', 'timesheet_image', 'safety_document', 'logo', etc.
  entity_id UUID, -- ID of the entity (project_file.id, timesheet.id, safety_document.id, etc.)
  source_path VARCHAR(500) NOT NULL, -- Original file path (e.g., /uploads/projects/...)
  destination_path VARCHAR(500) NOT NULL, -- New partitioned path in storage provider
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error_message TEXT,
  file_size BIGINT,
  checksum VARCHAR(64), -- Optional: SHA-256 hash for verification
  migrated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backups table (for tracking backup operations)
-- Note: created_by references auth.users(id)
CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type VARCHAR(50) NOT NULL CHECK (backup_type IN ('full', 'database', 'files')),
  storage_type VARCHAR(50) NOT NULL CHECK (storage_type IN ('local', 'google_drive')),
  file_path TEXT,
  file_size BIGINT,
  google_drive_file_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- Add scanned_document_id foreign keys to Xero tables (now that document_scans exists)
ALTER TABLE xero_purchase_orders 
  ADD COLUMN IF NOT EXISTS scanned_document_id UUID REFERENCES document_scans(id) ON DELETE SET NULL;
ALTER TABLE xero_invoices 
  ADD COLUMN IF NOT EXISTS scanned_document_id UUID REFERENCES document_scans(id) ON DELETE SET NULL;
ALTER TABLE xero_bills 
  ADD COLUMN IF NOT EXISTS scanned_document_id UUID REFERENCES document_scans(id) ON DELETE SET NULL;
ALTER TABLE xero_expenses 
  ADD COLUMN IF NOT EXISTS scanned_document_id UUID REFERENCES document_scans(id) ON DELETE SET NULL;

-- Enable Row Level Security on all file management tables
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
