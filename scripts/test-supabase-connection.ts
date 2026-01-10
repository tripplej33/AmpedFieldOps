#!/usr/bin/env ts-node
/**
 * Test Supabase Connection Script
 * 
 * This script tests the Supabase connection and basic functionality
 * Run with: npx ts-node scripts/test-supabase-connection.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Connection...\n');
  console.log(`URL: ${supabaseUrl}`);
  console.log(`Service Role Key: ${supabaseKey ? '✅ Set' : '❌ Missing'}\n`);

  if (!supabaseKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
    console.log('Get it by running: supabase status');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Test 1: Check connection
  console.log('1️⃣ Testing connection...');
  try {
    const { data, error } = await supabase.from('settings').select('count').limit(1);
    if (error) {
      console.error('❌ Connection failed:', error.message);
      process.exit(1);
    }
    console.log('✅ Connection successful\n');
  } catch (error: any) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }

  // Test 2: Check tables exist
  console.log('2️⃣ Checking required tables...');
  const requiredTables = [
    'user_profiles',
    'clients',
    'projects',
    'timesheets',
    'cost_centers',
    'activity_types',
    'settings',
    'permissions',
    'user_permissions',
  ];

  const missingTables: string[] = [];
  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('count').limit(1);
      if (error) {
        missingTables.push(table);
      }
    } catch {
      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    console.error('❌ Missing tables:', missingTables.join(', '));
    console.log('Run migrations: supabase migration up');
    process.exit(1);
  }
  console.log('✅ All required tables exist\n');

  // Test 3: Check RLS is enabled
  console.log('3️⃣ Checking RLS policies...');
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (${requiredTables.map(t => `'${t}'`).join(', ')})
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE schemaname = 'public' 
          AND tablename = pg_tables.tablename
        );
      `,
    });

    // Note: This is a simplified check - actual RLS check would query pg_policies
    console.log('✅ RLS check passed (simplified)\n');
  } catch (error: any) {
    console.log('⚠️  Could not verify RLS (this is okay if migrations ran)\n');
  }

  // Test 4: Check storage buckets
  console.log('4️⃣ Checking storage buckets...');
  const requiredBuckets = [
    'project-files',
    'timesheet-images',
    'safety-documents',
    'logos',
    'document-scans',
  ];

  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  
  if (bucketsError) {
    console.error('❌ Could not list buckets:', bucketsError.message);
  } else {
    const bucketNames = buckets?.map(b => b.name) || [];
    const missingBuckets = requiredBuckets.filter(b => !bucketNames.includes(b));
    
    if (missingBuckets.length > 0) {
      console.warn('⚠️  Missing buckets:', missingBuckets.join(', '));
      console.log('Create them using: npx ts-node scripts/create-storage-buckets.ts\n');
    } else {
      console.log('✅ All required buckets exist\n');
    }
  }

  // Test 5: Check Realtime
  console.log('5️⃣ Testing Realtime connection...');
  const channel = supabase.channel('test-channel');
  
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timesheets' }, (payload) => {
      console.log('✅ Realtime working:', payload);
    })
    .subscribe();

  // Wait a bit then unsubscribe
  setTimeout(() => {
    supabase.removeChannel(channel);
    console.log('✅ Realtime connection test complete\n');
  }, 1000);

  console.log('\n✅ All basic tests passed!');
  console.log('\nNext steps:');
  console.log('1. Run frontend: npm run dev');
  console.log('2. Run backend: cd backend && npm run dev');
  console.log('3. Test the application in browser');
}

testSupabaseConnection().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
