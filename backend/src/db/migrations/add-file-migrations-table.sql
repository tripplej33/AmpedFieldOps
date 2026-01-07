-- Migration: Add file_migrations table for tracking file migration progress
-- This table tracks the migration of files from old filesystem paths to new storage provider paths

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

CREATE INDEX IF NOT EXISTS idx_file_migrations_file_id ON file_migrations(file_id);
CREATE INDEX IF NOT EXISTS idx_file_migrations_status ON file_migrations(status);
CREATE INDEX IF NOT EXISTS idx_file_migrations_entity ON file_migrations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_migrations_source_path ON file_migrations(source_path);
CREATE INDEX IF NOT EXISTS idx_file_migrations_destination_path ON file_migrations(destination_path);

COMMENT ON TABLE file_migrations IS 'Tracks migration of files from old filesystem paths to new storage provider paths';
COMMENT ON COLUMN file_migrations.file_id IS 'References project_files.id if applicable, NULL for timesheet images';
COMMENT ON COLUMN file_migrations.entity_type IS 'Type of entity: project_file, timesheet_image, safety_document, logo, favicon';
COMMENT ON COLUMN file_migrations.entity_id IS 'ID of the entity (project_file.id, timesheet.id, etc.)';
COMMENT ON COLUMN file_migrations.source_path IS 'Original file path before migration';
COMMENT ON COLUMN file_migrations.destination_path IS 'New partitioned path in storage provider';
COMMENT ON COLUMN file_migrations.status IS 'Migration status: pending, in_progress, completed, failed';
COMMENT ON COLUMN file_migrations.checksum IS 'SHA-256 hash of file for verification';
