# Supabase Migration Testing Guide

This document provides a comprehensive testing checklist for verifying the Supabase migration is working correctly.

## Prerequisites

Before testing, ensure:

1. ✅ Supabase is running locally (`supabase start`)
2. ✅ All migrations have been applied (`supabase migration up`)
3. ✅ Storage buckets are created (see `STORAGE_SETUP.md`)
4. ✅ Environment variables are configured (see `ENV_SETUP.md`)
5. ✅ Backend dependencies installed (`npm install` in `backend/`)
6. ✅ Frontend dependencies installed (`npm install` in root)

## Test Checklist

### 1. Authentication Testing

#### 1.1 User Registration
- [ ] **Test:** Register a new user via frontend
  - Navigate to `/register` or use registration flow
  - Enter email, password, name
  - **Expected:** User created in Supabase Auth, `user_profiles` record created, default permissions assigned
  - **Verify:** Check Supabase dashboard → Authentication → Users
  - **Verify:** Check `user_profiles` table has new record
  - **Verify:** Check `user_permissions` table has default permissions

#### 1.2 User Login
- [ ] **Test:** Login with registered user
  - Enter email and password
  - **Expected:** Successful login, session created, redirected to dashboard
  - **Verify:** Check browser localStorage for Supabase session
  - **Verify:** User profile and permissions loaded correctly

#### 1.3 Session Persistence
- [ ] **Test:** Refresh page after login
  - **Expected:** User remains logged in, session persists
  - **Verify:** No redirect to login page

#### 1.4 Logout
- [ ] **Test:** Logout from application
  - **Expected:** Session cleared, redirected to login
  - **Verify:** Supabase session removed from localStorage

#### 1.5 Password Reset Flow
- [ ] **Test:** Request password reset
  - Navigate to `/forgot-password`
  - Enter email
  - **Expected:** Password reset email sent (check Supabase logs or email)
  - **Note:** For local development, check Supabase logs or email service

#### 1.6 Profile Update
- [ ] **Test:** Update user profile (name, avatar)
  - Navigate to User Settings
  - Update name or avatar
  - **Expected:** Profile updated in `user_profiles` table
  - **Verify:** Changes reflected in UI immediately

#### 1.7 Password Change
- [ ] **Test:** Change password
  - Navigate to User Settings → Change Password
  - Enter current and new password
  - **Expected:** Password updated in Supabase Auth
  - **Verify:** Can login with new password

### 2. Row Level Security (RLS) Testing

#### 2.1 User Profile Access
- [ ] **Test:** User can view own profile
  - Login as regular user
  - **Expected:** Can view own profile data
  - **Verify:** Cannot view other users' profiles

#### 2.2 Admin Access
- [ ] **Test:** Admin can view all profiles
  - Login as admin
  - Navigate to Users page
  - **Expected:** Can view all user profiles
  - **Verify:** Can edit user permissions

#### 2.3 Timesheet Access
- [ ] **Test:** User can view own timesheets
  - Login as regular user
  - Navigate to Timesheets
  - **Expected:** Only own timesheets visible
  - **Verify:** Cannot access other users' timesheets via direct API call

- [ ] **Test:** Manager can view all timesheets
  - Login as manager
  - Navigate to Timesheets
  - **Expected:** All timesheets visible
  - **Verify:** Can filter by user

#### 2.4 Project Access
- [ ] **Test:** User can view assigned projects
  - Login as regular user
  - Navigate to Projects
  - **Expected:** Only assigned projects visible (if RLS restricts)
  - **Note:** Current RLS may allow all users to view projects

- [ ] **Test:** Admin can manage all projects
  - Login as admin
  - Create/edit/delete project
  - **Expected:** Operations succeed

#### 2.5 Client Access
- [ ] **Test:** User can view clients
  - Login as regular user
  - Navigate to Clients
  - **Expected:** Clients visible (if RLS allows)
  - **Verify:** Cannot create/edit/delete without permission

