# Mistakes & Issues to Not Repeat

## Documentation
- Keep this file updated when encountering bugs or logic errors.
- Reference this before suggesting architectural changes.

## Known Issues
- Supabase CLI `db push` error: "Cannot find project ref" when not linked.
  - Fix: Use `supabase link` to a remote project, or apply SQL locally via `psql` in the `supabase_db_*` container.
- PostgREST auth testing confusion (401 vs 403):
  - 401 Unauthorized indicates missing/invalid JWT or wrong header usage.
  - 403 Forbidden indicates RLS policy denied for the role/claims of the provided JWT.
  - Use the correct token: ANON JWT for public reads, user JWT for authenticated reads, and perform privileged server-side operations via Supabase server client (SERVICE_ROLE_KEY) instead of direct REST calls.
- Legacy DB/Adminer left running can cause confusion.
  - Fix: Stop/remove `ampedfieldops-db` and `ampedfieldops-db-ui` when migrating to Supabase.
- Orphan admin in `public.users` blocks first-time setup.
  - Cause: A leftover `public.users` admin row exists without a matching `auth.users` account, so a public-only check falsely detects an admin.
  - Fix: Treat Supabase Auth as source-of-truth; check admins via `supabase.auth.admin.listUsers()` and, during setup, delete orphan `public.users` admin rows that do not have a corresponding Auth email.
- **CRITICAL: `handle_new_user()` trigger function references non-existent columns** (2026-01-17)
  - Cause: Migration `20260117110000_auto_create_user_profile.sql` tried to insert `password_hash`, `avatar`, and `is_active` columns that don't exist in `public.users` table.
  - Schema mismatch: `public.users` actually has columns: `id`, `email`, `name`, `role`, `avatar_url`, `created_at`, `updated_at`, `company_name` (no `password_hash` or `is_active`).
  - Error: "column 'password_hash' of relation 'users' does not exist" when creating new auth users.
  - Fix applied: Updated `handle_new_user()` function to only insert valid columns: `id`, `email`, `name`, `role`, `avatar_url`. Password is managed by `auth.users`, not `public.users`.
  - Fix migration file: `supabase/migrations/20260117110000_auto_create_user_profile.sql` now has corrected columns.
  - Test: Successfully created admin user with corrected trigger.
  - Lesson: Always verify target table schema before writing trigger/migration that references it. Use `\d table_name` in psql to inspect.
- **Proxy middleware must be placed BEFORE body-parser** (2026-01-17)
  - Cause: `http-proxy-middleware` registered AFTER `express.json()` body-parser at line 89
  - Symptom: GET requests through proxy work fine, but POST requests with JSON bodies hang/timeout/return 502 Bad Gateway
  - Root cause: `express.json()` consumed the request body stream before proxy could forward it to upstream server
  - Logs showed: `onProxyReq` callback fired but request never completed (no `onProxyRes` or `onError` callback)
  - Fix: Moved proxy middleware registration to line 90, immediately AFTER CORS and BEFORE body-parser middleware
  - Code pattern: `app.use(cors()); app.use('/proxy', createProxyMiddleware()); app.use(express.json());`
  - Lesson: Proxies need raw request stream access - place them before ANY body-consuming middleware (json, urlencoded, multipart)

## CRITICAL: Missing Required Columns in INSERT/UPDATE Payloads (2026-01-19)
- **Cause:** Creating clients/projects returned 400 "Bad Request" from Supabase REST API OR clients/projects created but not appearing in list
- **Root Issue:** Supabase query helpers were not including ALL required columns when inserting records
  - All tables have `company_name` column that is required (not nullable)
  - `clients`, `projects`, `activity_types`, `cost_centers` all need `company_name` 
  - `timesheets` needs `is_submitted` and `is_approved` booleans
  - Frontend forms weren't collecting these fields, so inserts were missing required data
  - **UPDATE (2026-01-19):** Also found missing form fields: `client_type` in clients, numeric type casting in projects
- **Error Pattern:** POST `/api/supabase/rest/v1/{table}?columns=...&select=* 400 Bad Request`
  - URL showed columns like `location`, `notes`, `client_type` that don't exist in actual schema
  - This was confusing; root cause was missing `company_name` not the column names themselves
