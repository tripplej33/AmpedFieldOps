import dotenv from 'dotenv';
import { query } from './index';

dotenv.config();

/**
 * Cleanup script to remove duplicate settings entries
 * Keeps only the most recent entry for each (key, user_id) combination
 */
async function cleanupDuplicateSettings() {
  console.log('🧹 Cleaning up duplicate settings...');
  
  try {
    // Find duplicates and keep only the most recent one
    const duplicateResult = await query(`
      WITH ranked_settings AS (
        SELECT 
          id,
          key,
          user_id,
          value,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY key, user_id 
            ORDER BY created_at DESC, id DESC
          ) as rn
        FROM settings
      )
      DELETE FROM settings
      WHERE id IN (
        SELECT id FROM ranked_settings WHERE rn > 1
      )
    `);
    
    console.log(`✓ Cleaned up duplicate settings`);
    
    // Show remaining settings
    const remainingResult = await query(`
      SELECT key, user_id, COUNT(*) as count
      FROM settings
      GROUP BY key, user_id
      HAVING COUNT(*) > 1
    `);
    
    if (remainingResult.rows.length > 0) {
      console.warn('⚠️  Still found duplicates:', remainingResult.rows);
    } else {
      console.log('✓ No duplicates found');
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error cleaning up duplicates:', error);
    process.exit(1);
  }
}

cleanupDuplicateSettings();

