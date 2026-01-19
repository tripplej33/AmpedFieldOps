# Codebase Health Audit Report
**Date:** 2026-01-07  
**Scope:** Comprehensive codebase analysis and cleanup

## Executive Summary

This audit identified **47 issues** across 4 categories:
- **Code Integrity:** 12 issues (unused imports, dead code, inconsistent patterns)
- **Database Consistency:** 3 issues (missing columns, schema mismatches)
- **Documentation:** 8 outdated/redundant documentation files
- **File Cleanup:** 24 files to remove or consolidate

---

## 1. CODE INTEGRITY ISSUES

### 1.1 Unused Imports

#### `backend/src/routes/timesheets.ts`
- ❌ `validationResult` from `express-validator` - imported but never used
- ❌ `body` from `express-validator` - imported but never used  
- ❌ `upload` from `../middleware/upload` - imported but only `projectUpload` is used

**Fix:** Remove unused imports

#### `src/lib/api.ts`
- ✅ `DocumentScan` and `DocumentMatch` types are used (verified)

### 1.2 Dead Code / Unused Files

#### Empty Files
- ❌ `src/lib/mockData.ts` - Contains only comment "Mock data removed - all data comes from API"
- ❌ `src/types/supabase.ts` - Completely empty file

**Action:** Delete these files

#### Unused Middleware
- ❌ `backend/src/middleware/softDelete.ts` - Never imported or used anywhere
  - Contains `excludeSoftDeleted` and `addSoftDeleteFilter` functions
  - Soft delete logic is handled inline in routes instead

**Action:** Delete or document as deprecated

#### Standalone Scripts (Not Imported)
- ⚠️ `backend/src/db/cleanup-duplicates.ts` - Standalone script, not imported
- ⚠️ `backend/src/db/cleanup-duplicate-activity-types.ts` - Standalone script, not imported

**Action:** Move to `scripts/` directory or add to package.json as runnable scripts

#### Unused Config Files
- ❌ `tempo.config.json` - Tempo design tool config, but tempo is not used in project
- ❌ `vite.config.ts` line 9: `entries: ["src/main.tsx", "src/tempobook/**/*"]` - References non-existent tempobook directory

**Action:** Remove tempo.config.json, fix vite.config.ts

### 1.3 Inconsistent Code Patterns

#### CommonJS `require()` in ES Module Context
- ❌ `backend/src/routes/timesheets.ts` lines 599-600, 770-771: Uses `require('fs')` and `require('path')` instead of ES6 imports
  - Rest of codebase uses ES6 imports
  - Should use: `import fs from 'fs'; import path from 'path';`

**Fix:** Convert to ES6 imports

### 1.4 Storybook Files (54 files)
- ⚠️ `src/stories/*.stories.tsx` - 54 Storybook story files exist
- ❌ No Storybook configuration found in package.json
- ❌ No `.storybook/` directory

**Action:** Either:
  - Remove all `.stories.tsx` files if Storybook is not used
  - OR set up Storybook properly if these are intended for component documentation

---

## 2. DATABASE CONSISTENCY ISSUES

### 2.1 Missing Column References

#### `project.location` Column
- ❌ **Issue:** `src/components/modals/CreateSafetyDocumentModal.tsx` line 102 references `project.location`
- ❌ **Problem:** `projects` table does NOT have a `location` column (only `clients` and `timesheets` have it)
- ✅ **Current Schema:** Projects table has: `id, code, name, client_id, status, budget, actual_cost, description, start_date, end_date, xero_project_id, files, created_at, updated_at`

**Fix:** Remove `project.location` reference or add `location` column to projects table if needed

### 2.2 Missing Type Definition

#### `cloud_image_urls` in TypeScript Types
- ❌ **Issue:** Backend uses `cloud_image_urls` column (added via migration `add-cloud-storage.sql`)
- ❌ **Problem:** `src/types/index.ts` `TimesheetEntry` interface doesn't include `cloud_image_urls?: string[]`
- ✅ **Backend:** Column exists and is used in `backend/src/routes/timesheets.ts`

**Fix:** Add `cloud_image_urls?: string[]` to `TimesheetEntry` interface

### 2.3 Schema Migration Consistency
- ✅ **Good:** Migration files in `backend/src/db/migrations/` are automatically run by `migrate.ts`
- ✅ **Good:** `cloud_image_urls` column is added via `add-cloud-storage.sql` migration
- ⚠️ **Note:** Main `migrate.ts` doesn't include `cloud_image_urls` in base schema, but migration file handles it

---

## 3. DOCUMENTATION ISSUES

### 3.1 Outdated/Redundant Documentation Files

#### Historical Implementation Summaries (Can be archived/consolidated)
1. ❌ `IMPLEMENTATION_COMPLETE.md` - Summary of completed work (historical)
2. ❌ `PROJECT_COMPLETION_SUMMARY.md` - Summary of fixes (historical)
3. ❌ `CRITICAL_ISSUES_IMPLEMENTED.md` - Implementation summary (historical)
4. ❌ `FRONTEND_PAGINATION_AND_LOW_PRIORITY.md` - Implementation summary (historical)
5. ❌ `MEDIUM_PRIORITY_IMPROVEMENTS.md` - Implementation summary (historical)
6. ❌ `IMPLEMENTATION_V2_SUMMARY.md` - V2 overhaul summary (historical)
7. ❌ `PROJECT_REVIEW.md` - Code review document (historical, but may have value)
8. ❌ `BUTTON_AUDIT_CHECKLIST.md` - Audit checklist (completed, historical)
9. ❌ `IMAGE_STORAGE_REVIEW.md` - Review document (may be outdated)

