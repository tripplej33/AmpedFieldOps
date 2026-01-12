import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Determine SSL configuration based on DATABASE_URL and environment
 * - If DATABASE_URL contains sslmode parameter, respect it
 * - For internal Docker networks, SSL is not needed
 * - For external production databases, require proper SSL with certificate validation
 */
function getSslConfig(dbUrl: string): boolean | { rejectUnauthorized: boolean } {
  const lowerUrl = dbUrl.toLowerCase();
  
  // If DATABASE_URL explicitly specifies SSL mode, parse it
  if (lowerUrl.includes('sslmode=')) {
    const sslMode = lowerUrl.match(/sslmode=([^&]+)/)?.[1];
    
    if (sslMode === 'require' || sslMode === 'prefer') {
      return { rejectUnauthorized: false };
    }
    
    if (sslMode === 'verify-full' || sslMode === 'verify-ca') {
      return { rejectUnauthorized: true };
    }
    
    if (sslMode === 'disable') {
      return false;
    }
  }

  // For Docker internal networks (localhost, container names, or internal IPs), SSL not needed
  const isInternalNetwork = 
    lowerUrl.includes('@localhost') ||
    lowerUrl.includes('@127.0.0.1') ||
    lowerUrl.includes('@postgres') ||
    lowerUrl.includes('@172.') ||
    lowerUrl.includes('@10.') ||
    lowerUrl.includes('@192.168.');

  if (isInternalNetwork) {
    return false;
  }

  if (env.NODE_ENV === 'production') {
    return { rejectUnauthorized: true };
  }

  return false;
}

// For Supabase, we can use the direct PostgreSQL connection
const connectionString = env.DATABASE_URL || (() => {
  console.warn('DATABASE_URL not set. Some features (backups, direct DB access) may not work.');
  return '';
})();

if (!connectionString) {
  throw new Error('DATABASE_URL is required for database operations. Please set it in your environment variables.');
}

const pool = new Pool({
  connectionString,
  ssl: getSslConfig(connectionString)
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const getClient = () => pool.connect();

export default pool;
