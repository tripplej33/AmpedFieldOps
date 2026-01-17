# Database Rework Plan: Supabase Migration

## Executive Summary
Migrate from standalone PostgreSQL + Adminer to a local Supabase stack, providing auth, database, storage, and realtime capabilities while starting with a fresh database (no data migration).

---

## Current Architecture Baseline

### Services (docker-compose.yml)
- **postgres** (postgres:15-alpine) - Standalone PostgreSQL database
- **adminer** - Database UI tool for PostgreSQL management
- **backend** (Express/Node) - API server with direct `pg` Pool connections
- **frontend** (React/Vite) - SPA calling backend APIs
- **redis** - Job queues and caching
- **ocr-service** - Python Flask OCR processing

### Backend Database Layer
- **Connection**: `pg` Pool with raw SQL queries via `backend/src/db/index.ts`
- **Authentication**: Custom JWT-based auth (`bcrypt` for passwords, manual session management)
- **Queries**: Direct SQL in all route handlers (e.g., `query('SELECT * FROM users WHERE...')`)
- **Migrations**: Manual SQL scripts (assumed in `backend/src/db/migrations/` or similar)
- **File Storage**: Filesystem volumes (`./backend/uploads`)

### Frontend
- Calls backend REST API (`/api/auth/login`, `/api/projects`, etc.)
- No direct database interaction

---

## Target Architecture: Supabase Local Stack

### Services (New docker-compose.yml)
- **supabase-db** - PostgreSQL with Supabase extensions (pgvector, etc.)
- **supabase-kong** - API Gateway routing to GoTrue, PostgREST, Realtime, Storage
- **supabase-auth** (GoTrue) - Authentication service (email/password, OAuth, magic links)
- **supabase-rest** (PostgREST) - Auto-generated REST API from DB schema
- **supabase-realtime** - WebSocket subscriptions for database changes
- **supabase-storage** - S3-compatible object storage (MinIO backend)
- **supabase-studio** - Database UI (replaces Adminer)
- **backend** (Express/Node) - Kept for custom business logic, Xero integration, OCR orchestration
- **frontend** (React/Vite) - Updated to use Supabase JS client
- **redis** - Keep for job queues/caching (unchanged)
- **ocr-service** - Keep for OCR processing (unchanged)

### Setup Method
Use **Supabase CLI** (`supabase init` + `supabase start`) to generate Docker Compose config and manage migrations.

---

## Code Changes Required

### 1. Backend: Database Connection Layer

#### Replace `pg` Pool with Supabase Client
**Files to modify:**
- `backend/src/db/index.ts` - Replace `Pool` with `@supabase/supabase-js` client
- All route files importing `query` or `getClient` from `../db`

**Current pattern:**
```typescript
import { query } from '../db';
const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
```

**New pattern (Option A - Keep Express backend, use Supabase client for DB):**
```typescript
import { supabase } from '../db/supabase';
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();
```

