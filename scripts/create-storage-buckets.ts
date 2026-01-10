/**
 * Script to create Supabase Storage buckets
 * 
 * Run this script after Supabase is set up to create the required storage buckets.
 * 
 * Usage:
 *   npx tsx scripts/create-storage-buckets.ts
 * 
 * Or via Supabase CLI:
 *   supabase storage create project-files
 *   supabase storage create timesheet-images
 *   supabase storage create safety-documents
 *   supabase storage create logos
 *   supabase storage create document-scans
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const buckets = [
  {
    name: 'project-files',
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      'image/*',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.*',
      'text/*',
    ],
  },
  {
    name: 'timesheet-images',
    public: false,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['image/*'],
  },
  {
    name: 'safety-documents',
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: ['application/pdf', 'image/*'],
  },
  {
    name: 'logos',
    public: true, // Logos are typically public
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ['image/*'],
  },
  {
    name: 'document-scans',
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: ['image/*', 'application/pdf'],
  },
];

async function createBucket(bucket: typeof buckets[0]) {
  try {
    const { data, error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log(`✓ Bucket "${bucket.name}" already exists`);
        return;
      }
      throw error;
    }

    console.log(`✓ Created bucket "${bucket.name}"`);
  } catch (error: any) {
    console.error(`✗ Failed to create bucket "${bucket.name}":`, error.message);
  }
}

async function main() {
  console.log('Creating Supabase Storage buckets...\n');

  for (const bucket of buckets) {
    await createBucket(bucket);
  }

  console.log('\n✓ Storage bucket setup complete!');
  console.log('\nNote: You may need to configure Storage RLS policies via Supabase Dashboard or API.');
}

main().catch(console.error);
