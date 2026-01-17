# Xero Integration Quick Start Checklist

## Pre-Implementation Verification (5 min)

### Xero Credentials Check
- [ ] Log in to https://developer.xero.com/app/manage
- [ ] Find your app and verify:
  - [ ] Client ID exists and is 36 chars (UUID format)
  - [ ] Client Secret exists (generate new if needed)
  - [ ] OAuth 2.0 Redirect URI set to: `https://admin.ampedlogix.com/api/xero/callback`
  - [ ] App status is "Active"
  - [ ] Connected orgs shows at least 1 demo company

### Environment Setup (2 min)
```bash
# Add to backend/.env (or docker-compose env)
XERO_CLIENT_ID=your_36_char_uuid_here
XERO_CLIENT_SECRET=your_secret_here
XERO_REDIRECT_URI=https://admin.ampedlogix.com/api/xero/callback

# Verify they're set
docker compose exec backend sh -c 'echo $XERO_CLIENT_ID'
```

### Dependencies Check (1 min)
```bash
cd backend
npm list xero-node  # Should exist or need: npm install xero-node
npm list axios      # For HTTP calls
```

---

## Phase 1: Foundation (2-3 hours)

### Step 1: Create Supabase Migrations (45 min)

Create file: `supabase/migrations/20260118000000_create_xero_tables.sql`

```sql
-- OAuth tokens table
CREATE TABLE xero_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  organization_id text,  -- Xero tenant ID (not a UUID)
  organization_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Enable RLS
ALTER TABLE xero_auth ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only see their own tokens
CREATE POLICY "xero_auth_self" ON xero_auth
  FOR ALL USING (auth.uid() = user_id);

-- Create index for frequent queries
CREATE INDEX idx_xero_auth_user ON xero_auth(user_id);
CREATE INDEX idx_xero_auth_expires ON xero_auth(expires_at);

-- Invoices table
CREATE TABLE xero_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_id text NOT NULL UNIQUE,
  invoice_number text NOT NULL,
  client_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  status text,  -- DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  type text,    -- ACCREC (sales), ACCPAY (bills)
  total decimal(12,2),
  amount_due decimal(12,2),
  amount_paid decimal(12,2),
  issued_date date,
  due_date date,
  currency_code text DEFAULT 'NZD',
  line_items jsonb,
  synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE xero_invoices ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_xero_invoices_number ON xero_invoices(invoice_number);
CREATE INDEX idx_xero_invoices_status ON xero_invoices(status);
CREATE INDEX idx_xero_invoices_synced ON xero_invoices(synced_at);
```

Then apply:
```bash
cd /root/AmpedFieldOps
supabase db push  # If linked
# OR manually in Supabase Studio SQL editor
```

### Step 2: Update Token Storage (30 min)

File: `backend/src/lib/xero/tokenManager.ts` (NEW FILE)

```typescript
import { supabase as supabaseClient } from '../../db/supabase';
import { log } from '../logger';

const supabase = supabaseClient!;

interface XeroToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  organizationId?: string;
}

export async function getXeroToken(userId: string, orgId?: string) {
  const { data, error } = await supabase
    .from('xero_auth')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', orgId || null)
    .single();

  if (error || !data) {
    log.warn('Xero token not found', { userId, orgId });
    return null;
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at),
    organizationId: data.organization_id
  };
}

export async function saveXeroToken(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;  // seconds
    organizationId: string;
    organizationName: string;
  }
) {
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expiresIn);

  const { error } = await supabase.from('xero_auth').upsert({
    user_id: userId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: expiresAt.toISOString(),
    organization_id: tokens.organizationId,
    organization_name: tokens.organizationName,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,organization_id' });

  if (error) {
    log.error('Failed to save Xero token', error);
    throw error;
  }
}

export async function refreshXeroAccessToken(userId: string, orgId?: string) {
  const token = await getXeroToken(userId, orgId);
  if (!token) throw new Error('Xero not connected');

  // Exchange refresh token for new access token
  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.XERO_CLIENT_ID!,
      client_secret: process.env.XERO_CLIENT_SECRET!,
      refresh_token: token.refreshToken
    }).toString()
  });

  const data = await response.json();
  if (!response.ok) {
    log.error('Xero token refresh failed', data);
    throw new Error('Token refresh failed');
  }

  // Save new token
  await saveXeroToken(userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    organizationId: token.organizationId || 'default',
    organizationName: '' // TODO: fetch from Xero
  });

  return data.access_token;
}

export async function getValidXeroToken(userId: string, orgId?: string) {
  let token = await getXeroToken(userId, orgId);
  if (!token) throw new Error('Xero not connected');

  // Refresh if expires in < 5 minutes
  if (token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    const newAccessToken = await refreshXeroAccessToken(userId, orgId);
    return newAccessToken;
  }

  return token.accessToken;
}
```

### Step 3: Implement OAuth Callback (45 min)

File: `backend/src/routes/xero.ts` - Update callback endpoint