**New pattern (Option B - Use PostgREST via HTTP):**
```typescript
// Call Supabase PostgREST directly
const response = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
  headers: { 
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${serviceRoleKey}`
  }
});
```

**Recommendation:** Use **Option A** (Supabase JS client) for familiarity and type safety.

#### Files requiring query → Supabase client migration:
- `backend/src/routes/auth.ts` (login, register, password reset)
- `backend/src/routes/users.ts` (CRUD)
- `backend/src/routes/projects.ts` (CRUD + transactions)
- `backend/src/routes/clients.ts` (CRUD)
- `backend/src/routes/timesheets.ts` (CRUD + file references)
- `backend/src/routes/dashboard.ts` (aggregate queries)
- `backend/src/routes/xero.ts` (token storage, sync logs)
- `backend/src/routes/settings.ts` (app config)
- `backend/src/routes/permissions.ts` (user permissions)
- `backend/src/routes/role-permissions.ts` (role management)
- `backend/src/routes/activityTypes.ts` (CRUD)
- `backend/src/routes/costCenters.ts` (CRUD)
- `backend/src/routes/safetyDocuments.ts` (CRUD + file refs)
- `backend/src/routes/documentScan.ts` (OCR results)
- `backend/src/routes/backups.ts` (backup logs)
- `backend/src/middleware/auth.ts` (JWT → Supabase Auth)
- `backend/src/middleware/validateProject.ts` (ownership checks)
- `backend/src/lib/email.ts` (email config queries)
- `backend/src/lib/documentMatcher.ts` (OCR matching)
- `backend/src/lib/queue.ts` (job status tracking)
- `backend/src/lib/backup.ts` (backup operations)
- `backend/src/db/seed.ts` (initial data seeding)

**Estimated: 20+ files, ~300-500 query calls to refactor**

---

### 2. Backend: Authentication Migration

#### Current Auth Flow
1. User POSTs email/password to `/api/auth/login`
2. Backend queries `users` table, compares `bcrypt` hash
3. Backend generates JWT with `jwt.sign()`
4. Frontend stores token in localStorage, sends in `Authorization: Bearer <token>` header
5. Middleware decodes JWT, queries `user_permissions` table

#### New Auth Flow (Supabase Auth)
1. **Frontend** calls `supabase.auth.signInWithPassword({ email, password })`
2. Supabase GoTrue returns session with JWT (signed by Supabase)
3. Frontend stores session automatically (Supabase client handles refresh)
4. Frontend sends `Authorization: Bearer <supabase_jwt>` to backend
5. Backend verifies JWT using Supabase service client or JWT secret

**Backend changes:**
- **Remove** `/api/auth/login`, `/api/auth/register`, `/api/auth/logout` (handled by frontend → Supabase)
- **Update** `backend/src/middleware/auth.ts`:
  ```typescript
  // Verify Supabase JWT instead of custom JWT
  import { createClient } from '@supabase/supabase-js';
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  export const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Fetch user metadata from your users table or use Supabase user metadata
    req.user = { id: user.id, email: user.email, ... };
    next();
  };
  ```

**Frontend changes:**
- Replace `/api/auth/login` calls with `supabase.auth.signInWithPassword()`
- Replace `/api/auth/register` with `supabase.auth.signUp()`
- Replace logout with `supabase.auth.signOut()`
- Add Supabase session listener to auto-refresh tokens

**User table migration:**
- Supabase manages users in `auth.users` schema table
- Create `public.users` table for app-specific user data (name, role, avatar, etc.)
- Link via `id` (Supabase `auth.users.id` = `public.users.id`)

---

### 3. Frontend: Supabase Client Integration

#### Install Supabase JS
```bash
npm install @supabase/supabase-js
```

#### Create Supabase client
**New file: `src/lib/supabase.ts`**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

#### Replace auth API calls
**Files to update:**
- `src/contexts/AuthContext.tsx` (or wherever auth state is managed)
- Login/register components

**Example:**
```typescript
// Old
const response = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});

// New
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});
```

#### Optional: Direct database queries from frontend
For read-only data or with RLS policies, frontend can query Supabase directly:
```typescript
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .eq('client_id', clientId);
```

**Recommendation:** Keep complex business logic in backend; use direct queries for simple reads.

---

### 4. File Storage Migration

#### Current Setup
- Uploads stored in `./backend/uploads` volume
- Routes serve files via Express static middleware or custom handlers

#### New Setup: Supabase Storage
- Create buckets: `logos`, `projects`, `timesheets`, `safety-documents`
- Upload via Supabase client:
  ```typescript
  const { data, error } = await supabase.storage
    .from('timesheets')
    .upload(`${userId}/${filename}`, file);
  ```
- Get public URL:
  ```typescript
  const { data } = supabase.storage
    .from('timesheets')
    .getPublicUrl(`${userId}/${filename}`);
  ```

**Backend changes:**
- Replace multer/filesystem writes with Supabase Storage API
- Update routes: `timesheets.ts`, `safetyDocuments.ts`, `files.ts`

**Frontend changes:**
- Update file upload components to use Supabase Storage
- Replace `/uploads/` URLs with Supabase Storage public URLs

---

### 5. Database Schema & Migrations

#### Migration Strategy
1. **Initialize Supabase project**: `supabase init` in repo root
2. **Create migration files** in `supabase/migrations/` (SQL format)
3. **Apply migrations**: `supabase db push` or auto-apply on `supabase start`

#### Schema porting
- Extract current schema from `backend/src/db/migrations/` or dump from running Postgres
- Convert to Supabase migration format
- Add Row Level Security (RLS) policies for auth integration

**Example RLS policy:**
```sql
-- Users can only read their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  USING (auth.uid() = id);
```

#### Seed data
- Move `backend/src/db/seed.ts` logic to Supabase seed file: `supabase/seed.sql`
- Or keep backend seeding script but call Supabase client instead of `pg` Pool

---

### 6. Realtime Subscriptions (Optional Enhancement)

#### Use Case
- Live project updates when team members edit
- Live timesheet entries appearing for managers
- Dashboard metrics auto-refreshing

#### Implementation
**Frontend:**
```typescript
const channel = supabase
  .channel('projects-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'projects'
  }, (payload) => {
    console.log('Project changed:', payload);
    // Update state
  })
  .subscribe();
```

**Backend:** No changes needed; Supabase Realtime handles it.

---

## Docker Compose Changes

### Remove
```yaml
postgres:
  image: postgres:15-alpine
  # ... (entire service)

adminer:
  image: adminer:latest
  # ... (entire service)
