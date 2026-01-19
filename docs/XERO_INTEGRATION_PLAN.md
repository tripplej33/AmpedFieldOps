# Xero Integration Re-activation Plan

## Current State Assessment

### ✅ What Exists
- **xero.ts route**: 5,279 lines with comprehensive implementation for:
  - OAuth 2.0 flow (auth, token refresh, callback)
  - Invoices (create, read, update, delete, void)
  - Contacts/Clients (sync bidirectional)
  - Bills, Payments, Credit Notes
  - Purchase Orders, Bank Transactions
  - Expenses, Items
  - Reports (P&L, Balance Sheet, Cash Flow, Aged Receivables/Payables)
  - Reminders, Webhooks
  - Rate limiting and error handling
  
- **Supporting libraries**:
  - `backend/src/lib/xero/`: 11+ modules for each Xero feature
  - Rate limiter, error handler, auth utilities
  - xero-node SDK imported (not currently used)
  
- **Database tables**: Legacy xero_* tables (not migrated to Supabase)
  - xero_invoices, xero_bills, xero_purchase_orders
  - xero_expenses, xero_payments, xero_credit_notes
  - xero_items, xero_bank_transactions
  - xero_tokens (stores OAuth tokens)
  
- **Frontend UI**: Settings page has Xero integration section
  - Connect/Disconnect buttons
  - Test connection endpoint
  - Sync controls

### ❌ Current Blockers
1. **Middleware Disabled**: All xero.ts endpoints return 503 "not configured" except /callback
   - Reason: Legacy database query() calls throughout
   - 170+ legacy query() calls referencing non-existent xero_* tables in Supabase
   
2. **Missing Tables in Supabase**: No xero_* tables migrated to Supabase
   - These tables never existed in the original PostgreSQL either
   - They were created to store Xero data locally
   
3. **Unused/Unmigrated Dependencies**:
   - xero-node SDK imported but not actively used
   - Most integration done via raw HTTP calls with rate limiting
   - Token storage uses legacy PostgreSQL (now needs Supabase)

4. **OAuth Token Storage**: Currently stores in settings table
   - Need to move to Supabase `app_settings` table or new `xero_auth` table

---

## Xero API Architecture (2026)

### OAuth 2.0 Flow (Authorization Code Grant)
**Best for**: Web apps that can securely store client secret (our case)

```
1. User clicks "Connect to Xero"
2. Frontend redirects to: 
   https://login.xero.com/identity/connect/authorize?
   - client_id={XERO_CLIENT_ID}
   - redirect_uri=https://admin.ampedlogix.com/api/xero/callback
   - response_type=code
   - scope=payroll offline_access

3. User authorizes in Xero
4. Redirects to: /api/xero/callback?code={AUTH_CODE}
5. Backend exchanges code for tokens via:
   POST https://identity.xero.com/connect/token
   - client_id, client_secret, code, redirect_uri
   
6. Response contains:
   - access_token (30min expiry)
   - refresh_token (long-lived)
   - expires_in
   - token_type
```

### Scopes Required (Xero Accounting API 2.0)
```
payroll          - Invoice/bill creation/reading
accounting       - General accounting operations
offline_access   - Get refresh_token (required!)
```

### Rate Limits
- 60 calls per minute per app
- 120 calls per minute per tenant
- Implementation: Exponential backoff, queue requests

### Base URLs
- **Authorization**: https://login.xero.com/identity/connect/authorize
- **Token Exchange**: https://identity.xero.com/connect/token
- **API Base**: https://api.xero.com/api.xro/2.0/
- **Resources**: 
  - Invoices: /Invoices
  - Contacts: /Contacts
  - Bills: /Invoices (Type=ACCPAY)
  - Items: /Items
  - Bank Accounts: /BankAccounts
  - etc.

### Key API Patterns

#### GET (Read)
```
GET /api.xro/2.0/Invoices?where=Status=="AUTHORISED"&page=1
- Supports WHERE filters
- Paging: ?page=1&pageSize=100
- 100 invoices default per page
- Max 100k invoices per request
```

