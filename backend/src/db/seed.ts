import { query, getClient } from './index';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Suppress dotenv parsing warnings
dotenv.config({ debug: false, override: false });

async function seed() {
  console.log('🌱 Seeding database...');
  
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Seed Activity Types
    const activityTypes = [
      { name: 'Labour', icon: 'Briefcase', color: 'bg-electric/20 border-electric text-electric', hourly_rate: 100.00 },
      { name: 'Travel', icon: 'Car', color: 'bg-blue-400/20 border-blue-400 text-blue-400', hourly_rate: 100.00 },
      { name: 'Overnight Allowance', icon: 'Moon', color: 'bg-indigo-400/20 border-indigo-400 text-indigo-400', hourly_rate: 85.00 },
      { name: 'Admin', icon: 'FileText', color: 'bg-gray-400/20 border-gray-400 text-gray-400', hourly_rate: 50.00 },
    ];
    
    for (const type of activityTypes) {
      // Check if activity type with same name (case-insensitive) already exists
      const existing = await client.query(
        `SELECT id FROM activity_types WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
        [type.name]
      );
      
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO activity_types (name, icon, color, hourly_rate) 
           VALUES ($1, $2, $3, $4)`,
          [type.name, type.icon, type.color, type.hourly_rate]
        );
      }
    }
    console.log('  ✓ Activity types seeded');
    
    // Seed Cost Centers
    const costCenters = [
      { code: 'CC-001', name: 'Default Cost Center', description: '', budget: 0 },
    ];
    
    for (const cc of costCenters) {
      await client.query(
        `INSERT INTO cost_centers (code, name, description, budget) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING`,
        [cc.code, cc.name, cc.description, cc.budget]
      );
    }
    console.log('  ✓ Cost centers seeded');
    
    // Seed default settings
    const defaultSettings = [
      { key: 'company_name', value: 'AmpedFieldOps' },
      { key: 'company_logo', value: null },
      { key: 'timezone', value: 'Pacific/Auckland' },
      { key: 'xero_auto_sync', value: 'false' },
      { key: 'xero_sync_frequency', value: '30' },
      { key: 'setup_completed', value: 'false' },
    ];
    
    for (const setting of defaultSettings) {
      await client.query(
        `INSERT INTO settings (key, value, user_id) 
         VALUES ($1, $2, NULL)
         ON CONFLICT (key, user_id) DO NOTHING`,
        [setting.key, setting.value]
      );
    }
    console.log('  ✓ Default settings seeded');
    
    // Seed default permissions
    const defaultPermissions = [
      // System-level permissions
      { key: 'can_manage_users', label: 'Manage Users', description: 'Add, edit, and remove users', is_system: true },
      { key: 'can_sync_xero', label: 'Xero Sync', description: 'Sync data with Xero', is_system: true },
      { key: 'can_edit_activity_types', label: 'Manage Activity Types', description: 'Configure activity types', is_system: true },
      { key: 'can_manage_cost_centers', label: 'Manage Cost Centers', description: 'Configure cost centers', is_system: true },
      { key: 'can_view_reports', label: 'View Reports', description: 'Access reports section', is_system: true },
      { key: 'can_export_data', label: 'Export Data', description: 'Export data to CSV/PDF', is_system: true },
      // Projects - granular permissions
      { key: 'can_view_own_projects', label: 'View Own Projects', description: 'View projects created by user', is_system: true },
      { key: 'can_view_all_projects', label: 'View All Projects', description: 'View all projects in the system', is_system: true },
      { key: 'can_create_projects', label: 'Create Projects', description: 'Create new projects', is_system: true },
      { key: 'can_edit_own_projects', label: 'Edit Own Projects', description: 'Edit projects created by user', is_system: true },
      { key: 'can_edit_all_projects', label: 'Edit All Projects', description: 'Edit any project in the system', is_system: true },
      { key: 'can_delete_own_projects', label: 'Delete Own Projects', description: 'Delete projects created by user', is_system: true },
      { key: 'can_delete_all_projects', label: 'Delete All Projects', description: 'Delete any project in the system', is_system: true },
      // Clients - granular permissions
      { key: 'can_view_own_clients', label: 'View Own Clients', description: 'View clients created by user', is_system: true },
      { key: 'can_view_all_clients', label: 'View All Clients', description: 'View all clients in the system', is_system: true },
      { key: 'can_create_clients', label: 'Create Clients', description: 'Create new clients', is_system: true },
      { key: 'can_edit_own_clients', label: 'Edit Own Clients', description: 'Edit clients created by user', is_system: true },
      { key: 'can_edit_all_clients', label: 'Edit All Clients', description: 'Edit any client in the system', is_system: true },
      { key: 'can_delete_own_clients', label: 'Delete Own Clients', description: 'Delete clients created by user', is_system: true },
      { key: 'can_delete_all_clients', label: 'Delete All Clients', description: 'Delete any client in the system', is_system: true },
      // Timesheets - granular permissions
      { key: 'can_view_own_timesheets', label: 'View Own Timesheets', description: 'View own timesheet entries', is_system: true },
      { key: 'can_view_all_timesheets', label: 'View All Timesheets', description: 'View timesheets from all users', is_system: true },
      { key: 'can_create_timesheets', label: 'Create Timesheets', description: 'Create new timesheet entries', is_system: true },
      { key: 'can_edit_own_timesheets', label: 'Edit Own Timesheets', description: 'Edit own timesheet entries', is_system: true },
      { key: 'can_edit_all_timesheets', label: 'Edit All Timesheets', description: 'Edit any timesheet in the system', is_system: true },
      { key: 'can_delete_own_timesheets', label: 'Delete Own Timesheets', description: 'Delete own timesheet entries', is_system: true },
      { key: 'can_delete_all_timesheets', label: 'Delete All Timesheets', description: 'Delete any timesheet in the system', is_system: true },
      // Invoices - granular permissions
      { key: 'can_view_own_invoices', label: 'View Own Invoices', description: 'View invoices created by user', is_system: true },
      { key: 'can_view_all_invoices', label: 'View All Invoices', description: 'View all invoices in the system', is_system: true },
      { key: 'can_create_invoices', label: 'Create Invoices', description: 'Create new invoices and quotes', is_system: true },
      { key: 'can_edit_own_invoices', label: 'Edit Own Invoices', description: 'Edit invoices created by user', is_system: true },
      { key: 'can_edit_all_invoices', label: 'Edit All Invoices', description: 'Edit any invoice in the system', is_system: true },
      { key: 'can_delete_own_invoices', label: 'Delete Own Invoices', description: 'Delete invoices created by user', is_system: true },
      { key: 'can_delete_all_invoices', label: 'Delete All Invoices', description: 'Delete any invoice in the system', is_system: true },
    ];
    
    for (const perm of defaultPermissions) {
      await client.query(
        `INSERT INTO permissions (key, label, description, is_system, is_custom, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (key) DO UPDATE SET label = $2, description = $3, updated_at = CURRENT_TIMESTAMP`,
        [perm.key, perm.label, perm.description, perm.is_system, false, true]
      );
    }
    console.log('  ✓ Default permissions seeded');
    
    // Admin user creation is now handled via /api/setup/admin endpoint with Supabase Auth
    // This ensures users go through the proper first-time setup flow (AdminSetupModal)
    // and admin is created in both auth.users and public.users with matching UUIDs
    
    await client.query('COMMIT');
    console.log('✅ Database seeded successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
  
  process.exit(0);
}

seed();
