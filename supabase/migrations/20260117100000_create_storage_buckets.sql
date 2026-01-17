-- Create storage buckets for AmpedFieldOps
-- Buckets: avatars, project-files, safety-documents
-- Each bucket has RLS policies for authenticated user access

-- ============================================
-- AVATARS BUCKET
-- ============================================

-- Create bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can upload their own avatar
CREATE POLICY "avatars_authenticated_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can view avatars
CREATE POLICY "avatars_authenticated_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can update their own avatar
CREATE POLICY "avatars_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can delete their own avatar
CREATE POLICY "avatars_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth.role() = 'authenticated'::text
  );

-- ============================================
-- PROJECT_FILES BUCKET
-- ============================================

-- Create bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  104857600, -- 100MB
  NULL -- allow all mime types
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload to projects
CREATE POLICY "project_files_authenticated_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-files'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can view project files
CREATE POLICY "project_files_authenticated_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-files'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can update their own files
CREATE POLICY "project_files_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-files'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can delete files they uploaded
CREATE POLICY "project_files_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-files'
    AND auth.role() = 'authenticated'::text
  );

-- ============================================
-- SAFETY_DOCUMENTS BUCKET
-- ============================================

-- Create bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'safety-documents',
  'safety-documents',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload safety documents
CREATE POLICY "safety_documents_authenticated_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'safety-documents'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can view safety documents
CREATE POLICY "safety_documents_authenticated_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'safety-documents'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can update documents
CREATE POLICY "safety_documents_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'safety-documents'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can delete documents
CREATE POLICY "safety_documents_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'safety-documents'
    AND auth.role() = 'authenticated'::text
  );

-- ============================================
-- TIMESHEET_IMAGES BUCKET
-- ============================================

-- Create bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'timesheet-images',
  'timesheet-images',
  false,
  10485760, -- 10MB per image
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload timesheet images
CREATE POLICY "timesheet_images_authenticated_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'timesheet-images'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can view timesheet images
CREATE POLICY "timesheet_images_authenticated_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'timesheet-images'
    AND auth.role() = 'authenticated'::text
  );

-- Policy: Authenticated users can delete their images
CREATE POLICY "timesheet_images_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'timesheet-images'
    AND auth.role() = 'authenticated'::text
  );
