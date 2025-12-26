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
      await client.query(
        `INSERT INTO activity_types (name, icon, color, hourly_rate) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [type.name, type.icon, type.color, type.hourly_rate]
      );
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
      { key: 'timezone', value: 'America/New_York' },
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