```typescript
// Replace existing middleware + callback with:

// TEMPORARILY: Only allow callback, disable all other endpoints
router.use((req, res, next) => {
  if (req.path === '/callback') {
    return next();
  }
  return res.status(503).json({
    error: 'Xero integration temporarily disabled',
    message: 'Still in Phase 1 setup. Only OAuth callback is available.',
    status: 'disabled'
  });
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code: string; state?: string };

    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    // Get user from auth state (you may need to store state -> userId mapping)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.XERO_CLIENT_ID,
        client_secret: env.XERO_CLIENT_SECRET,
        code,
        redirect_uri: env.XERO_REDIRECT_URI
      }).toString()
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      log.error('Xero token exchange failed', tokens);
      return res.status(400).json({ 
        error: 'Failed to connect to Xero',
        details: tokens.error_description 
      });
    }

    // Get organization info from token
    const decoded = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
    const organizationId = decoded.xero_tenantid || decoded.tenantid;

    // Save token to Supabase
    await saveXeroToken(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      organizationId,
      organizationName: decoded.orgName || ''
    });

    log.info('Xero connected successfully', { userId, organizationId });

    // Redirect back to settings page with success
    res.redirect(`/settings?xero_connected=true&org=${organizationId}`);

  } catch (error) {
    log.error('OAuth callback error', error);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});
```

### Step 4: Test OAuth Flow (30 min)

```bash
# 1. Visit Settings page
# 2. Click "Connect to Xero"
# 3. Authorize in Xero (if not already authorized)
# 4. Should redirect back to Settings with xero_connected=true
# 5. Check Supabase: 
#    SELECT * FROM xero_auth WHERE user_id = '{your_user_id}'
# 6. Should see: access_token, refresh_token, expires_at

# Test token refresh
curl -X POST http://localhost:3001/api/xero/refresh-token \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json"
```

---

## Phase 2: Core Sync (Next Session)

### Prepare These Endpoints
- [ ] `GET /api/xero/status` - Check connection + token validity
- [ ] `POST /api/xero/contacts/sync` - Fetch from Xero, store in xero_invoices
- [ ] `GET /api/xero/invoices` - List synced invoices from Supabase
- [ ] `POST /api/xero/webhooks` - Receive updates from Xero

### Test Data
- Use Xero Demo Company
- Create 2-3 test invoices in Xero
- Create 2-3 test contacts in Xero

---

## Debugging Checklist

### "OAuth callback failed"
```bash
# Check env vars are set
docker compose exec backend sh -c 'echo "ID: $XERO_CLIENT_ID, SECRET: $XERO_CLIENT_SECRET"'

# Check response from Xero token endpoint
curl -X POST https://identity.xero.com/connect/token \
  -d "grant_type=authorization_code&client_id=YOUR_ID&client_secret=YOUR_SECRET&code=AUTH_CODE&redirect_uri=REDIRECT_URI"
```

### "Xero token not found"
```sql
-- Check Supabase
SELECT * FROM xero_auth WHERE user_id = 'YOUR_USER_ID';

-- If empty, check xero_auth table exists
SELECT * FROM information_schema.tables WHERE table_name = 'xero_auth';
```

### "Token refresh failed"
```bash
# Verify refresh_token is still valid (Xero tokens valid for 6 months)
# Check redirect_uri matches in both Xero app settings and .env

# Test directly:
curl -X POST https://identity.xero.com/connect/token \
  -d "grant_type=refresh_token&client_id=YOUR_ID&client_secret=YOUR_SECRET&refresh_token=TOKEN"
```

### "Connection timed out"
```bash
# Check network access to identity.xero.com
curl -v https://identity.xero.com/.well-known/openid-configuration

# Check from inside Docker
docker compose exec backend curl -v https://identity.xero.com/.well-known/openid-configuration
```

---

## Time Estimates

| Task | Time | Status |
|------|------|--------|
| Create Supabase tables | 15 min | ⏳ |
| Apply migrations | 10 min | ⏳ |
| Create tokenManager.ts | 30 min | ⏳ |
| Implement OAuth callback | 45 min | ⏳ |
| Test OAuth flow | 30 min | ⏳ |
| **Phase 1 Total** | **2-3 hours** | ⏳ |
| Phase 2 (Core Sync) | **4-5 hours** | 🔜 |
| Phase 3 (Write Ops) | **3-4 hours** | 🔜 |
| Phase 4 (Advanced) | **2-3 hours** | 🔜 |

---

## Before You Start

### Prerequisite Checklist
- [ ] Backend is running and accessible (port 3001)
- [ ] Supabase is running and accessible
- [ ] You have valid Xero credentials
- [ ] You're logged in to AmpedFieldPro with admin account
- [ ] Git is clean (no uncommitted changes)

### Branch Info
```bash
# Working on: feature/supabase-migration
git branch -a
git status
```

---

## Support References

- [XERO_INTEGRATION_PLAN.md](./XERO_INTEGRATION_PLAN.md) - Full strategy
- [Xero OAuth Docs](https://developer.xero.com/documentation/guides/oauth2/overview/)
- [Xero API Reference](https://developer.xero.com/documentation/api/accounting/overview)
- [Xero Identity Config](https://identity.xero.com/.well-known/openid-configuration)
