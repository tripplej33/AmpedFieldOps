# 🗺️ Feature Implementation Roadmap
**AmpedFieldOps - Full Supabase Migration**

---

## 📊 Project Status Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Migration Progress: █████████████░░░░░░ 65% Complete       │
│                                                              │
│ ✅ Supabase Infrastructure    [DONE]                        │
│ ✅ Frontend Auth              [DONE]                        │
│ ⚠️  Backend Auth              [IN PROGRESS]                 │
│ 🔄 Route Migration            [65% - 13/20 routes]          │
│ ⏳ Legacy Cleanup             [PENDING]                     │
│ ⏳ Production Deployment      [PENDING]                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Current Sprint: Authentication & Login

### Goal
Enable full user authentication via Supabase Auth with working login at admin.ampedlogix.com

### Blockers
- [ ] Legacy PostgreSQL containers still running alongside Supabase
- [ ] Supabase migrations not fully applied to local DB
- [ ] Backend `/auth` routes still using legacy DB queries
- [ ] User profile sync between `auth.users` and `public.users` incomplete

### Success Criteria
- ✅ User can complete first-time admin setup
- ✅ User can login with Supabase Auth credentials
- ✅ JWT tokens issued by Supabase work across all API endpoints
- ✅ User profile + permissions load correctly

---

## 🏗️ Architecture: Current State

```
┌──────────────────────────────────────────────────────────────┐
│                         FRONTEND                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  React + Vite + Supabase Client                       │  │
│  │  - AuthContext (Supabase Auth) ✅                      │  │
│  │  - API Client (JWT from Supabase) ✅                   │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ├──► Nginx Proxy (/api → backend:3001)
                     │
                     └──► Supabase (127.0.0.1:54321)
                          - Auth (GoTrue) ✅
                          - PostgREST ✅
                          - Storage ✅
                          - Realtime ✅

┌──────────────────────────────────────────────────────────────┐
│                         BACKEND                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Express + Supabase Client                            │  │
│  │  - Auth Middleware (Supabase JWT verify) ✅            │  │
│  │  - Migrated Routes (13/20) ⚠️                          │  │
│  │  - Legacy Routes (7/20) ⏳                             │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ├──► Supabase DB (via service_role) ✅
                     │
                     └──► Legacy PostgreSQL ⚠️ [TO BE REMOVED]
```

---

## ✅ Completed Features

### Phase 1: Supabase Infrastructure (100%)
- [x] Install & configure Supabase CLI
- [x] Initialize local Supabase stack (Docker)
- [x] Configure environment variables (frontend + backend)
- [x] Add `host.docker.internal` mapping for container→host access
- [x] Supabase Studio accessible at http://127.0.0.1:54323

### Phase 2: Database Schema (100%)
- [x] Create `users`, `permissions`, `user_permissions` tables
- [x] Add helper function `auth_is_admin()`
- [x] Enable RLS on domain tables (clients, projects, timesheets, etc.)
- [x] Create 24 RLS policies for authenticated access
- [x] Seed base permissions and roles
- [x] Create `app_settings` table for global config

### Phase 3: Storage Buckets (100%)
- [x] Create 4 storage buckets (avatars, project-files, safety-documents, temp-uploads)
- [x] Configure RLS policies for storage (15 policies)
- [x] Set file size limits and MIME type restrictions

### Phase 4: Frontend Auth (100%)
- [x] Create Supabase client (`src/lib/supabase.ts`)
- [x] Refactor AuthContext to use Supabase Auth SDK
- [x] Implement signup/login via `supabase.auth`
- [x] Add auth state listener with cleanup
- [x] Build first-time admin setup wizard (AdminSetupModal)
- [x] Add setup status detection logic

### Phase 5: Backend Auth Middleware (100%)
- [x] Create Supabase client (`backend/src/db/supabase.ts`)
- [x] Add `verifySupabaseToken()` helper
- [x] Add `loadUserWithPermissions()` helper
- [x] Update auth middleware to verify Supabase JWTs
- [x] Maintain backward compatibility with legacy JWT_SECRET

