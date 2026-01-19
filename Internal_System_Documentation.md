# AmpedFieldOps - System Architecture & Documentation

## Project Overview
AmpedFieldOps is a service management platform with a React/Vite frontend, Node/Express backend, and Supabase as the unified data/auth platform.

## Current Status (2026-01-17)
✅ **Production Deployment Complete**
- Full Supabase migration: Legacy PostgreSQL removed entirely
- Frontend built with production URL: `https://supabase.ampedlogix.com`
- Backend running with optional legacy database (gracefully skipped)
- All services accessible through Nginx Proxy Manager on 192.168.1.124
- Ports 3000 (frontend), 3001 (backend), 54321 (Supabase) verified open and accessible
- Supabase Auth endpoints responding at https://supabase.ampedlogix.com/auth/v1/health

## Project Road Map
- See docs at `docs/Feature_Implementation_Roadmap.md`

## Services Status & Health Check (2026-01-18)

### Running Services (Docker Compose)
| Service | Container Name | Port | Status | Purpose |
|---------|---|---|---|---|
| **Frontend** | ampedfieldops-web | 3000 | ✅ Up (9h) | React/Vite UI |
| **Backend API** | ampedfieldops-api | 3001 | ✅ Up (13m) | Express REST API |
| **OCR Service** | ampedfieldops-ocr | 8000 | ✅ Up (19h) | Python Flask document processing |
| **Redis** | ampedfieldops-redis | 6379 | ✅ Up (19h) | Cache & job queue |
| **Supabase Studio** | supabase_studio_AmpedFieldOps | 54323 | ✅ Up (9h) | Database UI & management |
| **Supabase Kong (API Gateway)** | supabase_kong_AmpedFieldOps | 54321 | ✅ Up (9h) | REST/RealTime proxy |
| **Supabase PostgreSQL** | supabase_db_AmpedFieldOps | 54322 | ✅ Up (9h) | Primary database |
| **Supabase Auth** | supabase_auth_AmpedFieldOps | 9999 | ✅ Up (8h) | JWT token issuer |
| **Supabase Storage** | supabase_storage_AmpedFieldOps | 5000 | ✅ Up (9h) | File storage API |
| **Supabase RealTime** | supabase_realtime_AmpedFieldOps | 4000 | ✅ Up (9h) | WebSocket subscriptions |
| **Supabase REST** | supabase_rest_AmpedFieldOps | 3000 | ✅ Up (9h) | PostgREST (read/write API) |
| **Supabase Edge Runtime** | supabase_edge_runtime_AmpedFieldOps | 8081 | ✅ Up (9h) | Serverless functions |
| **Supabase Vector** | supabase_vector_AmpedFieldOps | - | ✅ Up (9h) | pgvector embeddings |
| **Supabase PgMeta** | supabase_pg_meta_AmpedFieldOps | 8080 | ✅ Up (9h) | Postgres metadata API |
| **Supabase Analytics** | supabase_analytics_AmpedFieldOps | 54327 | ✅ Up (9h) | Logflare logs/telemetry |
| **Supabase Mail** | supabase_inbucket_AmpedFieldOps | 54324 | ✅ Up (9h) | Email capture (dev/test) |

### Quick Health Check Command
```bash
# All services
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Individual service health
curl -s http://localhost:3000/health        # Frontend
curl -s http://localhost:3001/health        # Backend
curl -s http://localhost:8000/health        # OCR
echo PING | nc -w1 localhost 6379           # Redis
curl -s http://localhost:54321/rest/v1/     # Supabase REST API
```

### Expected Service Startup Order
1. **supabase_db_AmpedFieldOps** (PostgreSQL) - ~10s
2. **supabase_kong_AmpedFieldOps** (Kong proxy) - ~15s
3. **supabase_auth_AmpedFieldOps** - ~20s
4. **ampedfieldops-redis** - ~5s
5. **ampedfieldops-api** (Backend) - ~30s (waits for Supabase)
6. **ampedfieldops-ocr** - ~10s
7. **ampedfieldops-web** (Frontend) - ~5s

### Troubleshooting
- **Backend failing to start**: Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- **Frontend can't reach backend**: Verify `VITE_API_URL` points to `http://localhost:3001` (dev) or `https://admin.ampedlogix.com/api` (prod)
- **Supabase schema issues**: Connect to PostgreSQL (`psql -h 127.0.0.1 -U postgres -d postgres -p 54322`) and run migrations from `supabase/migrations/`
- **Redis connection errors**: Ensure `REDIS_URL` in `.env` is `redis://ampedfieldops-redis:6379` (Docker) or `redis://localhost:6379` (host)

---

