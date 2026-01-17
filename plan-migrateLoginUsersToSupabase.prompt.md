Thanks — I’ll draft a focused plan for login and users.

## Plan: Migrate Login + Users to Supabase

TL;DR: We’ll inventory old auth/user behaviors, pinpoint gaps, and replace them with Supabase Auth + Postgres queries guarded by RLS. The plan maps legacy endpoints (login, current user, user listing, permissions) to Supabase JS calls, defines RLS needed on `users`, `user_permissions`, and `permissions`, and notes React component changes for session handling, profile hydration, and admin-only views.

### Steps
1. Identify legacy auth/users behaviors and handlers in backend, and list routes we must replicate in the frontend.
2. Map login flow to `supabase.auth.signInWithPassword()` and session retrieval via `supabase.auth.getSession()` in frontend.
3. Replace “current user” endpoint with client-side profile hydration: `from('user_profiles')` by `auth.uid()` and aggregate permissions via `user_permissions` (string `permission` keys; optional join to `permissions` for labels).
4. Define RLS policies on `users`, `user_permissions`, `permissions` to allow per-user reads and admin-only listings; align `users.id` with `auth.uid()` UUID or store mapping.
5. Update React components: Login state, profile context, and admin users page to use Supabase queries, handle RLS errors, and show permission-aware UI. Align with existing `AuthContext` which already uses `supabase.auth.signInWithPassword()` and hydrates from `user_profiles`.

### Further Considerations
1. Identity alignment: Is `users.id` equal to `auth.uid()`? Option A: hard align UUIDs; Option B: add `auth_user_id` column.
2. Admin detection: Use `users.role='admin'` or a dedicated `admin` permission for list/update policies.
3. Token path: Keep `VITE_SUPABASE_URL` pointing to a domain where `/auth`, `/rest` proxy correctly; otherwise use Supabase Cloud.

— Draft for review below —

**1) Missing Endpoints (legacy vs. Supabase client)**
- Login: Legacy `POST /api/auth/login`; current frontend already uses `supabase.auth.signInWithPassword()` in AuthContext.
- Current user/me: Legacy `GET /api/users/me` (user + permissions); current frontend hydrates from `user_profiles` + `user_permissions` via `getCurrentUserProfile()`. Ensure RLS is set correctly.
- List users (admin): Legacy `GET /api/users`; not yet implemented against Supabase in frontend. Implement admin-only list from `user_profiles`.
- User permissions: Legacy resolved via `user_permissions` and sometimes `permissions`; frontend currently reads `user_permissions.permission` strings without join. Optional enhancement: join `permissions` for labels.

**2) Data Transformations once done in backend**
- User composite: Legacy `users` + `user_permissions` (and sometimes `permissions`). Current frontend composes user from `user_profiles` (role, name, avatar) + `user_permissions.permission[]`.
- Normalization: Legacy responded `{ user, permissions }`; current frontend expects `{ id, email, name, role, permissions, avatar }` built client-side.
- Admin checks: Legacy enforced admin-only on list/update. Current frontend needs admin gating (via `user_profiles.role`) and corresponding RLS.

**3) Step-by-Step Implementation (per feature)**

- Login
  - Supabase JS: `supabase.auth.signInWithPassword({ email, password })` then `supabase.auth.getSession()`; ensure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` are set and HTTPS proxy to `/auth` works.
  - RLS: None for auth; downstream queries need RLS on `user_profiles` and `user_permissions`.
  - React changes: Already wired via `AuthContext.login` and `getCurrentUserProfile()`. If 405 on `/auth/v1/token`, fix proxy paths or use Supabase Cloud.

- Current user/me (profile + permissions)
  - Supabase JS:
    - `const { data: { user } } = await supabase.auth.getUser()`
    - `const uid = user?.id`
    - `const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', uid).single()`
    - `const { data: perms } = await supabase.from('user_permissions').select('permission').eq('user_id', uid).eq('granted', true)`
  - RLS (SQL):
    - user_profiles: ENABLE RLS; policy “read own” USING `(id = auth.uid())`
    - user_permissions: ENABLE RLS; policy “read own perms” USING `(user_id = auth.uid())`
    - permissions (optional): for admin-only UI, allow SELECT to authenticated or gate via EXISTS.
  - React changes: Existing `AuthContext` already hydrates; ensure error handling for RLS denials shows meaningful messages.

- List users (admin-only)
  - Supabase JS:
    - `const { data: users } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false })`
    - Optionally fetch permissions per user via `user_permissions` or maintain a materialized view.
  - RLS:
    - user_profiles: policy “admin read all” USING `EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin')`
    - user_permissions: policy allowing admin to read any user’s permissions (similar EXISTS on current user role).
  - React changes: Admin Users page fetch conditioned on current user’s admin role; show “insufficient permissions” when RLS denies.

- Update user (admin-only, optional)
  - Supabase JS: `from('users').update({ role }).eq('id', targetId)` guarded by admin.
  - RLS: users update policy allowing only admin to update; optionally restrict fields.
  - React changes: Show edit controls only for admin; optimistic UI with error handling for RLS denials.

**4) RLS Policy Summary (SQL examples)**
- `ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;`
- `CREATE POLICY user_profiles_read_own ON user_profiles FOR SELECT USING (id = auth.uid());`
- `CREATE POLICY user_profiles_admin_read_all ON user_profiles FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'));`
- `CREATE POLICY user_profiles_admin_update ON user_profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'));`
- `ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;`
- `CREATE POLICY user_permissions_read_own ON user_permissions FOR SELECT USING (user_id = auth.uid());`
- `CREATE POLICY user_permissions_admin_read_all ON user_permissions FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'));`
- `ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;`
  - Option A: `CREATE POLICY permissions_read_all ON permissions FOR SELECT TO authenticated USING (true);`
  - Option B: Gate by EXISTS with current user’s role or mapping via `user_permissions`.

**5) Identity Alignment**
- Ensure `user_profiles.id` equals Supabase `auth.uid()` (current frontend already inserts with `id=auth.user.id`). If legacy `users` table remains, keep it for admin-only reports or migrate to `user_profiles`.

**6) Validation Against Current Codebase**
- Frontend `AuthContext` uses `supabase.auth.signInWithPassword()` and hydrates from `user_profiles` + `user_permissions` (string keys). Plan aligns with current patterns.
- Backend legacy routes for `users` perform server-side joins and default permission assignment; frontend replaces this with client-side hydration and optional DB triggers or manual inserts on register.
- RLS focuses on `user_profiles` and `user_permissions`, matching actual tables the frontend queries.

Would you like me to expand this with exact SQL policy statements and concrete component entry points in your Login page and user context/provider?