### Phase 6: Route Migration (65% - 13/20)
**Completed Routes:**
- [x] `/api/clients` - Full CRUD with Supabase client
- [x] `/api/projects` - Complex joins, cost centers, financials
- [x] `/api/timesheets` - File handling, pagination
- [x] `/api/users` - User management with permissions
- [x] `/api/activity-types` - Reference data
- [x] `/api/cost-centers` - Reference data
- [x] `/api/permissions` - Permission management
- [x] `/api/role-permissions` - Role assignments
- [x] `/api/health` - System health checks
- [x] `/api/search` - Global search
- [x] `/api/setup/admin` - First-time admin creation (Supabase Auth)
- [x] `/api/setup/default-admin-status` - Setup checks
- [x] `/api/files` - Storage-backed listing/upload/download/delete; timesheet images via Supabase

**Pending Routes:**
- [ ] `/api/auth` - Login, register, password reset
- [ ] `/api/document-scan` - OCR integration (upload DB-free; listing/matches still legacy)
- [ ] `/api/settings` - App settings management
- [ ] `/api/dashboard` - Analytics & metrics
- [ ] `/api/backups` - Database backups
- [ ] `/api/troubleshooter` - System diagnostics
- [ ] `/api/safety-documents` - Safety doc management

---

## 🔄 In Progress

### 🎯 Sprint 1: Auth & Login (Current)
**Timeline:** Jan 17-18, 2026  
**Owner:** Agent + User

#### Tasks
- [ ] Stop and remove legacy PostgreSQL containers
- [ ] Apply all Supabase migrations cleanly
- [ ] Create trigger for auto-creating user profiles
- [ ] Migrate `/api/auth/login` to Supabase Auth
- [ ] Migrate `/api/auth/register` to Supabase Auth
- [ ] Test login flow end-to-end locally
- [ ] Deploy to production (admin.ampedlogix.com)
- [ ] Verify production login works

#### Acceptance Criteria
- User can login at admin.ampedlogix.com
- JWT tokens from Supabase work across all endpoints
- User profile + permissions load correctly
- First-time setup flow works for new deployments

---

## ⏳ Upcoming Sprints

### 🎯 Sprint 2: Complete Route Migration
**Timeline:** Jan 19-21, 2026  
**Dependencies:** Sprint 1 complete

#### Tasks
- [ ] Migrate `/api/settings` to Supabase client
- [ ] Migrate `/api/dashboard` to Supabase client
- [ ] Migrate `/api/document-scan` (keep OCR service, update DB calls)
- [ ] Migrate `/api/backups` to Supabase backup strategy
- [ ] Migrate `/api/troubleshooter` to Supabase diagnostics
- [ ] Migrate `/api/safety-documents` to Supabase Storage
- [ ] Remove all `pg` Pool imports from backend
- [ ] Update tests to use Supabase client
- [ ] Document new API patterns

#### Acceptance Criteria
- Zero legacy database queries in codebase
- All routes use Supabase client or Storage SDK
- RLS policies enforce proper access control
- Test coverage >80% for migrated routes

---

### 🎯 Sprint 3: Production Hardening
**Timeline:** Jan 22-24, 2026  
**Dependencies:** Sprint 2 complete

#### Tasks
- [ ] Set up production Supabase project (managed or self-hosted)
- [ ] Configure production environment variables
- [ ] Set up automated database backups
- [ ] Implement rate limiting on auth endpoints
- [ ] Add monitoring & alerting (Supabase logs)
- [ ] Configure CORS for production domain
- [ ] SSL/TLS certificate management
- [ ] Load testing & performance tuning
- [ ] Security audit of RLS policies
- [ ] Penetration testing

#### Acceptance Criteria
- Production Supabase project configured
- Zero downtime deployment pipeline
- Automated backups running daily
- Monitoring dashboards operational
- Security audit passes

---

### 🎯 Sprint 4: Feature Enhancements
**Timeline:** Jan 25-28, 2026  
**Dependencies:** Sprint 3 complete

#### Tasks
- [ ] Real-time updates via Supabase Realtime
  - Live timesheet updates
  - Project activity feed
  - Notification system