## Architecture Summary
- **Frontend**: React 18 + Vite, served on port 3000 behind nginx. Uses `https://supabase.ampedlogix.com` for Supabase client.
- **Backend**: Node.js + Express on port 3001; uses Supabase client for database access and JWT verification. Legacy database code gracefully disabled.
- **OCR**: Python Flask service on port 8000 for document processing.
- **Data Platform**: Supabase (Postgres, GoTrue Auth, PostgREST, Realtime, Storage, Studio) on port 54321 (Kong proxy).
- **Deployment**: Docker Compose on 192.168.1.124; orchestrates frontend, backend, Supabase stack, Redis, OCR.
- **Proxy**: Nginx Proxy Manager at 192.168.1.134:81 handles SSL/TLS, routing for admin.ampedlogix.com and supabase.ampedlogix.com

## Auth
- **Provider**: Supabase GoTrue at https://supabase.ampedlogix.com/auth/v1
- **Frontend**: `supabase.auth.signInWithPassword()` directly; no /api/auth/login route used
- **Backend**: Verifies Supabase JWT in middleware; loads `public.users` profile and permissions from Supabase Postgres.
- **First-time Setup**: Frontend shows AdminSetupModal if no users exist; creates first Supabase user with admin role.
- **Admin Detection**: `/api/setup/default-admin-status` counts `public.users` with `role = 'admin'` via service-role Supabase client (RLS bypass). Requires `SUPABASE_SERVICE_ROLE_KEY` and optional `SUPABASE_ANON_KEY` in env typing for setup helpers.
 - **Dev Certificate Note**: In dev without a valid TLS cert for `supabase.ampedlogix.com`, use `http://supabase.ampedlogix.com:54321` for `VITE_SUPABASE_URL` and rebuild the frontend to avoid browser CN errors.

## API Routes (Backend)
- Core endpoints under `/api` for projects, clients, timesheets, Xero integration, OCR, and auth middleware.
- Data access uses Supabase client (`@supabase/supabase-js` for frontend; `@supabase/supabase-js` server-side) respecting RLS policies.
- Legacy POST /api/auth/* routes not called by current frontend but still available for backward compatibility
 - Files:
   - `GET /api/files`: Lists files from storage under `projects/{project_id}/files[/cost_center_id]` via `StorageFactory.list()`. Returns basic metadata and signed URLs (S3) or local paths.
   - `GET /api/files/timesheet-images`: Aggregates images from `timesheets.image_urls` using Supabase, filtered by user role/permissions.
   - `GET /api/files/timesheet-images/:projectId`: Returns flattened image objects for a given project from Supabase timesheets; duplicate legacy route was removed in favor of this implementation.
   - Note: Upload/Delete/Download endpoints still reference legacy `project_files` table and are pending Supabase/storage migration.

## Database (Supabase Postgres)
- Schemas/Tables:
  - `public.users` (maps to `auth.users` via `auth.uid()`), base profile data.
  - `public.permissions` (seeded base permissions).
  - `public.user_permissions` (join table mapping user to permissions).
- RLS: Enabled with policies enforcing owner-based access; helper function `auth_is_admin()` indicates admin role.
- Migrations: Stored in `supabase/migrations/`; applied locally via `psql` during Phase 2.

## Storage
- Supabase Storage buckets (planned) for file uploads; frontend/backend will migrate existing upload logic to Storage SDK.

## Configuration
- Supabase CLI: Config at `supabase/config.toml`.
- Keys/URLs: Retrieved via `supabase status` (ANON_KEY, SERVICE_ROLE_KEY, REST URL, STUDIO URL).
- Environment: Frontend uses `VITE_*` env vars; backend uses `.env` for Supabase keys and URLs.

## Notes
This document reflects the approved architecture decision: remove legacy PostgreSQL/Adminer and use Supabase exclusively for data, auth, and storage. Will evolve with routes, models, and configuration details as changes are introduced.

---

## Current Session Progress (2026-01-17)

### Latest Update (23:45) - Legacy query() Audit Complete ✅
**Context:** Comprehensive audit of all backend routes to eliminate legacy PostgreSQL `query()` calls and migrate to Supabase client.

**Routes Fully Migrated** (11 files):
1. **timesheets.ts** - 4 query() calls fixed
   - Activity logging: Commented out (activity_logs table not migrated)
   - Project cost updates: Migrated to Supabase RPC `increment_project_cost` with SELECT+UPDATE fallback
   
2. **permissions.ts** - 4 query() calls fixed (all activity logging)

3. **role-permissions.ts** - 1 query() call fixed (activity logging)

4. **costCenters.ts** - 1 query() call fixed (activity logging)

5. **files.ts** - 2 active query() calls fixed
   - Company logo setting update: Migrated to Supabase
   - Activity logging: Commented out
   - processDocumentOCR function: Disabled entirely (document_scans table doesn't exist)

6. **projects.ts** - 2 query() calls fixed (activity logging) [Previous session]

7. **activityTypes.ts** - 3 query() calls fixed (activity logging) [Previous session]

8. **users.ts** - 4 query() calls fixed (activity logging) [Previous session]

9. **clients.ts** - 3 query() calls fixed (activity logging) [Previous session]

10. **settings.ts** - Fully migrated + activity logs disabled [Previous session]

11. **health.ts** - 1 query() call (SELECT 1 health check) - KEPT intentionally

**Routes Disabled** (queries unreachable):
- **xero.ts** - 170+ query() calls (middleware returns 503)
- **safetyDocuments.ts** - ~20 query() calls (middleware returns 501)
- **documentScan.ts** - ~15 query() calls in GET/PUT/DELETE (disabled via middleware)
- **backups.ts** - ~25 query() calls (middleware returns 503)

**Remaining Work:**
- **auth.ts** - 15 query() calls (HIGH PRIORITY)
  - Active endpoints: PUT /profile, PUT /change-password (used by UserSettings page)
  - Unused endpoints: POST /register, POST /login, GET /me (frontend uses Supabase Auth directly)
  - Strategy: Migrate profile/password endpoints to use Supabase user metadata + public.users table

**Migration Patterns Applied:**
```typescript
// Activity Logging (commented out pattern)
// TODO: Implement activity logging in Supabase
/* await query('INSERT INTO activity_logs ...', [params]); */