- **Fix Applied:** Added default values for required columns in all INSERT payloads:
  - `createClient()`: Added `company_name: client.company_name || 'Default'` AND `client_type: client.client_type ?? 'customer'`
  - `createProject()`: Added `company_name: project.company_name || 'Default'` AND `budget: project.budget ? parseFloat(project.budget) : 0`
  - `createActivityType()`: Added `company_name: type.company_name || 'Default'`
  - `createCostCenter()`: Completely rewrote payload, added `company_name: 'Default'` and proper type hints
  - `createTimesheet()`: Added `is_submitted: false` and `is_approved: false` defaults
- **Numeric Field Casting Issue (2026-01-19):** Budget and hourly_rate came as strings from form, needed parseFloat() conversion
  - Without casting: Supabase might accept them as text or throw type mismatch error
  - Fix: Check form fields for numeric types and use parseFloat() before inserting
- **Form Field Mapping Issue (2026-01-19):** UI form uses different field names than database schema
  - Form: `location`, `notes`, `client_type` | Database: `address`, `description`, `client_type`
  - Fix: In createClient/createProject, map: `address: client.address ?? client.location`
  - Prevention: Always check form field names vs database column names; document mapping in comments
- **Prevention Checklist:** For every INSERT/UPDATE payload:
  1. Query actual schema: `\d+ public.{table}` to see all columns
  2. Check for NOT NULL constraints or defaults
  3. If column has no default and is NOT NULL, add it to payload with sensible default
  4. Document required columns in code comments
  5. Check form field names match database column names; add mapping comments
  6. For numeric fields, use parseFloat() if they come from form inputs
  7. Add console.log() statements to debug payloads in browser console
  8. Test with minimal form data to catch missing fields early
- **Pattern for Required Columns:**
  ```typescript
  const payload: Record<string, any> = {
    // Required fields (no defaults)
    name: record.name,
    // Optional fields with defaults
    is_active: record.is_active ?? true,
    // Required company_name - ALWAYS NEEDED
    company_name: record.company_name || 'Default',
    // Map form fields to schema columns
    address: record.address ?? record.location ?? '',
    // Numeric fields from forms need casting
    budget: record.budget ? parseFloat(record.budget) : 0,
    // Track who created it
    created_by: await currentUserId(),
  };
  console.log('[createRecord] Inserting payload:', payload);
  ```

## CRITICAL: Missing Required Columns in INSERT/UPDATE Payloads (2026-01-19)
- Do not commit secrets or private keys (`.env`, `ssl/`).
- Prefer Docker network service names over `localhost` for inter-container calls.
- Rebuild frontend when changing `VITE_*` env vars; they’re baked at build time.
- Test RLS policies with the appropriate JWTs and role claims; document expected access for anon vs authenticated users.
- **Frontend in Docker cannot access `localhost:54321` - Supabase runs on host**: Use `host.docker.internal:54321` in docker-compose.yml environment variables AND add `extra_hosts` mapping for proper host access from containers.
- **Supabase env vars must be set for both frontend and backend**: Frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, backend needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Missing these causes "supabaseKey is required" errors.
- **Mixed Content Errors (HTTPS page loading HTTP resources)**: When deploying to HTTPS domains, `VITE_API_URL` must NOT use `http://backend:3001` or any absolute HTTP URL. Browser cannot access Docker network hostnames and blocks mixed HTTP/HTTPS content.
- **Double /api prefix (404 errors)**: `VITE_API_URL` must be empty string, not `/api`. Frontend code already includes `/api` prefix in all endpoint paths (e.g., `/api/health`). Setting `VITE_API_URL=/api` causes double prefix `/api/api/health`. Nginx proxies `/api/*` to backend service.
- **RLS 403 Forbidden on Supabase queries**: When users authenticate via Supabase Auth (`auth.users`), they must have a matching record in `public.users` with the same UUID. The RLS policy `users_read_own` checks `auth.uid() = id`. If `public.users` has a different UUID than `auth.users` for the same email, queries return 403 permission denied. Solution: Sync user IDs between `auth.users` and `public.users`, and create a trigger to auto-create profiles on signup.
- **First-time setup reset**: To reset the app for a fresh first-time setup flow, delete all records from `auth.users`, `public.users`, `user_permissions`, and `settings` tables. The frontend will then detect no admin exists and show the AdminSetupModal for initial configuration. Use transaction to ensure all deletes succeed together.
 - **Browser TLS CN error for Supabase Auth**: `net::ERR_CERT_COMMON_NAME_INVALID` occurs when `VITE_SUPABASE_URL` uses HTTPS with a cert not valid for `supabase.ampedlogix.com`. Fix by either installing a valid certificate (preferred) or using HTTP for dev (`http://supabase.ampedlogix.com:54321`) and rebuilding the frontend.
 - **Compiled dist vs source mismatch in backend**: Copying updated TypeScript files into the running container won’t take effect until you rebuild `/app/dist`. Ensure `tsconfig.json` exists in `/app`, run `npm run build` inside the container, then `docker restart ampedfieldops-api`.
 - **TypeScript build continues despite errors**: Our build script uses `tsc ; vite build` which allows asset emission even with TypeScript errors. For stricter CI, use `tsc && vite build` or fix reported types (`never`/implicit `any`).
