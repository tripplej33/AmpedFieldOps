# Backend Cleanup Plan

This document outlines which backend routes have been migrated to Supabase and can be safely removed.

## Routes to Remove (Fully Migrated to Supabase)

### 1. `/api/clients` - ✅ Migrated
- All CRUD operations now use Supabase directly via `clientsQueries`
- Frontend uses `api.getClients()`, `api.createClient()`, etc. which call Supabase
- **Action:** Delete `backend/src/routes/clients.ts` and remove from `server.ts`

### 2. `/api/projects` - ✅ Migrated (except financials)
- All CRUD operations now use Supabase directly via `projectsQueries`
- Financials endpoint (`/api/projects/:id/financials`) may still be needed for complex calculations
- **Action:** Delete `backend/src/routes/projects.ts` and remove from `server.ts`
- **Note:** If financials endpoint is needed, extract it to a separate route file

### 3. `/api/timesheets` - ✅ Migrated
- CRUD operations use Supabase via `timesheetsQueries`
- File uploads use Supabase Storage directly from frontend
- **Action:** Delete `backend/src/routes/timesheets.ts` and remove from `server.ts`

### 4. `/api/cost-centers` - ✅ Migrated
- All CRUD operations now use Supabase directly via `costCentersQueries`
- **Action:** Delete `backend/src/routes/costCenters.ts` and remove from `server.ts`

### 5. `/api/activity-types` - ✅ Migrated
- All CRUD operations now use Supabase directly via `activityTypesQueries`
- **Action:** Delete `backend/src/routes/activityTypes.ts` and remove from `server.ts`

### 6. `/api/files` - ✅ Migrated
- File uploads/downloads now use Supabase Storage directly from frontend
- **Action:** Delete `backend/src/routes/files.ts` and remove from `server.ts`

### 7. `/api/auth` - Partially Migrated
- Login, register, refresh, forgot-password, reset-password → Now handled by Supabase Auth
- Profile update, change-password → Keep these (may need backend logic)
- **Action:** Remove login/register/refresh routes, keep profile/change-password if needed

## Routes to Keep (Still Needed)

### Essential Backend Services
- `/api/xero` - Xero integration (external API calls)
- `/api/document-scan` - OCR processing (requires backend processing)
- `/api/backups` - Backup operations
- `/api/health` - Health checks

### Complex Operations (Could Migrate Later)
- `/api/dashboard` - Dashboard metrics (complex aggregations)
- `/api/search` - Full-text search (could migrate to Supabase full-text search)
- `/api/settings` - Settings management (complex logic, storage config)
- `/api/permissions` - Permission management
- `/api/role-permissions` - Role permission management
- `/api/users` - User management (admin operations, may need backend)
- `/api/safety-documents` - Safety documents (complex PDF generation)
- `/api/setup` - Initial setup (may need backend)
- `/api/troubleshooter` - Troubleshooting tools

## Migration Status

- ✅ Clients CRUD - Migrated to Supabase
- ✅ Projects CRUD - Migrated to Supabase
- ✅ Timesheets CRUD - Migrated to Supabase
- ✅ Cost Centers CRUD - Migrated to Supabase
- ✅ Activity Types CRUD - Migrated to Supabase
- ✅ File Uploads/Downloads - Migrated to Supabase Storage
- ✅ Authentication - Migrated to Supabase Auth (except profile/password)
- ⚠️ Dashboard Metrics - Keep for now (complex aggregations)
- ⚠️ Search - Keep for now (could migrate to Supabase full-text search)
- ⚠️ Settings - Keep for now (complex logic)

## Cleanup Steps

1. Remove route files: `clients.ts`, `projects.ts`, `timesheets.ts`, `costCenters.ts`, `activityTypes.ts`, `files.ts`
2. Update `server.ts` to remove route imports and registrations
3. Clean up `auth.ts` to remove migrated routes
4. Test that remaining routes still work
5. Update any remaining frontend code that might reference deleted routes