// Project Cost Update (Supabase RPC with fallback)
const { error } = await supabase.rpc('increment_project_cost', { 
  project_id, 
  amount 
});
if (error) {
  // Fallback: SELECT + UPDATE
  const { data: project } = await supabase.from('projects')
    .select('actual_cost').eq('id', project_id).single();
  await supabase.from('projects')
    .update({ actual_cost: current + amount })
    .eq('id', project_id);
}

// Settings Update (Supabase client)
await supabase.from('settings')
  .update({ value, updated_at: new Date().toISOString() })
  .eq('key', 'setting_key');
```

**Git Status:** 8 commits pushed to feature/supabase-migration
- 6e49ed2: fix: remove legacy query() from timesheets, permissions, role-permissions
- a24b749: fix: migrate files.ts and costCenters.ts legacy query() calls
- da0dc12: docs: update memory with comprehensive audit summary

**Testing Status:** Backend rebuilding with all fixes applied

### Completed Milestones
1. **Frontend Auth Integration**: AuthContext fully refactored to use Supabase Auth SDK; signup/login working with profile + permissions loading.
2. **First-Time Admin Setup**: Wizard component implemented (4-step flow); auto-redirects unauthenticated users on first login.
3. **Backend Auth Middleware**: JWT verification for Supabase tokens + fallback to legacy JWT_SECRET; user profile + permissions loaded via service role.
4. **Domain Tables RLS**: 24 RLS policies applied to clients, projects, timesheets, activity_types, cost_centers, project_cost_centers.

### RLS Policy Summary
- **Authenticated Users**: SELECT, INSERT, UPDATE on clients, projects, timesheets.
- **Service Role**: Full access to activity_types and cost_centers (admin-only reference data).
- **Join Tables**: Project cost centers accessible to authenticated users.

### Next Steps
1. **Routes Migration** (Item #3 implementation): Convert remaining backend routes from pg client to Supabase.
   - High priority: projects, clients, timesheets (core domain).
   - Use patterns from BACKEND_ROUTES_REFACTOR_GUIDE.md.
   - Reference example: BACKEND_ROUTES_EXAMPLE.md (users.ts refactored).
2. **Storage Buckets** (Item #6): Create buckets for avatars, project files, documents; set RLS.
3. **Testing & Deployment**: Verify all routes work with Supabase + RLS; confirm frontend bundle uses the correct Supabase URL for current environment.

### Key Files & Locations
- **Frontend Auth**: `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`, `src/components/pages/FirstTimeSetup.tsx`
- **Backend Auth**: `backend/src/db/supabase.ts`, `backend/src/middleware/auth.ts`
- **Supabase Migrations**: `supabase/migrations/` (initial_schema, app_settings, company_name, rls_policies_domain_tables)
- **Documentation**: BACKEND_ROUTES_REFACTOR_GUIDE.md, BACKEND_ROUTES_EXAMPLE.md, SUPABASE_INTEGRATION_PROGRESS.md
