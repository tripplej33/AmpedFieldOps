# AmpedFieldOps - System Architecture & Documentation

## Project Overview
AmpedFieldOps is a service management platform with a React/Vite frontend, Node/Express backend, and Supabase as the unified data/auth platform.

## Architecture Summary
- Frontend: React 18 + Vite, served behind nginx.
- Backend: Node.js + Express; uses Supabase client for database access and JWT verification.
- OCR: Python Flask service for document processing.
- Data Platform: Supabase (Postgres, GoTrue Auth, PostgREST, Realtime, Storage, Studio).
- Deployment: Docker Compose orchestrates frontend, backend, Supabase stack, Redis, OCR.

## Auth
- Provider: Supabase GoTrue.
- Backend: Verifies Supabase JWT in middleware; loads `public.users` profile and permissions.
- First-time Setup: Frontend `signUp` creates a Supabase user; app inserts corresponding `public.users` profile with admin permission for the first user.

## API Routes (Backend)
- Core endpoints under `/api` for projects, clients, timesheets, Xero integration, OCR, and auth middleware.
- Data access uses Supabase client (`@supabase/supabase-js` for frontend; `@supabase/supabase-js` or `@supabase/postgrest-js` server-side) respecting RLS policies.

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
1. **Routes Migration** (Item #3 implementation): Convert 20+ backend routes from pg client to Supabase.
   - High priority: projects, clients, timesheets (core domain).
   - Use patterns from BACKEND_ROUTES_REFACTOR_GUIDE.md.
   - Reference example: BACKEND_ROUTES_EXAMPLE.md (users.ts refactored).
2. **Storage Buckets** (Item #6): Create buckets for avatars, project files, documents; set RLS.
3. **Testing & Deployment**: Verify all routes work with Supabase + RLS.

### Key Files & Locations
- **Frontend Auth**: `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`, `src/components/pages/FirstTimeSetup.tsx`
- **Backend Auth**: `backend/src/db/supabase.ts`, `backend/src/middleware/auth.ts`
- **Supabase Migrations**: `supabase/migrations/` (initial_schema, app_settings, company_name, rls_policies_domain_tables)
- **Documentation**: BACKEND_ROUTES_REFACTOR_GUIDE.md, BACKEND_ROUTES_EXAMPLE.md, SUPABASE_INTEGRATION_PROGRESS.md