- **Undefined variable in auth profile loader**: `loadUserProfile` referenced an undefined `client` variable for permissions/app_settings queries, causing runtime failures and leaving `user` null after login. Always ensure shared clients are correctly referenced and rebuild immediately after refactoring helper functions.
- **API client token not set after Supabase login**: Dashboard API calls returned 401 because `api.setToken` was only called in AdminSetup flow, not during normal Supabase auth. Always propagate `session.access_token` to the API client on init, auth state change, and login.
- **Permissions column mismatch**: `user_permissions` uses column `permission` (FK to `permissions.key`), not `permission_id`. Referencing `permission_id` causes 400 errors from PostgREST. Align queries to the actual schema.
- **Dashboard still calling legacy DB**: Hitting dashboard endpoints through pg `query()` after migrating to Supabase caused 500s. Ensure all routes use Supabase client once the legacy DB is removed.
- **Setup completion via client-side Supabase**: Updating `app_settings` from the browser failed (RLS + invalid filter). Use backend service-role endpoint `/api/setup/complete` instead.
 - **Duplicate route definitions override earlier handlers**: Defining the same path twice in Express registers both; the later definition will capture requests and shadow the earlier one. Always remove legacy duplicates when migrating routes to avoid unexpected behavior.
## Recent Migrations (Jan 17, 2026)
- **Supabase Migration Complete**: All legacy PostgreSQL removed. Backend code must not require DATABASE_URL.
  - Issue: `backend/src/config/env.ts` validated `DATABASE_URL` as required, blocking startup when removed from env.
  - Fix: Made `DATABASE_URL` optional in env validation; updated `backend/src/db/index.ts` to conditionally create pool.
  - Lesson: When removing infrastructure (databases, services), audit ALL environment validation and initialization code, not just docker-compose.yml.
- **Legacy Database Cleanup**: Migration scripts still tried to run against legacy database.
  - Issue: `backend/docker-entrypoint.sh` executed npm migrations/seeds which failed when PostgreSQL was removed.
  - Fix: Skipped legacy migration/seed scripts in entrypoint; all DB changes now via Supabase migrations.
  - Lesson: When removing a service, check ALL initialization scripts that reference it (entrypoint, build scripts, startup hooks).
- **Firewall Ports Must Be Documented First**: User had to manually open port 54321, slowing deployment.
  - Lesson: ALWAYS document ALL required ports/firewall rules BEFORE any other setup steps.
- **Frontend Environment Variables Baked at Build Time**: Changing VITE_SUPABASE_URL required full frontend rebuild.
- **Production Supabase URL Must Be Proxy-Accessible from Browser**: 
  - Issue: Frontend initially pointed to http://127.0.0.1:54321, inaccessible from browser on remote network.
  - Fix: Updated to https://supabase.ampedlogix.com (via Nginx Proxy Manager) so browser can reach Supabase Auth.
  - Lesson: Test VITE_SUPABASE_URL from actual client browser, not just from inside Docker.

## Supabase Migration Patterns (2026-01-17)

