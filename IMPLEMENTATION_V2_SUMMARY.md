# AmpedFieldOps v2 System Overhaul - Implementation Summary

## Overview
This document summarizes the implementation of the asynchronous, resilient architecture upgrade for AmpedFieldOps using a Worker-Queue pattern and Cloud Storage.

## ✅ Completed Implementation

### Part 1: Database & Schema Updates

#### 1. Soft Deletes
- **Migration**: `backend/src/db/migrations/add-soft-deletes.sql`
- Added `deleted_at` (timestamp, nullable) column to:
  - `clients`
  - `projects`
  - `timesheets`
  - `xero_invoices`
  - `xero_purchase_orders`
  - `xero_bills`
  - `xero_expenses`
  - `xero_quotes`
  - `xero_payments`
  - `xero_credit_notes`
- Created indexes for efficient soft delete queries

#### 2. Sync Status Tracking
- **Migration**: `backend/src/db/migrations/add-sync-status.sql`
- Created `sync_status_enum` type: `'pending' | 'synced' | 'failed'`
- Added `sync_status` and `xero_sync_id` columns to:
  - `timesheets`
  - `xero_invoices`
  - `xero_purchase_orders`
- Created indexes for sync status queries

#### 3. Sync Logs Table
- **Migration**: `backend/src/db/migrations/add-sync-logs.sql`
- Created `sync_logs` table with:
  - `id` (UUID PK)
  - `entity_type` (string)
  - `entity_id` (UUID)
  - `request_payload` (JSONB)
  - `response_payload` (JSONB)
  - `status_code` (integer)
  - `error_message` (text)
  - `created_at` (timestamp)
- Created indexes for efficient querying

#### 4. Cloud Storage Support
- **Migration**: `backend/src/db/migrations/add-cloud-storage.sql`
- Added `cloud_image_urls` (TEXT[]) column to `timesheets` table
- Note: `image_urls` column retained for backward compatibility

### Part 2: Backend Logic Refactoring

#### 1. Global Middleware for Soft Deletes
- **File**: `backend/src/middleware/softDelete.ts`
- Created helper functions to add soft delete filters to SQL queries
- Updated timesheets routes to exclude soft-deleted records
- All GET routes now automatically filter out records where `deleted_at IS NOT NULL`

#### 2. Queue Infrastructure (BullMQ)
- **File**: `backend/src/lib/queue.ts`
- Set up BullMQ queue system with Redis connection
- Created `xeroSyncQueue` for managing Xero sync jobs
- Implemented worker with:
  - Automatic retries (3 attempts with exponential backoff)
  - Job cleanup (completed jobs kept for 24h, failed for 7 days)
  - Rate limiting (10 jobs per second)
  - Concurrency control (5 concurrent jobs)

#### 3. Background Worker
- **File**: `backend/src/lib/queue.ts` (xeroSyncWorker)
- Processes two job types:
  - `sync_invoice_from_timesheets`: Syncs invoices to Xero
  - `sync_purchase_order`: Syncs purchase orders to Xero
- Each job:
  - Logs to `sync_logs` table (success or failure)
  - Updates entity `sync_status` in database
  - Handles errors gracefully with retry logic

#### 4. Decoupled Xero Sync Routes
- **File**: `backend/src/routes/xero.ts`
- **POST /api/xero/invoices/from-timesheets**:
  - Creates invoice locally with `sync_status = 'pending'`
  - Returns `202 Accepted` immediately
  - Queues background job for Xero sync
  - No longer blocks waiting for Xero API response

- **POST /api/xero/purchase-orders**:
  - Creates PO locally with `sync_status = 'pending'`
  - Returns `202 Accepted` immediately
  - Queues background job for Xero sync
  - No longer blocks waiting for Xero API response

#### 5. Audit Trail
- **File**: `backend/src/lib/xero/auditTrail.ts`
- Created `withAuditTrail()` wrapper function
- All Xero API calls should be wrapped to log:
  - Request payload
  - Response payload
  - Status code
  - Error messages (if any)
- Logs written to `sync_logs` table regardless of success/failure

#### 6. Server Initialization
- **File**: `backend/src/server.ts`
- Added queue worker initialization on server startup
- Graceful error handling if Redis is unavailable

### Part 3: Infrastructure Updates

#### 1. Dependencies
- **File**: `backend/package.json`
- Added dependencies:
  - `bullmq`: ^5.0.0 (queue management)
  - `ioredis`: ^5.3.2 (Redis client)

