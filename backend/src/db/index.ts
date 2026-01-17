import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Determine SSL configuration based on DATABASE_URL and environment
 * - If DATABASE_URL contains sslmode parameter, respect it
 * - For internal Docker networks, SSL is not needed
 * - For external production databases, require proper SSL with certificate validation
 */
function getSslConfig(): boolean | { rejectUnauthorized: boolean } {
  const dbUrl = (env.DATABASE_URL || '').toLowerCase();
  
  // If no DATABASE_URL, return false (no SSL needed for disabled pool)
  if (!dbUrl) {
    return false;
  }
  
  // If DATABASE_URL explicitly specifies SSL mode, parse it
  if (dbUrl.includes('sslmode=')) {
    const sslMode = dbUrl.match(/sslmode=([^&]+)/)?.[1];
    
    if (sslMode === 'require' || sslMode === 'prefer') {
      // For require/prefer, use SSL but allow self-signed certs (common in managed services)
      // In production, you should use verify-full with proper certificates
      return { rejectUnauthorized: false };
    }
    
    if (sslMode === 'verify-full' || sslMode === 'verify-ca') {
      // Full certificate validation - most secure
      return { rejectUnauthorized: true };
    }
    
    if (sslMode === 'disable') {
      // Explicitly disabled
      return false;
    }
  }
  
  // For Docker internal networks (localhost, container names, or internal IPs), SSL not needed
  const isInternalNetwork = 
    dbUrl.includes('@localhost') ||
    dbUrl.includes('@127.0.0.1') ||
    dbUrl.includes('@postgres') ||  // Docker service name
    dbUrl.includes('@172.') ||      // Docker internal network
    dbUrl.includes('@10.') ||       // Private network
    dbUrl.includes('@192.168.');    // Private network
  
  if (isInternalNetwork) {
    return false;
  }
  
  // For external production databases without explicit SSL mode, require SSL with validation
  if (env.NODE_ENV === 'production') {
    // Production external database - require SSL with certificate validation
    // Note: For managed services (AWS RDS, Google Cloud SQL, etc.), you may need to
    // set rejectUnauthorized: false and provide CA certificate, or use verify-full mode
    return { rejectUnauthorized: true };
  }
  
  // Development - no SSL by default
  return false;
}

// DEPRECATED: This pool is for legacy PostgreSQL routes only
// All new routes should use Supabase client directly
const pool = env.DATABASE_URL ? new Pool({
  connectionString: env.DATABASE_URL,
  ssl: getSslConfig()
}) : null;

export const query = (text: string, params?: any[]) => {
  if (!pool) {
    throw new Error('Legacy PostgreSQL pool not configured. Use Supabase client instead.');
  }
  return pool.query(text, params);
};

export const getClient = () => {
  if (!pool) {
    throw new Error('Legacy PostgreSQL pool not configured. Use Supabase client instead.');
  }
  return pool.connect();
};

export default pool;
