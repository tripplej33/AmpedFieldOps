import { Router, Response } from 'express';
import { query } from '../db';

// Helper to get Xero credentials (duplicated from xero.ts to avoid circular dependency)
async function getXeroCredentials() {
  const clientIdResult = await query(
    `SELECT value FROM settings WHERE key = 'xero_client_id' AND user_id IS NULL`
  );
  const clientSecretResult = await query(
    `SELECT value FROM settings WHERE key = 'xero_client_secret' AND user_id IS NULL`
  );
  
  const clientId = clientIdResult.rows[0]?.value;
  const clientSecret = clientSecretResult.rows[0]?.value;
  
  return { clientId, clientSecret };
}

const router = Router();

// Health check endpoint (public)
router.get('/', async (req, res: Response) => {
  try {
    // Check database connection
    let dbHealthy = false;
    try {
      await query('SELECT 1');
      dbHealthy = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Check Xero connection status (if credentials exist)
    let xeroConfigured = false;
    let xeroConnected = false;
    try {
      const { clientId, clientSecret } = await getXeroCredentials();
      xeroConfigured = !!(clientId && clientSecret);
      
      if (xeroConfigured) {
        // Check if tokens exist
        const tokenResult = await query(
          `SELECT expires_at FROM xero_tokens ORDER BY created_at DESC LIMIT 1`
        );
        if (tokenResult.rows.length > 0) {
          const expiresAt = new Date(tokenResult.rows[0].expires_at);
          xeroConnected = expiresAt > new Date();
        }
      }
    } catch (error) {
      console.error('Xero health check failed:', error);
    }

    res.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      database: {
        healthy: dbHealthy,
        status: dbHealthy ? 'connected' : 'disconnected'
      },
      xero: {
        configured: xeroConfigured,
        connected: xeroConnected,
        status: xeroConfigured 
          ? (xeroConnected ? 'connected' : 'not_connected')
          : 'not_configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Health check failed'
    });
  }
});

export default router;