#### 2.6 Permission-Based Access
- [ ] **Test:** Permission checks work
  - Login as user without `can_view_financials`
  - Navigate to Financials page
  - **Expected:** Access denied or page hidden
  - **Verify:** API returns 403 for unauthorized operations

### 3. CRUD Operations Testing

#### 3.1 Clients CRUD
- [ ] **Test:** Create client
  - Navigate to Clients → Create
  - Fill form and submit
  - **Expected:** Client created in Supabase `clients` table
  - **Verify:** Client appears in list immediately

- [ ] **Test:** Read clients
  - Navigate to Clients page
  - **Expected:** All clients loaded (with pagination if many)
  - **Verify:** Search and filter work

- [ ] **Test:** Update client
  - Edit existing client
  - **Expected:** Changes saved to Supabase
  - **Verify:** Changes reflected immediately

- [ ] **Test:** Delete client
  - Delete a client
  - **Expected:** Client removed from Supabase
  - **Verify:** Client no longer in list

#### 3.2 Projects CRUD
- [ ] **Test:** Create project
  - Navigate to Projects → Create
  - Fill form and submit
  - **Expected:** Project created in Supabase `projects` table
  - **Verify:** Project appears in list

- [ ] **Test:** Read projects
  - Navigate to Projects page
  - **Expected:** Projects loaded with client information
  - **Verify:** Filter by status, client works

- [ ] **Test:** Update project
  - Edit existing project
  - **Expected:** Changes saved
  - **Verify:** Changes reflected

- [ ] **Test:** Delete project
  - Delete a project
  - **Expected:** Project removed
  - **Verify:** Related timesheets still exist (foreign key handling)

#### 3.3 Timesheets CRUD
- [ ] **Test:** Create timesheet
  - Navigate to Timesheets → Create
  - Fill form, optionally upload images
  - **Expected:** Timesheet created in Supabase, images uploaded to Storage
  - **Verify:** Timesheet appears in list
  - **Verify:** Images accessible via Supabase Storage URLs

- [ ] **Test:** Read timesheets
  - Navigate to Timesheets page
  - **Expected:** Timesheets loaded with project/client info
  - **Verify:** Filter by date, project, user works

- [ ] **Test:** Update timesheet
  - Edit existing timesheet
  - **Expected:** Changes saved
  - **Verify:** Changes reflected

- [ ] **Test:** Delete timesheet
  - Delete a timesheet
  - **Expected:** Timesheet removed
  - **Verify:** Associated images still in Storage (or cleaned up)

#### 3.4 Cost Centers CRUD
- [ ] **Test:** Create cost center
  - Navigate to Cost Centers → Create
  - **Expected:** Cost center created
  - **Verify:** Appears in list

- [ ] **Test:** Read/Update/Delete cost centers
  - **Expected:** All operations work correctly

#### 3.5 Activity Types CRUD
- [ ] **Test:** Create activity type
  - Navigate to Activity Types → Create
  - **Expected:** Activity type created
  - **Verify:** Appears in list

- [ ] **Test:** Read/Update/Delete activity types
  - **Expected:** All operations work correctly

### 4. Realtime Subscriptions Testing

#### 4.1 Dashboard Realtime
- [ ] **Test:** Dashboard updates in real-time
  - Open Dashboard in two browser windows (same user)
  - Create a new timesheet in one window
  - **Expected:** Dashboard metrics update in both windows automatically
  - **Verify:** No page refresh needed

- [ ] **Test:** Recent timesheets update
  - Create a new timesheet
  - **Expected:** Recent timesheets list updates automatically
  - **Verify:** New timesheet appears at top

- [ ] **Test:** Active projects update
  - Update a project status
  - **Expected:** Active projects list updates automatically

