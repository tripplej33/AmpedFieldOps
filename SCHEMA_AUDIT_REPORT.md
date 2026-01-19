# Schema Audit Report
**Date:** 2026-01-18  
**Status:** In Progress  
**Severity:** Medium (prevents dashboard rendering, search failures, API errors)

---

## Executive Summary

The Supabase migration created a new schema, but backend code still references **legacy columns** that don't exist. This causes:
- ❌ Dashboard endpoints: 500 errors
- ❌ Search endpoint: 500 errors  
- ❌ Client CRUD: 500 errors on updates
- ❌ Project views: Missing actuals tracking

**Total Issues Found:** 5 column mismatches + 2 FK relationship mismatches

---

## Critical Mismatches (Blocking)

### 1. **projects.cost** → Does NOT Exist
**Status:** ❌ CRITICAL  
**Impact:** Dashboard metrics, project views, timesheets  
**Files:**
- `backend/src/routes/dashboard.ts` (lines 65, 211) — Fixed in latest build
- `backend/src/routes/clients.ts` (line 102) — Still broken
- `backend/src/routes/timesheets.ts` (lines 376, 387, 611, 622, 629, 723, 734, 741) — Still broken

**Current Schema:** `projects` table has `budget` (planned) but NO `actual_cost` or `cost`  
**Solution:** Either add `actual_cost numeric(12,2)` column OR compute from timesheets.hours × hourly_rate

---

### 2. **clients.contact_name** → Does NOT Exist
**Status:** ❌ CRITICAL  
**Impact:** Client creation, client search  
**Files:**
- `backend/src/routes/setup.ts` (lines 370, 377) — User input captured but saved to wrong column
- `backend/src/routes/search.ts` (lines 28–29) — Selecting nonexistent column
- `backend/src/routes/clients.ts` (lines 133, 140, 185, 189) — Trying to update/insert
- `backend/src/routes/xero.ts` (lines 851, 878, 945, 946, 1079, 1080) — Legacy column reference

**Current Schema:** `clients` table has NO `contact_name` column  
**Available:** `clients.name`, `clients.email`, `clients.phone` (person contact fields not captured)  
**Solution:** Add `contact_name text` column to clients OR map to name field

---

### 3. **clients.location** → Does NOT Exist
**Status:** ❌ CRITICAL  
**Impact:** Client search, client updates  
**Files:**
- `backend/src/routes/search.ts` (line 28) — Selecting nonexistent column
- `backend/src/routes/clients.ts` (line 133, 185, 189) — Trying to insert/update

**Current Schema:** `clients` has `address, city, state, postal_code, country` (granular)  
**Solution:** Remove `location` or map to concatenated address fields

---

### 4. **timesheets.date** → Should Be `entry_date`
**Status:** ⚠️ INCONSISTENT  
**Impact:** Search endpoint, legacy joins  
**Files:**
- `backend/src/routes/search.ts` (line 57) — Selecting `.select('id, date, hours, notes, ...')`

**Current Schema:** `timesheets.entry_date (date)` — NOT `date`  
**Solution:** Update search.ts to use `entry_date`

---

### 5. **projects.code** → Does NOT Exist (Read-Only Reference)
**Status:** ⚠️ INFORMATIONAL  
**Impact:** Project detail views, project search  
**Files:**
- `backend/src/routes/clients.ts` (line 102) — `.select('id, code, name, status, ...')`
- `backend/src/routes/search.ts` (line 39) — `.select('id, code, name, status, ...')`
- `backend/src/routes/projects.ts` (line 160, 362) — `.select('id, name, code')`

**Current Schema:** `projects` has NO `code` column (only `id, name, description, ...`)  
**Solution:** Remove `code` from selects OR add generated code column

---

## Relationship Mismatches

### 6. **timesheets.clients** → No FK Relationship
**Status:** ❌ CRITICAL  
**Impact:** Dashboard timesheets join fails  
**Files:**
- `backend/src/routes/dashboard.ts` (line 119) — `.select(..., clients(name))`  
**Current State:** `timesheets` has NO `client_id` column. Clients are accessed via `projects` only.  
**Fix:** Use `projects(clients(name))` or remove client joins if not needed.

---

### 7. **projects.clients** → FK Exists ✅
**Status:** ✓ OK  
**Verified:** `projects.client_id → clients.id` exists and works.

