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
    
    // Create default admin user only if no admin exists
    const existingAdmin = await client.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    
    if (existingAdmin.rows.length === 0) {
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
        console.log('  ⚠️  Failed to create default admin user:', error);
      }
    } else {
      console.log('  ✓ Admin user already exists, skipping default admin creation');
    }
    
    // Seed sample clients (only if no clients exist)
    const existingClients = await client.query(`SELECT id FROM clients LIMIT 1`);
    if (existingClients.rows.length === 0) {
      const sampleClients = [
        {
          name: 'ABC Construction Ltd',
          contact_name: 'John Smith',
          email: 'john@abcconstruction.com',
          phone: '+64 21 123 4567',
          address: '123 Main Street, Auckland',
          billing_address: '123 Main Street, Auckland',
          billing_email: 'accounts@abcconstruction.com',
          status: 'active'
        },
        {
          name: 'XYZ Property Developers',
          contact_name: 'Sarah Johnson',
          email: 'sarah@xyzproperties.com',
          phone: '+64 21 234 5678',
          address: '456 Queen Street, Wellington',
          billing_address: '456 Queen Street, Wellington',
          billing_email: 'finance@xyzproperties.com',
          status: 'active'
        },
        {
          name: 'Metro Electrical Services',
          contact_name: 'Mike Wilson',
          email: 'mike@metroelectrical.co.nz',
          phone: '+64 21 345 6789',
          address: '789 High Street, Christchurch',
          billing_address: '789 High Street, Christchurch',
          billing_email: 'billing@metroelectrical.co.nz',
          status: 'active'
        }
      ];

      for (const client of sampleClients) {
        await client.query(
          `INSERT INTO clients (name, contact_name, email, phone, address, billing_address, billing_email, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [client.name, client.contact_name, client.email, client.phone, client.address, 
           client.billing_address, client.billing_email, client.status]
        );
      }
      console.log('  ✓ Sample clients seeded');
    }

    // Seed sample projects (only if no projects exist and clients exist)
    const existingProjects = await client.query(`SELECT id FROM projects LIMIT 1`);
    const clients = await client.query(`SELECT id, name FROM clients ORDER BY created_at LIMIT 3`);
    
    if (existingProjects.rows.length === 0 && clients.rows.length > 0) {
      const clientIds = clients.rows.map(c => c.id);
      const sampleProjects = [
        {
          code: 'PROJ-001',
          name: 'Office Building Electrical Upgrade',
          client_id: clientIds[0] || null,
          status: 'in-progress',
          budget: 125000,
          description: 'Complete electrical system upgrade for 5-story office building',
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days from now
        },
        {
          code: 'PROJ-002',
          name: 'Residential Complex Wiring',
          client_id: clientIds[1] || null,
          status: 'quoted',
          budget: 85000,
          description: 'New electrical installation for 20-unit residential complex',
          start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
        },
        {
          code: 'PROJ-003',
          name: 'Commercial Maintenance Contract',
          client_id: clientIds[2] || null,
          status: 'in-progress',
          budget: 45000,
          description: 'Ongoing maintenance and repair services',
          start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
          end_date: new Date(Date.now() + 275 * 24 * 60 * 60 * 1000) // 275 days from now (1 year contract)
        }
      ];

      for (const project of sampleProjects) {
        if (project.client_id) {
          await client.query(
            `INSERT INTO projects (code, name, client_id, status, budget, description, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [project.code, project.name, project.client_id, project.status, project.budget,
             project.description, project.start_date, project.end_date]
          );
        }
      }
      console.log('  ✓ Sample projects seeded');
    }

    // Seed sample timesheets (only if no timesheets exist and we have projects, activity types, cost centers, and users)
    const existingTimesheets = await client.query(`SELECT id FROM timesheets LIMIT 1`);
    const projects = await client.query(`SELECT id, client_id FROM projects ORDER BY created_at LIMIT 3`);
    const activityTypes = await client.query(`SELECT id FROM activity_types ORDER BY created_at LIMIT 5`);
    const costCenters = await client.query(`SELECT id FROM cost_centers ORDER BY created_at LIMIT 5`);
    const users = await client.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    
    if (existingTimesheets.rows.length === 0 && 
        projects.rows.length > 0 && 
        activityTypes.rows.length > 0 && 
        costCenters.rows.length > 0 && 
        users.rows.length > 0) {
      
      const projectIds = projects.rows.map(p => p.id);
      const activityTypeIds = activityTypes.rows.map(a => a.id);
      const costCenterIds = costCenters.rows.map(c => c.id);
      const userId = users.rows[0].id;
      
      // Generate timesheets for the last 30 days
      const timesheets = [];
      const today = new Date();
      
      for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() - dayOffset);
        
        // Skip weekends (optional - you can remove this)
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        // Create 1-3 timesheets per day
        const timesheetsPerDay = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < timesheetsPerDay; i++) {
          const projectId = projectIds[Math.floor(Math.random() * projectIds.length)];
          const activityTypeId = activityTypeIds[Math.floor(Math.random() * activityTypeIds.length)];
          const costCenterId = costCenterIds[Math.floor(Math.random() * costCenterIds.length)];
          const hours = Math.round((Math.random() * 7 + 1) * 100) / 100; // 1-8 hours
          
          // Get client_id from project
          const project = projects.rows.find(p => p.id === projectId);
          const clientId = project?.client_id || null;
          
          timesheets.push({
            user_id: userId,
            project_id: projectId,
            client_id: clientId,
            activity_type_id: activityTypeId,
            cost_center_id: costCenterId,
            date: date.toISOString().split('T')[0],
            hours: hours,
            notes: `Work completed on ${date.toLocaleDateString()}`,
            location: 'Site',
            billing_status: 'unbilled'
          });
        }
      }
      
      for (const timesheet of timesheets) {
        await client.query(
          `INSERT INTO timesheets (user_id, project_id, client_id, activity_type_id, cost_center_id, date, hours, notes, location, billing_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [timesheet.user_id, timesheet.project_id, timesheet.client_id, timesheet.activity_type_id,
           timesheet.cost_center_id, timesheet.date, timesheet.hours, timesheet.notes, 
           timesheet.location, timesheet.billing_status]
        );
      }
      console.log(`  ✓ Sample timesheets seeded (${timesheets.length} entries)`);
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