```

### Add (via Supabase CLI)
Run `supabase start` to generate `supabase/.docker/docker-compose.yml` with:
- supabase-db (PostgreSQL with extensions)
- supabase-kong (API gateway)
- supabase-auth (GoTrue)
- supabase-rest (PostgREST)
- supabase-realtime
- supabase-storage (MinIO)
- supabase-studio (UI)

### Update Backend Service
```yaml
backend:
  environment:
    # Remove DATABASE_URL (or point to Supabase Postgres if needed)
    SUPABASE_URL: http://supabase-kong:8000
    SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    # Keep JWT_SECRET only if using custom auth alongside Supabase
```

### Update Frontend Service
```yaml
frontend:
  build:
    args:
      VITE_SUPABASE_URL: ${SUPABASE_URL}
      VITE_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
```

---

## Environment Variables

### New .env entries
```bash
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<generated by supabase start>
SUPABASE_SERVICE_ROLE_KEY=<generated by supabase start>

# Frontend (build-time)
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<same as above>

# Remove (no longer needed)
# DATABASE_URL
# JWT_SECRET (optional if fully migrating to Supabase Auth)
```

---

## Migration Phases

### Phase 1: Setup & Proof of Concept
1. Install Supabase CLI: `npm install -g supabase`
2. Initialize project: `supabase init`
3. Start local stack: `supabase start`
4. Verify Studio UI at `http://localhost:54323`
5. Test auth signup/login via Studio or Supabase JS client

### Phase 2: Schema Migration
1. Export current schema from running Postgres
2. Create Supabase migration file: `supabase migration new initial_schema`
3. Paste schema into `supabase/migrations/<timestamp>_initial_schema.sql`
4. Add RLS policies
5. Apply: `supabase db push`
6. Run seed data

### Phase 3: Backend Refactor
1. Install `@supabase/supabase-js` in backend
2. Create `backend/src/db/supabase.ts` client wrapper
3. Refactor one route at a time (start with simple CRUD like `activityTypes.ts`)
4. Update auth middleware to verify Supabase JWTs
5. Test each route with Postman/Insomnia
6. Replace file uploads with Supabase Storage

### Phase 4: Frontend Refactor
1. Install `@supabase/supabase-js` in frontend
2. Create `src/lib/supabase.ts` client
3. Update AuthContext to use `supabase.auth` methods
4. Replace login/register pages
5. Update file upload components
6. Test full user flows

### Phase 5: Docker Compose Integration
1. Update `docker-compose.yml` to remove `postgres` and `adminer`
2. Link backend to Supabase network (if needed)
3. Set environment variables
4. Rebuild and test full stack
5. Update `install.sh` script to initialize Supabase

### Phase 6: Testing & Cleanup
1. End-to-end testing (auth, CRUD, file uploads)
2. Remove old auth routes and `pg` dependencies
3. Update documentation
4. Commit to branch

---

## Risks & Considerations

### Breaking Changes
- **Authentication**: All existing user sessions/tokens will be invalidated
- **User IDs**: Supabase uses UUID for `auth.users.id`; current app may use integers
- **API contracts**: Frontend may need updates if backend response shapes change

### Learning Curve
- Team needs to learn Supabase query builder vs raw SQL
- RLS policy debugging can be tricky

### Performance
- Supabase Kong gateway adds a network hop compared to direct Postgres
- Realtime subscriptions require WebSocket infrastructure

### Vendor Lock-in
- Supabase-specific features (Storage, Realtime, Auth) may be harder to migrate away from
- PostgREST auto-generates API; custom logic requires backend or Edge Functions

---

## Rollback Plan
If migration fails or issues arise:
1. Keep old `postgres` and `adminer` services in separate compose file
2. Switch `DATABASE_URL` back to old Postgres
3. Revert backend to use `pg` Pool
4. Restore database from backup

---

## Success Metrics
- All 20 route files successfully refactored to Supabase client
- Auth flows working (signup, login, logout, session refresh)
- File uploads working via Supabase Storage
- No `pg` or `bcrypt` dependencies remaining in backend
- Frontend can authenticate and fetch data via Supabase
- Docker stack starts with `supabase start` + `docker compose up`

---

## Next Steps
1. **User approval** of this plan
2. **Detailed task breakdown** for each phase
3. **Branch creation**: `feature/supabase-migration`
4. **Start Phase 1**: Install CLI and test local Supabase stack

---

## Questions for User
1. Keep Express backend for business logic (Xero, OCR), or migrate some routes to Supabase Edge Functions?
2. Use Supabase Auth exclusively, or hybrid (Supabase for users + custom JWT for service accounts)?
3. Timeline: All at once, or phased rollout (auth first, then data)?
4. Production plan: Self-host Supabase or use Supabase Cloud?
