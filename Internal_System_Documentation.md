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
- Feature_Implementation_Roadmap.md

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
