-- Create Supabase Storage buckets for file management
-- Note: Storage buckets are created via Supabase Storage API, not SQL
-- This migration documents the bucket structure and policies

-- Storage buckets to create (via Supabase Dashboard or API):
-- 1. 'project-files' - For project-related files
-- 2. 'timesheet-images' - For timesheet photos
-- 3. 'safety-documents' - For safety documents (JSA, compliance certificates)
-- 4. 'logos' - For company logos and branding
-- 5. 'document-scans' - For scanned documents (OCR processing)

-- Storage policies will be managed via RLS on storage.objects
-- Policies are created via Supabase Dashboard or Storage API

-- Note: For self-hosted Supabase, buckets can be created via:
-- 1. Supabase Dashboard (Storage section)
-- 2. Supabase CLI: supabase storage create <bucket-name>
-- 3. Storage API: POST /storage/v1/bucket

-- Example bucket creation (run via Supabase Dashboard or API):
-- {
--   "name": "project-files",
--   "public": false,
--   "file_size_limit": 52428800,  -- 50MB
--   "allowed_mime_types": ["image/*", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.*"]
-- }

-- Storage RLS policies will be created via Supabase Dashboard or Storage API
-- Policies should allow:
-- - Users to upload files to their own project folders
-- - Users to read files from projects they have access to
-- - Admins/managers to access all files
