# Frontend AuthContext Integration Plan

## Completed: Item #4 - Frontend AuthContext for Supabase

### Changes Made

#### 1. **Created `src/lib/supabase.ts`**
- Initialize Supabase client with environment variables
- Configure auto-refresh and session persistence
- Support both local (port 54321) and cloud Supabase URLs

#### 2. **Refactored `src/contexts/AuthContext.tsx`**
- **Replaced** old `/api/auth` calls with Supabase Auth SDK
- **Added** `Session` type import from `@supabase/supabase-js`
- **Implemented** async `loadUserProfile()` helper function:
  - Fetches user record from `public.users` table
  - Loads permissions from `user_permissions` → `permissions` tables
  - Returns enriched `User` object with role and permissions
- **Refactored** `AuthProvider`:
  - Uses `supabase.auth.getSession()` on mount
  - Subscribes to auth state changes via `onAuthStateChange()`
  - Cleans up subscription on unmount
- **Updated** auth methods:
  - `login()` → uses `supabase.auth.signInWithPassword()`
  - `signup()` → uses `supabase.auth.signUp()` + inserts profile in `public.users`
  - `logout()` → uses `supabase.auth.signOut()`
- **Added** `session` to context for frontend to access JWT if needed

#### 3. **Updated Dependencies**
- Added `@supabase/supabase-js` (v2.39.3) to `package.json`

#### 4. **Updated `.env.example`**
- Added `VITE_SUPABASE_URL` (defaults to local: `http://127.0.0.1:54321`)
- Added `VITE_SUPABASE_ANON_KEY` (placeholder; set from `supabase status` output)

---

## Next: First-Time Admin Setup Flow (Item #5)

### Current Status of First-Time Setup
- **DB Schema**: `public.users` table exists with `email`, `name`, `role`, `avatar` fields
- **RLS Policies**: User can only read/update their own record
- **Auth**: Supabase Auth handles user creation; app profile is inserted on signup
- **Permission Seeding**: Base permissions seeded in `public.permissions` (read, write, delete, admin, etc.)

### Required Implementation: First-Time Setup Detection & Flow

#### Step 1: Add First-Time Setup Detection to AuthContext
When a user signs up or logs in for the first time:
1. Check if `public.users` count is 1 (first user in system)
2. Set `isFirstTimeSetup` flag on user object
3. Redirect to `/setup` page on frontend

#### Step 2: Create `/setup` Page (Frontend Component)
- Check `user.isFirstTimeSetup` and redirect to `/login` if false
- Multi-step form:
  1. **Company Info**: name, timezone, industry
  2. **Admin Profile**: name (pre-filled from signup), avatar (optional)
  3. **Integrations**: Xero API key (optional), OCR service (optional)
- On completion:
  - POST to `/api/setup/complete` endpoint
  - Mark setup as complete in backend
  - Redirect to dashboard

#### Step 3: Create Backend Endpoints (Item #2 Prerequisite)
- `POST /api/setup/status` → check if setup is complete
- `POST /api/setup/company` → save company info
- `POST /api/setup/profile` → update admin profile
- `POST /api/setup/complete` → finalize setup

#### Step 4: Add Setup Status Tracking to DB
New migration required:
```sql
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_complete BOOLEAN DEFAULT FALSE,
  first_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Implementation Roadmap

### Immediate (Ready Now)
- ✅ AuthContext Supabase integration (DONE)
- ⏭️ First-time admin setup detection (UI + DB tracking)

### Following Items
1. Define `projects`, `clients`, `timesheets` tables with RLS (Item #1)
2. Backend auth middleware for JWT verification (Item #2)
3. Backend route refactor to Supabase client (Item #3)
4. Storage bucket setup for file uploads (Item #6)

---

## Important Notes

### Frontend Usage
```typescript
// In any component
const { user, isAuthenticated, login, signup, logout, session } = useAuth();

// Check setup status
if (user?.isFirstTimeSetup) {
  // Redirect to /setup
}

// Access JWT for direct REST calls (if needed)
const token = session?.access_token;
```

### Environment Setup Before Build
```bash
# Get keys from Supabase local stack
supabase status

# Set in .env.local (or environment)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon_key_from_status>
```

### Testing the New AuthContext
1. Ensure Supabase stack is running (`supabase start`)
2. Build/run frontend (`npm install && npm run dev`)
3. Navigate to `/login` or `/signup`
4. Test login/signup flow; verify user profile loads and permissions appear

---

## Known Limitations & Future Improvements

1. **Email Verification**: Current setup does not verify email; consider adding email confirmation flow
2. **Password Reset**: Supabase supports magic links; implement in future step
3. **OAuth Providers**: Can add Google/GitHub login via Supabase once tested
4. **Session Timeout**: Frontend should handle token refresh via `supabase.auth.refreshSession()`