#### 4.2 Financials Realtime
- [ ] **Test:** Invoice sync status updates
  - Create invoice from timesheet
  - **Expected:** Sync status updates in real-time (pending → synced/failed)
  - **Verify:** Toast notifications appear on status change
  - **Verify:** No polling/refresh needed

#### 4.3 Projects Realtime
- [ ] **Test:** Project updates propagate
  - Open Projects page in two windows
  - Update a project in one window
  - **Expected:** Other window updates automatically
  - **Verify:** No manual refresh needed

### 5. Storage Testing

#### 5.1 Project File Upload
- [ ] **Test:** Upload project file
  - Navigate to Files → Upload
  - Select a file and upload
  - **Expected:** File uploaded to Supabase Storage `project-files` bucket
  - **Verify:** File metadata saved in `project_files` table
  - **Verify:** File accessible via URL

#### 5.2 Timesheet Image Upload
- [ ] **Test:** Upload timesheet images
  - Create/edit timesheet with images
  - **Expected:** Images uploaded to `timesheet-images` bucket
  - **Verify:** Images appear in timesheet view
  - **Verify:** Images accessible via Supabase Storage URLs

#### 5.3 File Download
- [ ] **Test:** Download file
  - Click download on a project file
  - **Expected:** File downloads correctly
  - **Verify:** File content matches uploaded file

#### 5.4 File Deletion
- [ ] **Test:** Delete file
  - Delete a project file
  - **Expected:** File removed from Storage
  - **Verify:** File record removed from database
  - **Verify:** File no longer accessible

#### 5.5 Logo/Favicon Upload
- [ ] **Test:** Upload company logo
  - Navigate to Settings → Upload logo
  - **Expected:** Logo uploaded to `logos` bucket
  - **Verify:** Logo appears in header

- [ ] **Test:** Upload favicon
  - Navigate to Settings → Upload favicon
  - **Expected:** Favicon uploaded to `logos` bucket
  - **Verify:** Favicon appears in browser tab

### 6. Backend Routes Testing

#### 6.1 Removed Routes
- [ ] **Test:** Old CRUD routes return 404
  - Try accessing `/api/clients`, `/api/projects`, etc. directly
  - **Expected:** 404 Not Found (routes removed)
  - **Verify:** Frontend no longer calls these routes

#### 6.2 Kept Routes
- [ ] **Test:** Xero routes work
  - Navigate to Settings → Xero Integration
  - **Expected:** Xero routes still functional

- [ ] **Test:** OCR/Document Scan routes work
  - Upload a document for scanning
  - **Expected:** OCR processing works

- [ ] **Test:** Backup routes work
  - Navigate to Backups
  - **Expected:** Backup functionality works

- [ ] **Test:** Dashboard routes work
  - Navigate to Dashboard
  - **Expected:** Dashboard metrics load correctly

- [ ] **Test:** Search routes work
  - Use global search
  - **Expected:** Search results returned

- [ ] **Test:** Settings routes work
  - Navigate to Settings
  - **Expected:** Settings load and save correctly

### 7. Error Handling Testing

#### 7.1 Network Errors
- [ ] **Test:** Supabase connection failure
  - Stop Supabase (`supabase stop`)
  - Try to perform operations
  - **Expected:** Graceful error messages
  - **Verify:** UI shows appropriate error state

#### 7.2 Authentication Errors
- [ ] **Test:** Expired session
  - Wait for session to expire (or manually clear)
  - Try to perform operation
  - **Expected:** Redirected to login
  - **Verify:** Error message shown

#### 7.3 Permission Errors
- [ ] **Test:** Unauthorized operation
  - Login as user without permission
  - Try to perform restricted operation
  - **Expected:** 403 error or access denied message
  - **Verify:** UI prevents unauthorized actions

#### 7.4 Validation Errors
- [ ] **Test:** Invalid data submission
  - Submit form with invalid data
  - **Expected:** Validation errors shown
  - **Verify:** Data not saved

### 8. Performance Testing