---

## Low-Priority Issues

### 8. **activityTypes.icon, activityTypes.color** → Do NOT Exist
**Status:** ⚠️ LOW  
**Impact:** Activity type form submission  
**Files:**
- `backend/src/routes/activityTypes.ts` (lines 140, 141) — `.update({ icon, color, ... })`

**Current Schema:** `activity_types` has: `name, description, is_billable, hourly_rate, is_active`  
**Solution:** Remove icon/color updates OR add columns to schema

---

### 9. **clients.billing_address, clients.billing_email, clients.client_type** → Do NOT Exist
**Status:** ⚠️ LOW  
**Impact:** Client detail form (UI likely hides these for now)  
**Files:**
- `backend/src/routes/clients.ts` (lines 133, 185, 189) — Accepts but discards

**Current Schema:** Not present  
**Solution:** Either add columns or remove from client create/update logic

---

## Summary Table

| Column/FK | Table | Exists? | Fix | Priority |
|-----------|-------|---------|-----|----------|
| `cost` / `actual_cost` | projects | ❌ No | Add or compute | 🔴 CRITICAL |
| `contact_name` | clients | ❌ No | Add column | 🔴 CRITICAL |
| `location` | clients | ❌ No | Remove or map | 🔴 CRITICAL |
| `date` | timesheets | ❌ (is `entry_date`) | Update refs | 🔴 CRITICAL |
| `code` | projects | ❌ No | Remove or add | 🟡 MEDIUM |
| `clients` FK | timesheets | ❌ No | Fix joins | 🟡 MEDIUM |
| `icon`, `color` | activity_types | ❌ No | Remove or add | 🟢 LOW |
| `billing_address`, etc. | clients | ❌ No | Remove or add | 🟢 LOW |

---

## Recommended Fix Order

1. **Phase 1 (Unblock dashboard):**
   - Add `actual_cost numeric(12, 2)` to projects (or compute from timesheets)
   - Fix timesheets.date → entry_date in search.ts and all related queries
   - Remove or fix timesheets.clients FK (no direct link; use via projects)

2. **Phase 2 (Unblock client operations):**
   - Add `contact_name text` to clients
   - Remove `location` or map to address concatenation
   - Fix search.ts queries

3. **Phase 3 (Polish):**
   - Add `code` column to projects OR remove from queries
   - Decide on billing_address, billing_email, client_type (add or remove)
   - Add icon, color to activity_types OR remove from forms

---

## Queries Requiring Updates

### Phase 1 Queries

**backend/src/routes/timesheets.ts** → Remove `actual_cost` update attempts:
```typescript
// BEFORE
.update({ actual_cost: supabase.rpc(...) })

// AFTER
// Remove actual_cost updates; track separately via view or RPC
```

**backend/src/routes/search.ts** → Fix column references:
```typescript
// BEFORE
.select('id, date, hours, notes, projects(name), clients(name), users(name)')

// AFTER
.select('id, entry_date, hours, description, projects(name), users(name)')
// Remove clients(name) — not joinable directly
```

**backend/src/routes/dashboard.ts** → Already fixed ✓

---

## Migration SQL (To Apply)

```sql
-- Add missing columns
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS actual_cost numeric(12, 2) DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_name text;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_actual_cost ON public.projects(actual_cost);
CREATE INDEX IF NOT EXISTS idx_clients_contact_name ON public.clients(contact_name);

-- Optional: Add code column with generated values
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS code text;
-- Populate with project IDs as codes if desired
UPDATE public.projects SET code = LEFT(id::text, 8) WHERE code IS NULL;
```

---

## Testing Checklist

After fixes, verify:
- [ ] Dashboard loads without 500 errors
- [ ] Search endpoint returns clients with contact_name
- [ ] Project views show code (or gracefully omit it)
- [ ] Client create/update succeeds
- [ ] Timesheet create/update succeeds
- [ ] Activity type updates don't fail on icon/color

---

## Next Action

**Awaiting User Input:**
1. Should we **add `actual_cost` column** to projects, or **compute it dynamically**?
2. For **`contact_name`**: add as separate column, or map to `name`?
3. **Priority**: Fix all Phase 1 now, or defer Phase 2/3 until later?

