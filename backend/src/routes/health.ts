import { Router, Response } from 'express';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';

// Helper to get Xero credentials (duplicated from xero.ts to avoid circular dependency)
async function getXeroCredentials() {
  const supabase = supabaseClient!;
  const { data: clientIdRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'xero_client_id')
    .eq('user_id', null)
    .single();
  
  const { data: clientSecretRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'xero_client_secret')
    .eq('user_id', null)
    .single();
  
  const clientId = clientIdRow?.value;
  const clientSecret = clientSecretRow?.value;
  
  return { clientId, clientSecret };
}

const router = Router();

// Health check endpoint (public)
router.get('/', async (req, res: Response) => {
  try {
    const supabase = supabaseClient!;
    const debug = {
      supabaseClientExists: !!supabase,
      supabaseType: supabase ? typeof supabase : 'null',
    };
    
    if (!supabase) {
      return res.json({
        status: 'unhealthy',
        database: { healthy: false, status: 'supabase_client_null' },
        debug,
        xero: { configured: false, connected: false, status: 'not_configured' },
        timestamp: new Date().toISOString(),
      });
    }

    // Check database connection
    let dbHealthy = false;
    let dbError = null;
    try {
      // Check Supabase connection by querying clients table (one that should exist)
      const { error } = await supabase.from('clients').select('id').limit(1);
      dbError = error?.message || error?.code || null;
      dbHealthy = !error;
    } catch (error: any) {
      dbError = error?.message || String(error);
    }

    // Check Xero connection status (if credentials exist)
    let xeroConfigured = false;
    let xeroConnected = false;
    try {
      const { clientId, clientSecret } = await getXeroCredentials();
      xeroConfigured = !!(clientId && clientSecret);
      
      if (xeroConfigured) {
        // Check if tokens exist
        const { data: tokenRows } = await supabase
          .from('xero_tokens')
          .select('expires_at')
          .order('created_at', { ascending: false })
          .limit(1);

        if ((tokenRows || []).length > 0) {
          const expiresAt = new Date(tokenRows![0].expires_at);
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
        status: dbHealthy ? 'connected' : 'disconnected',
        error: dbError
      },
      xero: {
        configured: xeroConfigured,
        connected: xeroConnected,
        status: xeroConfigured 
          ? (xeroConnected ? 'connected' : 'not_connected')
          : 'not_configured'
      },
      debug,
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

