import { query, getClient } from './index';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  console.log('🌱 Seeding database...');
  
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Seed Activity Types
    const activityTypes = [
      { name: 'Installation', icon: 'Wrench', color: 'bg-electric/20 border-electric text-electric', hourly_rate: 85.00 },
      { name: 'Repair', icon: 'Wrench', color: 'bg-warning/20 border-warning text-warning', hourly_rate: 95.00 },
      { name: 'Maintenance', icon: 'CheckCircle', color: 'bg-voltage/20 border-voltage text-voltage', hourly_rate: 75.00 },
      { name: 'Inspection', icon: 'Search', color: 'bg-blue-400/20 border-blue-400 text-blue-400', hourly_rate: 65.00 },
      { name: 'Consultation', icon: 'MessageSquare', color: 'bg-purple-400/20 border-purple-400 text-purple-400', hourly_rate: 120.00 },
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
      { code: 'CC-001', name: 'Residential Installation', description: 'New home electrical installations', budget: 100000 },
      { code: 'CC-002', name: 'Commercial Wiring', description: 'Commercial building electrical work', budget: 250000 },
      { code: 'CC-003', name: 'Maintenance & Repair', description: 'Ongoing maintenance and repairs', budget: 75000 },
      { code: 'CC-004', name: 'Emergency Service', description: 'Emergency callout services', budget: 50000 },
      { code: 'CC-005', name: 'Panel Upgrades', description: 'Electrical panel upgrades', budget: 80000 },
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
      { key: 'can_view_financials', label: 'View Financials', description: 'Access invoices, quotes, and financial data', is_system: true },
      { key: 'can_edit_projects', label: 'Manage Projects', description: 'Create, edit, and delete projects', is_system: true },
      { key: 'can_manage_users', label: 'Manage Users', description: 'Add, edit, and remove users', is_system: true },
      { key: 'can_sync_xero', label: 'Xero Sync', description: 'Sync data with Xero', is_system: true },
      { key: 'can_view_all_timesheets', label: 'View All Timesheets', description: 'View timesheets from all users', is_system: true },
      { key: 'can_edit_activity_types', label: 'Manage Activity Types', description: 'Configure activity types', is_system: true },
      { key: 'can_manage_clients', label: 'Manage Clients', description: 'Create, edit, and delete clients', is_system: true },
      { key: 'can_manage_cost_centers', label: 'Manage Cost Centers', description: 'Configure cost centers', is_system: true },
      { key: 'can_view_reports', label: 'View Reports', description: 'Access reports section', is_system: true },
      { key: 'can_export_data', label: 'Export Data', description: 'Export data to CSV/PDF', is_system: true },
      { key: 'can_create_timesheets', label: 'Create Timesheets', description: 'Create new timesheet entries', is_system: true },
      { key: 'can_view_own_timesheets', label: 'View Own Timesheets', description: 'View own timesheet entries', is_system: true },
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
    
    // Create default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    try {
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, is_active) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        ['admin@ampedfieldops.com', hashedPassword, 'Admin User', 'admin', true]
      );
      console.log('  ✓ Default admin user created (email: admin@ampedfieldops.com, password: admin123)');
    } catch (error) {
      console.log('  ⚠️  Admin user might already exist');
    }
    
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
