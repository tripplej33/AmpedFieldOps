# AmpedFieldOps - System Architecture & Documentation

## 📋 Project Overview
**AmpedFieldOps** is an electrical contracting service management platform (mobile-first) that orchestrates:
- Client relationships & project workflows
- Timesheet capture with photo functionality
- Xero financial integration (invoices, quotes, bills, expenses, POs)
- Role-based user management with granular permissions
- Safety document management with PDF generation
- OCR document processing with automatic matching
- Real-time dashboard with project health metrics

---

## 🏗️ Architecture

### Tech Stack
| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS + Shadcn/UI (Radix) |
| **Backend** | Node.js + Express |
| **Database** | Supabase (PostgreSQL) + Realtime |
| **Storage** | Supabase Storage (S3-compatible) |
| **OCR** | Python Flask service with document processing |
| **Auth** | Supabase Auth (email/password + OAuth) |
| **API Integration** | Xero API for financial data |
| **Deployment** | Docker (Compose) - Frontend, Backend, OCR containers |
| **Email** | Nodemailer with admin SMTP config |

### Directory Structure
```
AmpedFieldOps/
├── frontend/        (Vite + React - src/)
│   ├── components/  (UI components + pages)
│   ├── contexts/    (Auth, Notifications)
│   ├── lib/         (API calls, Supabase queries, realtime)
│   └── types/       (TypeScript interfaces)
├── backend/         (Express + TypeScript)
│   ├── src/
│   │   ├── routes/     (API endpoints)
│   │   ├── middleware/ (Auth, error handling)
│   │   ├── db/         (Query builders, migrations)
│   │   ├── jobs/       (Background tasks)
│   │   └── config/     (Environment setup)
│   └── jest.config.js (Testing)
├── ocr-service/     (Python Flask)
│   ├── services/    (Document classifier, OCR engine, parser)
│   ├── models/      (Pydantic schemas)
│   └── utils/       (Image processing helpers)
├── supabase/        (Migrations, auth policies)
└── docker-compose.yml (Orchestration)
```

---

## 🔌 API Routes (Backend)

### Core Modules
- **Authentication:** Supabase Auth (handled via middleware)
- **Projects:** CRUD operations, status tracking
- **Clients:** Client directory and contact management
- **Timesheets:** Time entry creation, photo upload, activity type linking
- **Xero Integration:** Invoice sync, expense submission, PO management
- **Users & Roles:** Permission-based access control
- **Documents:** Safety documentation (JSA, Electrical Compliance)
- **OCR:** Document upload → processing → auto-matching
- **Reports:** Cost center analysis, budget tracking
- **Email Config:** Admin SMTP settings with test functionality

---

## 💾 Database Schema Highlights
- **users** - Auth + role assignment
- **projects** - Project metadata, budget tracking, status
- **clients** - Client info, contact details
- **timesheets** - Time entries with activity types, photo references
- **activity_types** - Work categories with hourly rates
- **xero_sync_logs** - Integration tracking
- **documents** - Safety docs, PDF generation metadata
- **ocr_results** - Processed document data
- *(See supabase/migrations/ for full schema)*

---

## 🚀 Deployment

### Local Development
```bash
./install-local.sh  # Frontend + Backend locally
```

### Docker (Recommended)
```bash
./install.sh  # Full containerized stack
```
- **Frontend:** http://localhost:3000 or :5173
- **Backend:** http://localhost:8000 (or defined port)
- **OCR Service:** Internal service on configured port

### Environment Configuration
- `.env` contains Supabase keys, Xero credentials, SMTP settings
- Stored in root directory (not committed)

### Supabase Keys Automation (2026-01-16)
- Installer (`install.sh`) auto-populates `.env` with `SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
- Uses `scripts/fetch_supabase_keys.sh` to parse `supabase status --output json` via `jq` or Node fallback.
- When Supabase CLI is missing, the installer appends local defaults for `VITE_SUPABASE_URL`/`SUPABASE_URL` and the local anon key to streamline development.
- Docker Compose maps `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the frontend; the backend reads `SUPABASE_URL`, `DATABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.

### Database Connectivity Architecture
**Local Supabase Setup:**
- Supabase CLI creates containers in `supabase_network_AmpedFieldOps` network
- PostgreSQL: `supabase_db_AmpedFieldOps` (internal: port 5432, external: port 54322)
- API Gateway: `supabase_kong_AmpedFieldOps` (internal: port 8000, external: port 54321)
- Studio: `supabase_studio_AmpedFieldOps` (external: port 54323)

**Backend Connection:**
- Backend container joins `supabase_network_AmpedFieldOps` via docker-compose networks
- DATABASE_URL: `postgresql://postgres:postgres@supabase_db_AmpedFieldOps:5432/postgres`
- SUPABASE_URL: `http://supabase_kong_AmpedFieldOps:8000` (internal) or `http://127.0.0.1:54321` (from host)
- Entrypoint script (`backend/docker-entrypoint.sh`) parses DATABASE_URL to check PostgreSQL readiness

**Frontend Connection:**
- Frontend uses browser-accessible URLs: `VITE_SUPABASE_URL=http://127.0.0.1:54321`
- Supabase JS client connects via Kong gateway for Auth, Realtime, Storage, etc.
- API calls to backend: `VITE_API_URL=http://localhost:3001` or configured LXC IP

---

## 📝 Key Files to Know
| File | Purpose |
|------|---------|
| [package.json](package.json) | Frontend deps (React, Shadcn, Tailwind) |
| [backend/package.json](backend/package.json) | Backend deps (Express, Supabase client) |
| [vite.config.ts](vite.config.ts) | Frontend build config |
| [docker-compose.yml](docker-compose.yml) | Service orchestration |
| [supabase/config.toml](supabase/config.toml) | Supabase local setup |

### RLS Policies (Login/Users)
- users: RLS enabled; policies
	- `users_read_own` SELECT when `id = auth.uid()`
	- `users_admin_read_all` SELECT when current user role is `admin`
	- `users_admin_update` UPDATE when current user role is `admin`
- user_permissions: RLS enabled; policies
	- `user_permissions_read_own` SELECT when `user_id = auth.uid()`
	- `user_permissions_admin_read_all` SELECT when current user role is `admin`
- permissions: RLS enabled; policies
	- `permissions_read_all` SELECT allowed to `authenticated`
	- `permissions_admin_write` ALL allowed when current user role is `admin`

Migration file: `supabase/migrations/20260117_login_users_rls.sql`

---

## 🔄 Ongoing Tasks & Patterns
- **Realtime Updates:** Using `supabase-realtime.ts` for live project/timesheet changes
- **Role-Based Access:** Middleware validates user roles before route access
- **File Storage:** Organized by client → project in Supabase Storage buckets
- **Xero Sync:** Batch jobs run periodically to sync invoices/expenses

---
