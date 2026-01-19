import { supabase } from '../db/supabase';

async function applyPhase1Migration() {
  if (!supabase) {
    console.error('❌ Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('\n🚀 Applying Phase 1 Schema Migration...\n');

  try {
    // Test 1: Try to select actual_cost from projects
    console.log('📋 Testing projects.actual_cost column...');
    const { data: projectsTest, error: projectsError } = await supabase
      .from('projects')
      .select('id, actual_cost')
      .limit(1);

    if (projectsError) {
      if (projectsError.message.includes('actual_cost')) {
        console.log('   ⚠️  Column does not exist yet. Need to create it.');
      } else {
        console.error('   ❌ Query error:', projectsError.message);
        throw projectsError;
      }
    } else {
      console.log('   ✅ Column already exists');
    }

    // Test 2: Try to select contact_name from clients
    console.log('📋 Testing clients.contact_name column...');
    const { data: clientsTest, error: clientsError } = await supabase
      .from('clients')
      .select('id, contact_name')
      .limit(1);

    if (clientsError) {
      if (clientsError.message.includes('contact_name')) {
        console.log('   ⚠️  Column does not exist yet. Need to create it.');
      } else {
        console.error('   ❌ Query error:', clientsError.message);
        throw clientsError;
      }
    } else {
      console.log('   ✅ Column already exists');
    }

    console.log('\n✅ Phase 1 migration check complete!\n');
    console.log('NOTE: Columns may need to be created manually via Supabase dashboard if they do not exist.\n');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

applyPhase1Migration();