#### 8.1 Query Performance
- [ ] **Test:** Large dataset loading
  - Create 100+ clients, projects, timesheets
  - Load pages
  - **Expected:** Pagination works, pages load reasonably fast
  - **Verify:** No timeout errors

#### 8.2 Realtime Performance
- [ ] **Test:** Multiple subscriptions
  - Open multiple pages with Realtime subscriptions
  - **Expected:** All subscriptions work correctly
  - **Verify:** No memory leaks or performance degradation

#### 8.3 Storage Performance
- [ ] **Test:** Large file upload
  - Upload large file (10MB+)
  - **Expected:** Upload completes successfully
  - **Verify:** Progress indicator works

### 9. Integration Testing

#### 9.1 End-to-End User Flow
- [ ] **Test:** Complete user workflow
  1. Register new user
  2. Login
  3. Create client
  4. Create project
  5. Create timesheet with images
  6. View dashboard
  7. Update project
  8. View reports
  - **Expected:** All steps complete successfully
  - **Verify:** Data persists correctly

#### 9.2 Multi-User Testing
- [ ] **Test:** Multiple users simultaneously
  - Open app in multiple browsers (different users)
  - Perform operations simultaneously
  - **Expected:** No conflicts, data consistent
  - **Verify:** Realtime updates work for all users

### 10. Migration Verification

#### 10.1 Data Integrity
- [ ] **Test:** Existing data (if migrated)
  - Verify all existing data accessible
  - **Expected:** No data loss
  - **Verify:** Relationships preserved

#### 10.2 Schema Verification
- [ ] **Test:** Database schema matches migrations
  - Check Supabase dashboard → Database
  - **Expected:** All tables exist with correct structure
  - **Verify:** RLS enabled on all tables
  - **Verify:** Indexes created

#### 10.3 Storage Buckets
- [ ] **Test:** Storage buckets exist
  - Check Supabase dashboard → Storage
  - **Expected:** All required buckets exist:
    - `project-files`
    - `timesheet-images`
    - `safety-documents`
    - `logos`
    - `document-scans`

## Testing Tools

### Supabase Dashboard
- Access at: `http://127.0.0.1:54323` (local)
- Use to:
  - View database tables and data
  - Check authentication users
  - View storage buckets
  - Monitor Realtime subscriptions
  - Check logs

### Browser DevTools
- Network tab: Monitor API calls
- Application tab: Check localStorage for Supabase session
- Console: Check for errors

### Backend Logs
- Monitor backend console for errors
- Check for Supabase connection issues

## Common Issues & Solutions

### Issue: "Supabase client not initialized"
- **Solution:** Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`

### Issue: "RLS policy violation"
- **Solution:** Check RLS policies in migration `20240110000006_rls_policies.sql`
- Verify user has correct permissions

### Issue: "Storage bucket not found"
- **Solution:** Create buckets using `scripts/create-storage-buckets.ts` or manually in Supabase dashboard

### Issue: "Realtime not working"
- **Solution:** Verify Realtime enabled on tables (migration `20240110000007_enable_realtime.sql`)
- Check Supabase is running and Realtime service is active

### Issue: "Authentication fails"
- **Solution:** Check `SUPABASE_SERVICE_ROLE_KEY` in backend `.env`
- Verify Supabase Auth is running

## Test Results Template

```
Date: [Date]
Tester: [Name]
Environment: [Local/Production]

Authentication: [✅/❌]
RLS Policies: [✅/❌]
CRUD Operations: [✅/❌]
Realtime: [✅/❌]
Storage: [✅/❌]
Backend Routes: [✅/❌]
Error Handling: [✅/❌]
Performance: [✅/❌]

Issues Found:
1. [Issue description]
2. [Issue description]

Notes:
[Additional notes]
```

## Next Steps After Testing

1. Fix any issues found during testing
2. Update documentation if needed
3. Perform data migration if moving from old system
4. Deploy to production
5. Monitor for issues in production
