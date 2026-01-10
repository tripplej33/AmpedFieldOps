# Supabase Storage Setup Guide

This guide explains how to set up Supabase Storage buckets for the AmpedFieldOps application.

## Storage Buckets Required

The application requires the following storage buckets:

1. **project-files** - For project-related files (private)
2. **timesheet-images** - For timesheet photos (private)
3. **safety-documents** - For safety documents like JSA and compliance certificates (private)
4. **logos** - For company logos and branding (public)
5. **document-scans** - For scanned documents used in OCR processing (private)

## Setup Methods

### Method 1: Using Supabase CLI (Recommended)

```bash
# Create each bucket
supabase storage create project-files
supabase storage create timesheet-images
supabase storage create safety-documents
supabase storage create logos
supabase storage create document-scans
```

### Method 2: Using the Setup Script

```bash
# Make sure environment variables are set
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Run the script
npx tsx scripts/create-storage-buckets.ts
```

### Method 3: Using Supabase Dashboard

1. Navigate to your Supabase project dashboard
2. Go to Storage section
3. Click "New bucket"
4. Create each bucket with the following settings:

#### project-files
- Name: `project-files`
- Public: No
- File size limit: 50MB
- Allowed MIME types: `image/*`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`, `text/*`

#### timesheet-images
- Name: `timesheet-images`
- Public: No
- File size limit: 10MB
- Allowed MIME types: `image/*`

#### safety-documents
- Name: `safety-documents`
- Public: No
- File size limit: 50MB
- Allowed MIME types: `application/pdf`, `image/*`

#### logos
- Name: `logos`
- Public: Yes
- File size limit: 5MB
- Allowed MIME types: `image/*`

#### document-scans
- Name: `document-scans`
- Public: No
- File size limit: 50MB
- Allowed MIME types: `image/*`, `application/pdf`

## Storage Policies

After creating the buckets, you need to set up Row Level Security (RLS) policies for storage access. These policies control who can read, write, and delete files.

### Example Policies (via Supabase Dashboard or SQL)

```sql
-- Allow authenticated users to upload files to their project folders
CREATE POLICY "Users can upload project files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[1] = 'projects' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to read files from projects they have access to
CREATE POLICY "Users can read project files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files' AND
  -- Add your project access logic here
  true -- Placeholder - implement proper access control
);

-- Allow users to delete their own uploaded files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('project-files', 'timesheet-images') AND
  auth.uid()::text = owner
);
```

**Note:** For production, implement proper RLS policies based on your project access control logic. The policies above are examples and should be customized to match your application's security requirements.

## Verification

After setup, verify the buckets exist:

```bash
# List all buckets
supabase storage list

# Or via Supabase Dashboard
# Navigate to Storage section and verify all buckets are listed
```

## Migration from Existing Storage

If you're migrating from an existing storage system (local/S3/Google Drive), you'll need to:

1. Export files from the current storage
2. Upload them to the appropriate Supabase Storage buckets
3. Update file paths in the database to point to Supabase Storage URLs

A migration script can be created to automate this process if needed.
