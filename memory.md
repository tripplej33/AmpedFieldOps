# Project Memory Log

## 2026-01-17

### Session: Initialize Self-Documenting Files
- User request: Initialize self-documenting files and create a branch from current pulled commit.
- Actions completed: Created `memory.md`, `mistakes_to_not_repeat.md`, `Internal_System_Documentation.md`, `prompt_for_more_context.md`; created branch `docs/self-documenting-state` from commit `fdd8c458d589ca6563fc6bfa631745f703c4959b`; committed and pushed.
- Context: Repo freshly cloned at detached HEAD and installed via `install.sh`; containers healthy.

### Session: Database Rework Planning
- User request: Plan complete rework to replace Postgres/Adminer with local Supabase Docker stack; start fresh (no data migration).
- Actions completed: Created comprehensive `Database_Rework.plan.md` covering:
  - Current architecture baseline (pg Pool, custom JWT auth, 20+ route files using raw SQL)
  - Target Supabase stack (Kong, GoTrue, PostgREST, Realtime, Storage, Studio)
  - Code changes required: Backend (replace `pg` with Supabase client in ~20 files), Frontend (add Supabase JS client for auth), Storage (migrate uploads to Supabase Storage)
  - 6-phase migration strategy (setup, schema, backend refactor, frontend refactor, Docker compose, testing)
  - Risks, rollback plan, success metrics
- Next steps: User approval, then begin Phase 1 (install Supabase CLI, test local stack).

### Session: Phase 1 Kickoff (Supabase Init & Start)
- Actions completed:
  - Verified Supabase CLI availability
  - Ran `supabase init` to scaffold project config
  - Started local Supabase stack (`supabase start`)
  - Verified Auth health (200) and Studio redirect
  - Created branch `feature/supabase-migration` and committed Supabase config
- Outcome: Local Supabase is up; ready to proceed to schema and auth integration.

### Session: Phase 2 (Schema & RLS)
- Actions completed:
  - Stopped and removed old Postgres/Adminer containers (ampedfieldops-db, ampedfieldops-db-ui)
  - Created initial Supabase migration: `public.users`, `permissions`, `user_permissions`
  - Added helper `auth_is_admin()` function and RLS policies
  - Seeded base permissions
  - Applied migrations via psql to local Supabase DB
- Next: Wire backend auth middleware to Supabase JWTs and refactor routes to use Supabase client.

### Session: Item #4 - Frontend AuthContext (Supabase Integration)
- User Request: "lets start with number 4 and then work from there"
- Actions completed:
  - Created `src/lib/supabase.ts` client initialization with env vars
  - Refactored `src/contexts/AuthContext.tsx` to use Supabase Auth SDK
  - Replaced API-based login/register with `supabase.auth.signUp/signInWithPassword`
  - Implemented `loadUserProfile()` async helper to fetch user + permissions
  - Added auth state listener via `onAuthStateChange()` with cleanup
  - Updated package.json with `@supabase/supabase-js` (v2.39.3)
  - Updated .env.example with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
  - Created FRONTEND_AUTHCONTEXT_INTEGRATION.md guide
  - Committed changes to feature/supabase-migration branch
- Outcome: Frontend auth now fully integrated with Supabase Auth; user profiles load from DB with permissions.
- Next: Item #5 - First-time admin setup detection and flow.

### Session: Item #5 - First-Time Admin Setup Flow
- User Request: "lets continue with front end, just review the files and continue"
- Actions completed:
  - Created `src/components/pages/FirstTimeSetup.tsx` component
    - Multi-step wizard: welcome → company → profile → complete
    - Welcome: overview of setup process
    - Company step: name, timezone, industry selection
    - Profile step: name, email (read-only), avatar URL
    - Complete step: success message with dashboard redirect
  - Updated AuthContext `loadUserProfile()` to detect first-time setup
    - Checks `app_settings.setup_complete` flag on every user load
    - Sets `isFirstTimeSetup` flag on User object
  - Created `app_settings` table migration
    - Tracks global setup_complete status and first_user_id
    - RLS policies: read-all, service_role write
    - Initialized with setup_complete = false
  - Added `company_name` column to users table
    - Stores company name configured during setup
  - Updated App.tsx routing
    - Added lazy-loaded `/setup` route
    - Enhanced ProtectedRoute to redirect to /setup if isFirstTimeSetup
    - Added user and isAuthenticated to AppRoutes context
  - Applied both migrations to local Supabase DB via psql
  - Committed all changes to feature/supabase-migration branch
- Outcome: Frontend first-time admin setup flow fully implemented; users redirected to setup on first login.
- Next: Backend implementation - Item #2 (auth middleware) or Item #1 (domain tables)

### Session: Items #2 & #3 - Backend Auth & Routes Refactor
- User Request: "items #2-#3 would be best"
- Actions completed for Item #2 (Backend Auth Middleware):
  - Enhanced `src/db/supabase.ts`:
    - Added `verifySupabaseToken()` helper
      - Decodes JWT and validates signature/expiration
      - Extracts userId from 'sub' claim and email from payload
      - Verifies issuer matches SUPABASE_URL
    - Added `loadUserWithPermissions()` helper
      - Uses service role to bypass RLS
      - Loads user profile from public.users table
      - Loads permissions via user_permissions join
      - Maps permission IDs to permission names
  - Updated `src/middleware/auth.ts`:
    - Refactored authenticate() to use verifySupabaseToken()
    - Maintains legacy JWT_SECRET fallback for backward compatibility
    - Load user context after JWT validation
    - Enhanced optionalAuth() for both JWT types
  - Added @supabase/supabase-js to backend package.json
  - Updated backend env.example with Supabase configuration
- Actions completed for Item #3 (Routes Refactor Guide):
  - Created BACKEND_ROUTES_REFACTOR_GUIDE.md:
    - Overview of pg vs Supabase client differences
    - Migration patterns for SELECT, INSERT, UPDATE, DELETE, JOIN
    - RLS policy considerations
    - Error handling patterns
    - Route migration priority list (high/medium/low)
    - Testing procedures
  - Created BACKEND_ROUTES_EXAMPLE.md:
    - Complete refactored users.ts example
    - All CRUD operations with Supabase client
    - Permission aggregation
    - Error codes and handling
    - Migration checklist
    - curl testing examples
- Outcome: 
  - Backend auth middleware ready to verify Supabase JWTs
  - Clear migration path for converting routes from pg to Supabase
  - Example implementation shows best practices
  - Documentation enables self-service route migration
- Status: Items #2 & #3 framework complete; routes ready for gradual migration
- Next: Item #1 (domain tables with RLS) or start migrating routes one by one
