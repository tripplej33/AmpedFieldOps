-- File Management and Safety Documents Migration

-- Project Files table
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_cost_center_id ON project_files(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_project_files_file_type ON project_files(file_type);

-- Safety Documents table
CREATE TABLE IF NOT EXISTS safety_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('jsa', 'electrical_compliance', 'electrical_safety_certificate')),
  title VARCHAR(255) NOT NULL,
  data JSONB NOT NULL,
  file_path VARCHAR(500),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'approved')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_safety_documents_project_id ON safety_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_safety_documents_cost_center_id ON safety_documents(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_safety_documents_type ON safety_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_safety_documents_status ON safety_documents(status);