#### POST/PUT (Create/Update)
```
POST /api.xro/2.0/Invoices
{
  "Type": "ACCREC",              // Sales invoice
  "Contact": { "ContactID": "..." },
  "InvoiceNumber": "INV-001",
  "LineItems": [
    { "Description": "...", "Quantity": 1, "UnitAmount": 100, "AccountCode": "200" }
  ],
  "Status": "DRAFT|SUBMITTED|AUTHORISED|PAID"
}
```

#### DELETE (Status Change)
```
POST /api.xro/2.0/Invoices/ID
{ "Status": "DELETED|VOIDED" }  // Only DRAFT or AUTHORISED can be deleted/voided
```

---

## Migration Strategy: Phase-Based Approach

### Phase 1: Foundation (Week 1)
**Goal**: Get OAuth flow working with Supabase token storage

#### 1.1 Create Supabase Tables
```sql
-- Store Xero OAuth tokens
CREATE TABLE xero_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization_id uuid,  -- Xero tenant ID
  organization_name text,
  UNIQUE(user_id, organization_id)
);

-- Store synced Xero invoices locally
CREATE TABLE xero_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_id uuid NOT NULL UNIQUE,
  invoice_number text NOT NULL,
  contact_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  status text,  -- DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  type text,    -- ACCREC (sales), ACCPAY (bills)
  total decimal(12,2),
  amount_due decimal(12,2),
  amount_paid decimal(12,2),
  issued_date date,
  due_date date,
  currency_code text DEFAULT 'NZD',
  line_items jsonb,  -- Store JSON from Xero
  synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Similar for bills, payments, credit notes, items
```

#### 1.2 Migrate OAuth Token Storage
- Move `getXeroCredentials()` from legacy settings query to Supabase
- Update token refresh logic to use Supabase instead of settings
- Implement token expiry checking with automatic refresh

#### 1.3 Fix OAuth Callback Endpoint
```typescript
// Enable only this endpoint initially
router.post('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Exchange code for tokens via Xero
  const tokens = await exchangeAuthCode(code);
  
  // Store in Supabase xero_auth table
  await supabase.from('xero_auth').upsert({
    user_id: req.user.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: addMinutes(new Date(), tokens.expires_in / 60),
    organization_id: tokens.xero_organization_id
  });
  
  res.redirect('/settings?xero_connected=true');
});
```

### Phase 2: Core Sync (Week 1-2)
**Goal**: Enable read-only sync of Contacts and Invoices

#### 2.1 Implement Supabase-based Sync
- `GET /api/xero/contacts` - Fetch from Xero, sync to xero_invoices table
- `GET /api/xero/invoices` - Read from Supabase xero_invoices table
- Implement sync scheduling (manual first, then auto)

#### 2.2 Add Webhook Support
```typescript
// Xero can POST to:
POST /api/xero/webhooks
- Payload: { EventList: [{ ResourceId, EventType, TenantId }] }
- Verify signature using HMAC-SHA256
- Update local records in Supabase on CREATED, UPDATED, DELETED events
```

### Phase 3: Write Operations (Week 2)
**Goal**: Create invoices, contacts, payments in Xero from AmpedFieldPro

#### 3.1 Create Xero Invoices from Timesheets
```typescript
POST /api/xero/invoices/create
{
  projectId: "...",
  timesheetIds: ["...", "..."],
  contactId: "...",
  dueDate: "2026-02-17"
}
// Converts timesheets to Xero ACCREC invoices
// Stores mapping in xero_invoices table
```

#### 3.2 Sync Existing Clients to Xero
```typescript
POST /api/xero/contacts/sync
// Bulk create Xero contacts from AmpedFieldPro clients
// Update xero_contact_id in clients table
```

### Phase 4: Advanced Features (Week 3)
**Goal**: Bills, POs, Payments, Reports

