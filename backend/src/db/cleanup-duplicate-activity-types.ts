import dotenv from 'dotenv';
import { query } from './index';

dotenv.config();

/**
 * Cleanup script to remove duplicate activity types
 * Keeps only the most recent entry for each name
 */
async function cleanupDuplicateActivityTypes() {
  console.log('🧹 Cleaning up duplicate activity types...');
  
  try {
    // Find duplicates and keep only the most recent one
    const duplicateResult = await query(`
      WITH ranked_activity_types AS (
        SELECT 
          id,
          name,
          icon,
          color,
          hourly_rate,
          is_active,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(name))
            ORDER BY created_at DESC, id DESC
          ) as rn
        FROM activity_types
      )
      DELETE FROM activity_types
      WHERE id IN (
        SELECT id FROM ranked_activity_types WHERE rn > 1
      )
    `);
    
    console.log(`✓ Cleaned up duplicate activity types`);
    
    // Show remaining duplicates
    const remainingResult = await query(`
      SELECT LOWER(TRIM(name)) as name_lower, COUNT(*) as count
      FROM activity_types
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `);
    
    if (remainingResult.rows.length > 0) {
      console.warn('⚠️  Still found duplicates:', remainingResult.rows);
    } else {
      console.log('✓ No duplicates found');
    }
    
    // Show final count
    const finalCount = await query('SELECT COUNT(*) as count FROM activity_types');
    console.log(`✓ Total activity types: ${finalCount.rows[0].count}`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error cleaning up duplicates:', error);
    process.exit(1);
  }
}

cleanupDuplicateActivityTypes();

