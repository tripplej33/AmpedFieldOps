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

---

## 📝 Key Files to Know
| File | Purpose |
|------|---------|
| [package.json](package.json) | Frontend deps (React, Shadcn, Tailwind) |
| [backend/package.json](backend/package.json) | Backend deps (Express, Supabase client) |
| [vite.config.ts](vite.config.ts) | Frontend build config |
| [docker-compose.yml](docker-compose.yml) | Service orchestration |
| [supabase/config.toml](supabase/config.toml) | Supabase local setup |

---

## 🔄 Ongoing Tasks & Patterns
- **Realtime Updates:** Using `supabase-realtime.ts` for live project/timesheet changes
- **Role-Based Access:** Middleware validates user roles before route access
- **File Storage:** Organized by client → project in Supabase Storage buckets
- **Xero Sync:** Batch jobs run periodically to sync invoices/expenses

---