#### 4.1 Bill Management
- Create bills from purchase orders
- Track bill payment status
- Reconcile against bank transactions

#### 4.2 Financial Reports
- Pull P&L, Balance Sheet, Cash Flow from Xero
- Display in dashboards
- Export for analysis

#### 4.3 Two-way Sync
- Push updated invoices to Xero
- Pull updated invoice payments from Xero
- Conflict resolution strategy

---

## Implementation Checklist

### Pre-Implementation
- [ ] Verify Xero credentials are still valid
  - [ ] Log in to https://developer.xero.com/app/manage
  - [ ] Check Client ID and Client Secret haven't been rotated
  - [ ] Verify redirect URI matches production domain
  
- [ ] Install xero-node SDK
  ```bash
  npm install xero-node --save
  ```

- [ ] Set environment variables
  ```env
  XERO_CLIENT_ID=your_client_id
  XERO_CLIENT_SECRET=your_client_secret
  XERO_REDIRECT_URI=https://admin.ampedlogix.com/api/xero/callback
  ```

### Database Setup
- [ ] Create Supabase migrations for all xero_* tables
- [ ] Enable RLS on xero_auth (only visible to owner)
- [ ] Enable RLS on xero_invoices, xero_bills (visible to authorized users)
- [ ] Create indexes on frequent queries (xero_id, invoice_number, status)

### OAuth Flow
- [ ] Implement `POST /api/xero/authorize` - Initiates OAuth flow
- [ ] Implement `POST /api/xero/callback` - Handles redirect from Xero
- [ ] Implement token refresh in middleware
- [ ] Add connection status check endpoint

### Core Endpoints (Phase 2)
- [ ] `GET /api/xero/status` - Check connection, token validity
- [ ] `POST /api/xero/sync/contacts` - Fetch Xero contacts, sync to clients
- [ ] `GET /api/xero/invoices` - List synced invoices
- [ ] `POST /api/xero/webhooks` - Receive updates from Xero

### Invoice Management (Phase 3)
- [ ] `POST /api/xero/invoices/create` - Create from timesheet
- [ ] `PUT /api/xero/invoices/:id` - Update draft invoice
- [ ] `POST /api/xero/invoices/:id/email` - Send invoice to contact
- [ ] `POST /api/xero/payments` - Record payment received

### Error Handling & Monitoring
- [ ] Implement rate limiter (60 req/min per app)
- [ ] Exponential backoff for 429 responses
- [ ] Log all Xero API calls for debugging
- [ ] Add Xero sync status to health check

---

## Technical Deep Dives

### Token Management
**Challenge**: Xero access tokens expire in 30 minutes
**Solution**: Implement automatic refresh before expiry

```typescript
async function getValidXeroToken(userId: string) {
  const { data: auth } = await supabase
    .from('xero_auth')
    .select('*')
    .eq('user_id', userId)
    .single();
    
  if (!auth) throw new Error('Xero not connected');
  
  // Refresh if expires in < 5 minutes
  if (new Date(auth.expires_at) <= addMinutes(new Date(), 5)) {
    const newTokens = await refreshXeroToken(auth.refresh_token);
    
    await supabase.from('xero_auth').update({
      access_token: newTokens.access_token,
      expires_at: addMinutes(new Date(), newTokens.expires_in / 60),
      updated_at: new Date()
    }).eq('id', auth.id);
    
    return newTokens.access_token;
  }
  
  return auth.access_token;
}
```

### Multi-Tenant Isolation
- User can connect multiple Xero organizations
- Each organization_id gets separate token + sync data
- Frontend displays list of connected organizations

### Conflict Resolution
- **Invoice Updated in Both Systems**: 
  - Last-write-wins strategy
  - Store `synced_at` timestamp
  - If newer in Xero, overwrite AmpedFieldPro
  - If newer in AmpedFieldPro, send to Xero
  
- **Payment Applied**: 
  - Xero is source of truth
  - AmpedFieldPro queries Xero for current status
  - Don't allow local updates once synced