#### 2. Docker Compose
- **File**: `docker-compose.yml`
- Added Redis service:
  - Image: `redis:7-alpine`
  - Health checks configured
  - Persistent volume for data
- Updated backend service:
  - Added Redis dependency
  - Added Redis environment variables:
    - `REDIS_HOST`
    - `REDIS_PORT`
    - `REDIS_PASSWORD` (optional)

## ⏳ Pending Implementation

### Part 3: File Storage Transition (Not Yet Implemented)

#### 1. S3 Integration
- **Status**: Pending
- **Required**:
  - Install AWS SDK (`@aws-sdk/client-s3`) or similar
  - Create S3 configuration module
  - Set up bucket and credentials
  - Alternative: Google Cloud Storage or Google Drive integration

#### 2. Upload Flow Refactoring
- **Status**: Pending
- **Required**:
  - Update `POST /api/timesheets` route
  - Replace local file storage with S3 upload
  - Stream files directly to S3
  - Save public/signed URLs in `cloud_image_urls` column
  - Update `backend/src/middleware/upload.ts`

#### 3. Image URL Migration
- **Status**: Pending
- **Required**:
  - Migration script to move existing local images to S3
  - Update `image_urls` to `cloud_image_urls`
  - Cleanup old local files

### Part 4: Frontend UI Updates (Not Yet Implemented)

#### 1. Optimistic UI for Syncs
- **Status**: Pending
- **Required**:
  - Update `src/components/pages/Financials.tsx`
  - Show "Syncing..." spinner when sync initiated
  - Poll for sync status updates
  - Display sync status badges (pending/synced/failed)

#### 2. Error Feedback
- **Status**: Pending
- **Required**:
  - Add "View Error Details" button in Financials tab
  - Fetch error details from `sync_logs` table
  - Display error message and response details
  - Create error details modal/component

## 🔧 Configuration Required

### Environment Variables
Add to your `.env` file:
```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Optional, leave empty for local development

# AWS S3 (when implementing cloud storage)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=
```

### Database Migration
Run migrations to apply schema changes:
```bash
cd backend
npm run migrate
```

### Redis Setup
For local development:
```bash
# Using Docker
docker-compose up redis

# Or install Redis locally
# macOS: brew install redis
# Ubuntu: sudo apt-get install redis-server
```

## 📋 Next Steps

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Run Database Migrations**:
   ```bash
   npm run migrate
   ```

3. **Start Redis** (if not using Docker):
   ```bash
   redis-server
   ```

4. **Start Backend**:
   ```bash
   npm run dev
   ```

5. **Test Async Sync**:
   - Create an invoice from timesheets
   - Verify it returns `202 Accepted`
   - Check `sync_logs` table for audit trail
   - Verify sync status updates in database

6. **Implement S3 Integration** (when ready):
   - Set up AWS S3 bucket
   - Install AWS SDK
   - Update upload middleware
   - Migrate existing images

7. **Update Frontend** (when ready):
   - Add optimistic UI components
   - Implement sync status polling
   - Add error details view

## 🐛 Known Issues / Notes

1. **Circular Dependency**: `getValidAccessToken()` is currently duplicated in `queue.ts`. Should be extracted to a shared module (`backend/src/lib/xero/auth.ts`).

2. **Token Refresh**: Worker doesn't handle token refresh yet. If token expires, job will fail and retry. Should implement token refresh in worker.

3. **Error Handling**: Some error cases may need more robust handling (e.g., network failures, Xero API rate limits).

4. **Monitoring**: Consider adding:
   - Queue monitoring dashboard (Bull Board)
   - Metrics collection
   - Alerting for failed jobs

## 📚 Architecture Diagram

```
User Action
    ↓
Express API
    ↓
[202 Accepted]
    ↓
Queue Job (Redis/BullMQ)
    ↓
Background Worker
    ↓
Xero API Call
    ↓
Sync Logs Table (Audit Trail)
    ↓
Update Entity Status
```

## 🎯 Success Criteria

- ✅ Database schema supports soft deletes and sync tracking
- ✅ Xero sync routes return immediately (202 Accepted)
- ✅ Background jobs process syncs asynchronously
- ✅ All sync attempts logged to `sync_logs` table
- ✅ GET routes exclude soft-deleted records
- ⏳ S3 integration for file storage (pending)
- ⏳ Frontend optimistic UI (pending)
- ⏳ Error details view in frontend (pending)