- [ ] Advanced file management
  - Drag & drop upload to Storage
  - File versioning
  - Automatic thumbnail generation
- [ ] Enhanced search with PostgREST full-text
- [ ] Audit trail improvements (Supabase triggers)
- [ ] Mobile-responsive UI polish
- [ ] Dark mode refinement

#### Acceptance Criteria
- Real-time features working across browser tabs
- File upload UX smooth and reliable
- Search returns relevant results <500ms
- Audit trail captures all critical actions

---

## 🚀 Future Roadmap (Q1-Q2 2026)

### Advanced Features
- **AI/ML Integration**
  - Smart document classification (OCR improvements)
  - Predictive project cost analysis
  - Automated time entry suggestions
  
- **Mobile App**
  - React Native or Flutter
  - Offline-first sync with Supabase
  - GPS tracking for field workers
  
- **Integrations**
  - Slack/Teams notifications
  - Calendar sync (Google, Outlook)
  - Payment gateways (Stripe, Square)
  - Additional accounting platforms

- **Advanced Analytics**
  - Custom dashboards with charts
  - Export to Excel/PDF
  - Scheduled email reports
  - KPI tracking

### Infrastructure
- **Multi-tenancy**
  - Organization-based data isolation
  - Tenant-specific RLS policies
  - Custom domains per tenant
  
- **High Availability**
  - Multi-region Supabase deployment
  - CDN for frontend assets
  - Database read replicas
  
- **Compliance**
  - GDPR compliance features
  - SOC 2 audit preparation
  - Data retention policies

---

## 📝 Technical Debt

### High Priority
- [ ] Remove all legacy PostgreSQL references
- [ ] Consolidate duplicate migration files
- [ ] Update documentation (remove pg references)
- [ ] Refactor error handling to use Supabase error codes
- [ ] Type safety: Generate TypeScript types from Supabase schema

### Medium Priority
- [ ] Migrate from `docker-compose.yml` v2 to v3 format
- [ ] Optimize bundle size (frontend)
- [ ] Add E2E tests with Playwright
- [ ] Improve test coverage (currently ~40%)
- [ ] Set up CI/CD pipeline (GitHub Actions)

### Low Priority
- [ ] Refactor large components (>500 lines)
- [ ] Add Storybook for component documentation
- [ ] Implement design system
- [ ] Accessibility audit (WCAG 2.1 AA)

---

## 🎓 Knowledge Base

### Key Decisions
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-17 | Full Supabase migration | Unified auth, better RLS, managed infrastructure |
| 2026-01-17 | Remove legacy DB | Simplify architecture, reduce maintenance |
| 2026-01-17 | Frontend uses Supabase Auth directly | Faster auth flow, better UX, session management |
| 2026-01-17 | Backend verifies Supabase JWTs | Centralized auth, no duplicate user tables |

### Architecture Patterns
- **Frontend:** Supabase client for auth, API client for business logic
- **Backend:** Supabase service_role for RLS bypass, PostgREST for queries
- **Storage:** Supabase Storage with RLS for file access control
- **RLS:** Policies use `auth.uid()` to match `public.users.id`

### Common Pitfalls (See `mistakes_to_not_repeat.md`)
- Ensure `auth.users.id` matches `public.users.id` (UUID sync)
- Use `host.docker.internal` for containers to reach host Supabase
- Set `VITE_API_URL` to empty string (Nginx proxies `/api`)
- Rebuild frontend when changing `VITE_*` env vars

---

## 📞 Support & Resources

### Documentation
- [Supabase Docs](https://supabase.com/docs)
- [PostgREST API Reference](https://postgrest.org/en/stable/api.html)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)

### Internal Docs
- `Internal_System_Documentation.md` - Architecture overview
- `memory.md` - Session history and decisions
- `mistakes_to_not_repeat.md` - Known issues and fixes
- `BACKEND_ROUTES_REFACTOR_GUIDE.md` - Route migration patterns

### Contact
- Project Lead: [User]
- Development Agent: GitHub Copilot (Claude Sonnet 4.5)
- Deployment: admin.ampedlogix.com

---

**Last Updated:** January 17, 2026  
**Next Review:** After Sprint 1 completion
