import { query } from '../db';
import { env } from './env';

// Cache for frontend URL
let cachedFrontendUrl: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Extracts the frontend URL from the Xero redirect URI stored in the database.
 * Falls back to FRONTEND_URL env var, then to localhost.
 */
async function getFrontendUrlFromXeroRedirect(): Promise<string> {
  try {
    // Query database for xero_redirect_uri setting
    const result = await query(
      `SELECT value FROM settings WHERE key = 'xero_redirect_uri' AND user_id IS NULL`
    );

    if (result.rows.length > 0 && result.rows[0].value) {
      const redirectUri = result.rows[0].value as string;
      
      try {
        // Parse the redirect URI and extract the origin
        // e.g., https://admin.ampedlogix.com/api/xero/callback -> https://admin.ampedlogix.com
        const redirectUrl = new URL(redirectUri);
        const frontendUrl = redirectUrl.origin;
        
        console.log('[CORS] Using frontend URL from Xero redirect URI:', frontendUrl);
        return frontendUrl;
      } catch (e) {
        console.warn('[CORS] Could not parse redirect URI:', redirectUri, e);
      }
    }
  } catch (error) {
    console.warn('[CORS] Failed to query database for redirect URI, using fallback:', error);
  }

  // Fallback to FRONTEND_URL env var
  if (env.FRONTEND_URL) {
    console.log('[CORS] Using FRONTEND_URL from environment:', env.FRONTEND_URL);
    return env.FRONTEND_URL;
  }

  // Final fallback to localhost
  console.log('[CORS] Using default localhost fallback');
  return 'http://localhost:3000';
}

/**
 * Refreshes the cached frontend URL from the database.
 * This should be called on startup and periodically.
 */
export async function refreshFrontendUrlCache(): Promise<void> {
  try {
    const frontendUrl = await getFrontendUrlFromXeroRedirect();
    cachedFrontendUrl = frontendUrl;
    cacheTimestamp = Date.now();
    console.log('[CORS] Cache refreshed. Frontend URL:', frontendUrl);
  } catch (error) {
    console.error('[CORS] Failed to refresh cache:', error);
    // Keep using existing cache if refresh fails
  }
}

/**
 * Gets the cached frontend URL, refreshing if needed.
 * This is synchronous for use in CORS middleware.
 */
function getCachedFrontendUrl(): string {
  const now = Date.now();
  
  // If cache is expired or missing, use fallback (will be refreshed in background)
  if (!cachedFrontendUrl || (now - cacheTimestamp) > CACHE_TTL) {
    // Use fallback while cache refreshes
    return env.FRONTEND_URL || 'http://localhost:3000';
  }
  
  return cachedFrontendUrl;
}

/**
 * Creates a CORS origin function that dynamically allows requests from
 * the frontend URL extracted from the Xero redirect URI.
 * 
 * The function is synchronous and uses a cached value that's refreshed
 * periodically in the background.
 */
export function createDynamicCorsOrigin() {
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Always allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // Get cached frontend URL
    const frontendUrl = getCachedFrontendUrl();

    // Check if origin matches the frontend URL
    if (origin === frontendUrl) {
      return callback(null, true);
    }

    // Log rejected origins in development
    if (env.NODE_ENV === 'development') {
      console.warn('[CORS] Rejected origin:', origin, 'Expected:', frontendUrl);
    }

    // Reject if no match
    return callback(null, false);
  };
}

/**
 * Initializes the CORS cache on server startup.
 * Should be called once when the server starts.
 */
export async function initializeCorsCache(): Promise<void> {
  await refreshFrontendUrlCache();
  
  // Set up periodic refresh (every minute)
  setInterval(() => {
    refreshFrontendUrlCache().catch(err => {
      console.error('[CORS] Background cache refresh failed:', err);
    });
  }, CACHE_TTL);
}