### Legacy query() Audit Learnings
- **Activity Logging Pattern**: All activity_logs table INSERT queries can be safely commented out during migration. The activity_logs table was never migrated to Supabase, and activity logging is a non-critical feature. Pattern used:
  ```typescript
  // TODO: Implement activity logging in Supabase
  /* await query('INSERT INTO activity_logs ...', [params]); */
  ```

- **Project Cost Updates Need Arithmetic**: Simple Supabase `.update()` cannot do `actual_cost = actual_cost + amount`. Must use either:
  1. **Supabase RPC function** (preferred): Create `increment_project_cost(project_id uuid, amount numeric)` in migration
  2. **SELECT + UPDATE fallback**: Fetch current value, calculate new value, then update
  
- **Document Processing Dead Code**: `processDocumentOCR` function and all related document_scans/document_matches queries were dead code (tables never migrated). Should be disabled early with clear error messages rather than let them fail silently.

- **Settings Table Migration**: Legacy `settings` table with key-value pairs migrated successfully to Supabase. Use `.upsert()` for idempotent updates and handle `updated_at` explicitly since Supabase doesn't auto-update timestamps.

- **Disabled Routes Are Safe**: Routes disabled via early middleware return (503/501) don't need query() migration. Their query() calls are unreachable. Verified for: xero.ts (170+ calls), safetyDocuments.ts (~20 calls), backups.ts (~25 calls).

- **Auth Route Complexity**: Backend auth.ts has 15+ query() calls but only PUT /profile and PUT /change-password are actively used. POST /register and POST /login are unused (frontend uses Supabase Auth directly). Selective migration needed.

- **Health Check Queries Are Acceptable**: Simple `SELECT 1` health checks can remain as legacy query() calls - they don't depend on specific tables and provide useful diagnostics.

### Multi-Replace Conflicts
- When using `multi_replace_string_in_file` on the same file, edits can conflict if they overlap or change line numbers. Solution: Do one replacement at a time or ensure no overlap between target strings.

### Query() Call Categories
1. **Activity Logging** - Comment out (table doesn't exist)
2. **Business Logic** - Migrate to Supabase client (.select(), .insert(), .update(), .delete())
3. **Arithmetic Operations** - Use RPC or SELECT+UPDATE
4. **Dead Code** - Disable function entirely with early error throw
5. **Health Checks** - Safe to keep

## CRITICAL: Deleted API Routes But Frontend Still Calls Them (2026-01-19)
- **Cause:** Deleted 15 backend route files (clients.ts, projects.ts, timesheets.ts, activityTypes.ts, costCenters.ts, etc.) but forgot to check if frontend components were calling `api.getClients()`, `api.getProjects()`, etc. via the old API client class.
- **Symptom:** After backend rebuild, frontend returns 500/501 errors: "POST /api/clients 500", "GET /api/activity-types 500", etc.
- **Root Issue:** 
  1. Created new `supabaseQueries.ts` with direct Supabase helpers (getClients, createClient, etc.)
  2. Updated 4 major components (Clients.tsx, Projects.tsx, Timesheets.tsx, ActivityTypes.tsx) to import from supabaseQueries
  3. BUT left `src/lib/api.ts` intact with methods like `getClients()`, `createClient()` that call `/api/clients` endpoint
  4. 20+ other components (Files, SafetyDocuments, DocumentScan, Financials, CostCenters, Modals) still call `api.getClients()`, `api.getProjects()`, etc.
  5. Deleted the backend routes, so these calls now fail with 500 (no handler) or 501 (middleware returns unimplemented)
- **Impact:** App is broken for 20+ components; users cannot interact with non-migrated pages
- **Fix Applied:** 
  1. Search all components for `api.getClients`, `api.getProjects`, `api.getTimesheets`, `api.getActivityTypes`, `api.getCostCenters`
  2. Replace with imports from supabaseQueries helpers
  3. Rebuild frontend
- **Prevention:** When deleting backend routes, ALWAYS grep the entire codebase for calls to those endpoints (e.g., `api.getClients`, `/api/clients`, `POST /api/clients`) and update them to use direct Supabase queries BEFORE deleting the routes. Use this pattern:
  ```bash
  grep -r "api\.getClients\|api\.createClient\|/api/clients" src/
  grep -r "api\.getProjects\|api\.createProject\|/api/projects" src/
  grep -r "api\.getTimesheets\|/api/timesheets" src/
  ```
