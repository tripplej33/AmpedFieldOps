import { query, getClient } from './index';
import dotenv from 'dotenv';

// Suppress dotenv parsing warnings
dotenv.config({ debug: false, override: false });

async function seedDemo() {
  console.log('🌱 Seeding demo data...');
  
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
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

      for (const sampleClient of sampleClients) {
        await client.query(
          `INSERT INTO clients (name, contact_name, email, phone, address, billing_address, billing_email, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sampleClient.name, sampleClient.contact_name, sampleClient.email, sampleClient.phone, sampleClient.address, 
           sampleClient.billing_address, sampleClient.billing_email, sampleClient.status]
        );
      }
      console.log('  ✓ Sample clients seeded');
    } else {
      console.log('  ✓ Clients already exist, skipping sample clients');
    }

    // Seed sample projects (only if no projects exist and clients exist)
    const existingProjects = await client.query(`SELECT id FROM projects LIMIT 1`);
    const clientsResult = await client.query(`SELECT id, name FROM clients ORDER BY created_at LIMIT 3`);
    
    if (existingProjects.rows.length === 0 && clientsResult.rows.length > 0) {
      const clientIds = clientsResult.rows.map((c: any) => c.id);
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
    } else {
      if (existingProjects.rows.length > 0) {
        console.log('  ✓ Projects already exist, skipping sample projects');
      } else {
        console.log('  ⚠️  No clients found, skipping sample projects');
      }
    }

    // Seed sample timesheets (only if no timesheets exist and we have projects, activity types, cost centers, and users)
    const existingTimesheets = await client.query(`SELECT id FROM timesheets LIMIT 1`);
    const projectsResult = await client.query(`SELECT id, client_id FROM projects ORDER BY created_at LIMIT 3`);
    const activityTypesResult = await client.query(`SELECT id FROM activity_types ORDER BY created_at LIMIT 5`);
    const costCentersResult = await client.query(`SELECT id FROM cost_centers ORDER BY created_at LIMIT 5`);
    const usersResult = await client.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    
    if (existingTimesheets.rows.length === 0 && 
        projectsResult.rows.length > 0 && 
        activityTypesResult.rows.length > 0 && 
        costCentersResult.rows.length > 0 && 
        usersResult.rows.length > 0) {
      
      const projectIds = projectsResult.rows.map((p: any) => p.id);
      const activityTypeIds = activityTypesResult.rows.map((a: any) => a.id);
      const costCenterIds = costCentersResult.rows.map((c: any) => c.id);
      const userId = usersResult.rows[0].id;
      
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
          const project = projectsResult.rows.find((p: any) => p.id === projectId);
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
    } else {
      if (existingTimesheets.rows.length > 0) {
        console.log('  ✓ Timesheets already exist, skipping sample timesheets');
      } else {
        console.log('  ⚠️  Missing dependencies, skipping sample timesheets');
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Demo data seeded successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Demo seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
  
  process.exit(0);
}

seedDemo();