**Action:** 
- Move to `docs/archive/` directory, OR
- Consolidate into single `CHANGELOG.md` or `HISTORY.md`, OR
- Delete if no longer needed

#### Active Documentation (Keep)
- ✅ `README.md` - Main documentation (up to date)
- ✅ `DOCKER_SETUP.md` - Setup instructions (active)
- ✅ `EMAIL_SETUP.md` - Setup guide (active)
- ✅ `XERO_SETUP.md` - Setup guide (active)
- ✅ `TROUBLESHOOTER_PROMPT.md` - Troubleshooting guide (active)
- ✅ `ARCHITECTURE_DIAGRAMS.md` - Architecture docs (may need update)
- ⚠️ `backend/ARCHITECTURE_V2_COMPARISON.md` - May be historical

### 3.2 README Updates Needed

#### Missing Features in README
- ❌ Safety Documents feature not fully documented in API section
- ❌ Document Scan/OCR feature not documented
- ❌ Cloud storage integration not mentioned
- ❌ `cloud_image_urls` column not mentioned in database schema section

**Action:** Update README.md to include:
- Safety Documents API endpoints
- Document Scan API endpoints  
- Cloud storage feature mention
- Updated database schema with `cloud_image_urls`

---

## 4. FILE CLEANUP

### 4.1 Files to Delete

#### Empty/Unused Files
1. `src/lib/mockData.ts` - Empty (only comment)
2. `src/types/supabase.ts` - Empty file
3. `tempo.config.json` - Unused config
4. `backend/src/middleware/softDelete.ts` - Never used

#### Storybook Files (if not using Storybook)
5-58. `src/stories/*.stories.tsx` - 54 files (if Storybook not configured)

### 4.2 Files to Move/Reorganize

#### Standalone Scripts
- `backend/src/db/cleanup-duplicates.ts` → Move to `backend/scripts/cleanup-duplicates.ts`
- `backend/src/db/cleanup-duplicate-activity-types.ts` → Move to `backend/scripts/cleanup-duplicate-activity-types.ts`

#### Documentation Archive
- Move historical docs to `docs/archive/` or delete

### 4.3 Code to Fix

#### Import Consistency
- `backend/src/routes/timesheets.ts` - Convert `require()` to ES6 imports

#### Type Definitions
- `src/types/index.ts` - Add `cloud_image_urls` to `TimesheetEntry`
- `src/types/index.ts` - Add `location?` to `Project` interface if needed, OR remove reference

#### Logic Fixes
- `src/components/modals/CreateSafetyDocumentModal.tsx` - Fix `project.location` reference

---

## SUMMARY OF PROPOSED CHANGES

### High Priority (Fix Immediately)
1. ✅ Remove unused imports from `backend/src/routes/timesheets.ts`
2. ✅ Fix `project.location` reference in `CreateSafetyDocumentModal.tsx`
3. ✅ Add `cloud_image_urls` to `TimesheetEntry` TypeScript interface
4. ✅ Convert `require()` to ES6 imports in `timesheets.ts`
5. ✅ Remove empty files: `mockData.ts`, `supabase.ts`
6. ✅ Remove `tempo.config.json` and fix `vite.config.ts`

### Medium Priority (Cleanup)
7. ✅ Delete or archive unused middleware: `softDelete.ts`
8. ✅ Move cleanup scripts to `scripts/` directory
9. ✅ Archive or consolidate historical documentation files
10. ✅ Update README.md with missing features

### Low Priority (Optional)
11. ⚠️ Decide on Storybook: Remove 54 story files OR set up Storybook properly
12. ⚠️ Review and update `ARCHITECTURE_DIAGRAMS.md` if needed

---

## FILES TO MODIFY

### Code Files
1. `backend/src/routes/timesheets.ts` - Remove unused imports, fix require()
2. `src/components/modals/CreateSafetyDocumentModal.tsx` - Fix project.location reference
3. `src/types/index.ts` - Add cloud_image_urls to TimesheetEntry
4. `vite.config.ts` - Remove tempobook reference

### Files to Delete
1. `src/lib/mockData.ts`
2. `src/types/supabase.ts`
3. `tempo.config.json`
4. `backend/src/middleware/softDelete.ts`
5. `src/stories/*.stories.tsx` (54 files) - IF Storybook not used

### Files to Move
1. `backend/src/db/cleanup-duplicates.ts` → `backend/scripts/cleanup-duplicates.ts`
2. `backend/src/db/cleanup-duplicate-activity-types.ts` → `backend/scripts/cleanup-duplicate-activity-types.ts`

### Documentation to Archive/Delete
1. `IMPLEMENTATION_COMPLETE.md`
2. `PROJECT_COMPLETION_SUMMARY.md`
3. `CRITICAL_ISSUES_IMPLEMENTED.md`
4. `FRONTEND_PAGINATION_AND_LOW_PRIORITY.md`
5. `MEDIUM_PRIORITY_IMPROVEMENTS.md`
6. `IMPLEMENTATION_V2_SUMMARY.md`
7. `BUTTON_AUDIT_CHECKLIST.md`
8. `IMAGE_STORAGE_REVIEW.md`
9. `PROJECT_REVIEW.md` (consider keeping for reference)

---

## ESTIMATED IMPACT

- **Code Quality:** Improved (removes dead code, fixes inconsistencies)
- **Type Safety:** Improved (adds missing type definitions)
- **Maintainability:** Improved (cleaner codebase, better documentation)
- **Build Size:** Slightly reduced (removing unused files)
- **Risk:** Low (all changes are safe removals/fixes)

---

## NEXT STEPS

1. Review this audit report
2. Approve proposed deletions/modifications
3. Apply fixes in order of priority
4. Test after each category of changes
5. Commit changes with descriptive messages