### Rate Limiting Strategy
```typescript
const queue = new PQueue({ 
  interval: 60 * 1000,  // Per minute
  intervalCap: 60        // 60 requests per minute
});

async function callXero(method, endpoint, data) {
  return queue.add(() => 
    fetch(`https://api.xero.com/api.xro/2.0${endpoint}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}` },
      body: data
    })
  );
}
```

---

## Frontend Integration Points

### Settings Page
```tsx
// Xero Integration Section
- Connection Status
  - ✅ Connected to: ABC Limited (xero_org_id)
  - Last synced: 2026-01-17 14:23 UTC
  - [Disconnect] [Re-connect]
  
- Sync Controls
  - [Pull Contacts from Xero]
  - [Push New Clients to Xero]
  - Auto-sync enabled: ON/OFF
  - Sync frequency: 15 min / 1 hour / 1 day
  
- Webhook Status
  - Webhook URL: https://admin.ampedlogix.com/api/xero/webhooks
  - Status: Active / Inactive
```

### Invoice Creation
```tsx
// When creating invoice from timesheet:
- If Xero connected:
  - [Create in Xero] button
  - Map AmpedFieldPro line items to Xero
  - Set status: DRAFT / AUTHORISED
  - Auto-generate invoice number or use Xero's
  
- Display Xero invoice ID for tracking
- Link to view in Xero
```

---

## Testing Strategy

### Unit Tests
```typescript
// Mock Xero API responses
// Test token refresh logic
// Test data transformation (AmpedFieldPro → Xero)
// Test error handling (rate limits, invalid tokens)
```

### Integration Tests
```typescript
// Use Xero Demo Company (free tier)
// Create test contact in Xero
// Create test invoice via API
// Verify appears in AmpedFieldPro
// Update invoice in AmpedFieldPro, verify in Xero
// Delete invoice, verify soft-delete
```

### Manual Testing Checklist
- [ ] Connect to Xero with test account
- [ ] Verify tokens stored in Supabase
- [ ] Pull contacts from Xero
- [ ] Create new invoice from timesheet
- [ ] Verify invoice appears in Xero
- [ ] Update invoice status
- [ ] Record payment in Xero, verify syncs
- [ ] Test webhook receives updates
- [ ] Test rate limiting (send 100 requests)
- [ ] Test error handling (invalid token, network down)

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Token expiry during long operation | 401 Unauthorized | Refresh before each operation + retry |
| Rate limit hit | API calls fail | Queue system with exponential backoff |
| Xero API outage | Sync broken | Graceful degradation, cache last sync |
| Duplicate invoice creation | Data integrity | Idempotency key, check before create |
| User disconnects Xero | Auth failure | Detect and show reconnect prompt |
| Data sync out of sync | Inconsistency | Manual "sync now" button + webhook updates |

---

## Success Criteria

✅ Phase 1 Complete:
- User can click "Connect to Xero" and grant permissions
- Tokens stored securely in Supabase
- "Xero Connected" status shows in Settings

✅ Phase 2 Complete:
- User can pull contacts from Xero
- Invoices created in AmpedFieldPro sync to Xero
- Can view list of synced invoices

✅ Phase 3 Complete:
- Create invoice from timesheet directly to Xero
- Send invoice via Xero
- Record payments from Xero

✅ Phase 4 Complete:
- All original features re-enabled
- Performance meets SLA (< 2 sec per operation)
- Sync reliability > 99%

---

## Resources

- [Xero OAuth 2 Docs](https://developer.xero.com/documentation/guides/oauth2/overview/)
- [Xero Invoices API](https://developer.xero.com/documentation/api/accounting/invoices/)
- [xero-node SDK](https://github.com/XeroAPI/xero-node)
- [Xero API Status](https://status.developer.xero.com/)
- [Webhook Guide](https://developer.xero.com/documentation/guides/webhooks/overview/)
