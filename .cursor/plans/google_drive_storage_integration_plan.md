---
name: Google Drive Storage Integration Plan
overview: Integrate Google Drive as a storage driver option in the storage abstraction layer, allowing users to store all application files (project files, timesheet images, logos, etc.) in Google Drive instead of local filesystem or S3.
todos:
  - id: gd-1-research
    content: Research Google Drive API integration options and adapter availability
    status: completed
  - id: gd-2-types
    content: Extend StorageConfig and IStorageProvider types to support Google Drive driver
    status: pending
  - id: gd-3-adapter
    content: Create GoogleDriveStorageProvider implementing IStorageProvider interface
    status: pending
  - id: gd-4-oauth
    content: Integrate existing Google Drive OAuth system with storage provider
    status: pending
  - id: gd-5-factory
    content: Update StorageFactory to support Google Drive configuration and initialization
    status: pending
  - id: gd-6-settings-api
    content: Update storage settings API to handle Google Drive configuration
    status: pending
  - id: gd-7-settings-ui
    content: Update Settings UI to include Google Drive as storage option
    status: pending
  - id: gd-8-testing
    content: Implement testConnection() for Google Drive
    status: pending
  - id: gd-9-migration
    content: Update migration script to support Google Drive
    status: pending
  - id: gd-10-docs
    content: Update documentation with Google Drive setup instructions
    status: pending
---

# Google Drive Storage Integration Plan

## Executive Summary

This plan extends the existing Storage Abstraction Layer to support Google Drive as a third storage driver option (in addition to `local` and `s3`). This will allow users to store all application files (project files, timesheet images, logos, safety documents, etc.) directly in Google Drive, leveraging the existing OAuth integration that's currently only used for backups.

## Current State Analysis

### Existing Google Drive Implementation
- **Location**: `backend/src/lib/googleDrive.ts`
- **Purpose**: Currently only used for **backups** (`backend/src/routes/backups.ts`)
- **OAuth Flow**: Fully implemented with token storage in database
- **API**: Uses `googleapis` library with Drive API v3
- **Features**:
  - OAuth2 authentication
  - Token refresh handling
  - File upload/download/delete
  - Folder creation and management

### Storage Abstraction Layer
- **Current Drivers**: `'local'` | `'s3'`
- **Interface**: `IStorageProvider` in `backend/src/lib/storage/IStorageProvider.ts`
- **Implementation**: `FlystorageStorageProvider` using Flystorage adapters
- **Factory**: `StorageFactory` reads config from database `settings` table

### Research Findings
- **Flystorage Adapters**: No maintained Google Drive adapter exists for `@flystorage/file-storage`
- **Alternative**: `@flysystem-ts/google-drive-adapter` exists but is unmaintained (0 weekly downloads)
- **Decision**: Create custom `GoogleDriveStorageProvider` implementing `IStorageProvider` interface
- **OAuth**: Reuse existing `googleDrive.ts` OAuth infrastructure

## Implementation Plan

### Phase 1: Type System Updates

#### 1.1 Extend StorageConfig Type
**File**: `backend/src/lib/storage/types.ts`

```typescript
export interface StorageConfig {
  driver: 'local' | 's3' | 'google-drive';  // Add 'google-drive'
  basePath?: string;
  // S3 config
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Endpoint?: string;
  // Google Drive config (optional, uses existing OAuth tokens)
  googleDriveFolderId?: string;  // Optional: specific folder ID, otherwise uses basePath
}
```

#### 1.2 Update IStorageProvider Interface
**File**: `backend/src/lib/storage/IStorageProvider.ts`

```typescript
getDriver(): 'local' | 's3' | 'google-drive';  // Update return type
```

**Note**: All other methods remain the same - Google Drive provider must implement all interface methods.

### Phase 2: Google Drive Storage Provider Implementation

#### 2.1 Create GoogleDriveStorageProvider
**File**: `backend/src/lib/storage/GoogleDriveStorageProvider.ts` (new)

**Key Implementation Details**:

1. **Constructor**:
   - Accepts `StorageConfig` with `driver: 'google-drive'`
   - Initializes Google Drive API client using existing OAuth tokens
   - Uses `getAuthorizedClient()` from `googleDrive.ts`

2. **Path Mapping**:
   - Google Drive uses file IDs, not paths
   - Need to map application paths to Google Drive file/folder structure
   - Use `basePath` as root folder (find or create)
   - Store path-to-fileId mapping in database or use folder structure

3. **Core Methods Implementation**:
   - `put()`: Upload file to Google Drive, return file ID or path
   - `get()`: Download file from Google Drive by path
   - `getStream()`: Stream file download (critical for large files)
   - `exists()`: Check if file exists in Google Drive
   - `delete()`: Delete file from Google Drive
   - `copy()`: Copy file in Google Drive
   - `move()`: Move file in Google Drive (update parent)
   - `url()`: Generate Google Drive shareable link or webViewLink
   - `signedUrl()`: Generate temporary download URL (Google Drive supports this)
   - `getMetadata()`: Get file metadata from Google Drive
   - `list()`: List files in folder
   - `makeDirectory()`: Create folder in Google Drive
   - `testConnection()`: Verify OAuth tokens and API access

4. **Path Resolution Strategy**:
   - **Option A**: Use folder structure matching application paths
     - Example: `uploads/projects/abc123/file.pdf` → Find/create folders, upload file
     - Pros: Intuitive, matches local/S3 structure
     - Cons: Multiple API calls for nested paths
   - **Option B**: Store path-to-fileId mapping in database
     - Pros: Faster lookups, single API call
     - Cons: Requires database sync, more complex
   - **Recommendation**: Use Option A (folder structure) for simplicity and consistency

5. **File ID Storage**:
   - Store Google Drive file ID in `file_path` column (alongside path)
   - Format: `gdrive://{fileId}` or `gdrive:{fileId}:{path}`
   - Or add new `storage_file_id` column for Google Drive file IDs

#### 2.2 Integration with Existing OAuth
**Reuse**: `backend/src/lib/googleDrive.ts`
- Use `getAuthorizedClient()` to get authenticated Drive client
- Use existing token refresh mechanism
- No changes needed to OAuth flow

### Phase 3: Factory and Configuration Updates

#### 3.1 Update StorageFactory
**File**: `backend/src/lib/storage/StorageFactory.ts`

**Changes**:
1. Update `getStorageConfigFromDB()` to read Google Drive settings:
   ```sql
   AND key IN ('storage_driver', 'storage_base_path', 'storage_s3_bucket', ..., 'storage_google_drive_folder_id')
   ```

2. Update config building logic:
   ```typescript
   if (driver === 'google-drive') {
     config.googleDriveFolderId = settings.storage_google_drive_folder_id || undefined;
   }
   ```

3. Update `createStorageProvider()` to handle Google Drive:
   ```typescript
   if (config.driver === 'google-drive') {
     return new GoogleDriveStorageProvider(config);
   }
   ```

4. Update cache invalidation to include Google Drive config

#### 3.2 Update Database Settings
**New Settings Keys**:
- `storage_google_drive_folder_id` (optional): Specific folder ID to use as root
- If not set, uses `basePath` to find/create folder

**Note**: Google Drive OAuth credentials (`google_drive_client_id`, `google_drive_client_secret`, `google_drive_tokens`) already exist in settings table.

### Phase 4: API Updates

#### 4.1 Update Storage Settings API
**File**: `backend/src/routes/settings.ts`

**Changes to `GET /api/settings/storage`**:
- Return Google Drive configuration if driver is `'google-drive'`
- Include connection status (check if OAuth tokens exist and are valid)

**Changes to `PUT /api/settings/storage`**:
- Validate Google Drive configuration
- Check OAuth connection before saving
- Store `storage_google_drive_folder_id` if provided

**Changes to `POST /api/settings/storage/test`**:
- Test Google Drive connection using OAuth tokens
- Verify folder access if `googleDriveFolderId` is provided

#### 4.2 OAuth Status Endpoint
**Reuse**: `GET /api/backups/google-drive/status`
- Already exists and checks OAuth connection
- Can be used by storage settings UI

### Phase 5: UI Updates

#### 5.1 Settings Page - Storage Tab
**File**: `src/components/pages/Settings.tsx`

**Changes**:
1. Add `'google-drive'` option to storage driver select/radio
2. Show Google Drive configuration section when selected:
   - Connection status indicator (reuse existing Google Drive connection status)
   - "Connect Google Drive" button (if not connected)
   - Optional: Folder ID input (for specific folder)
   - Info: "Uses existing Google Drive OAuth connection from Integrations tab"
3. Update validation to require Google Drive connection before saving
4. Update test connection to work with Google Drive

#### 5.2 Integrations Tab
**No changes needed** - Google Drive OAuth setup already exists here.

### Phase 6: Implementation Details

#### 6.1 Path Resolution for Google Drive

**Strategy**: Use folder structure matching application paths

**Implementation**:
```typescript
async resolvePath(applicationPath: string): Promise<string> {
  // Example: 'uploads/projects/abc123/file.pdf'
  const parts = applicationPath.split('/');
  const basePath = this.config.basePath || 'uploads';
  
  // Find or create base folder
  let currentFolderId = await this.findOrCreateFolder(basePath, 'root');
  
  // Navigate/create folder structure
  for (let i = 0; i < parts.length - 1; i++) {
    currentFolderId = await this.findOrCreateFolder(parts[i], currentFolderId);
  }
  
  return currentFolderId; // Parent folder ID for file upload
}
```

#### 6.2 File ID Storage

**Option 1**: Store in `file_path` column
- Format: `gdrive://{fileId}` or `gdrive:{fileId}`
- Pros: No schema changes
- Cons: Mixed format with paths

**Option 2**: Add `storage_file_id` column
- Store Google Drive file ID separately
- Pros: Clean separation
- Cons: Requires migration

**Recommendation**: Use Option 1 with format `gdrive://{fileId}` for backward compatibility.

#### 6.3 URL Generation

**`url()` method**:
- Return Google Drive `webViewLink` for viewing in browser
- Or `webContentLink` for direct download

**`signedUrl()` method**:
- Use Google Drive API to generate temporary download URL
- Set expiration (default 1 hour)

#### 6.4 Streaming Support

**`getStream()` method**:
- Use Google Drive API `files.get()` with `alt: 'media'`
- Return Node.js Readable stream
- Critical for large files (timesheet images, PDFs)

### Phase 7: Migration Considerations

#### 7.1 Existing Files
- Files already in Google Drive (from backups) remain separate
- New storage abstraction uses different folder structure
- Migration script can optionally move files, but not required

#### 7.2 Hybrid Support
- Download routes already support hybrid (old/new paths)
- Google Drive URLs (`gdrive://...`) can be detected and handled
- No changes needed to existing hybrid logic

### Phase 8: Testing Requirements

#### 8.1 Unit Tests
- Test path resolution
- Test file operations (upload, download, delete)
- Test folder creation
- Test error handling (OAuth failures, API errors)

#### 8.2 Integration Tests
- Test with real Google Drive account
- Test OAuth token refresh
- Test large file uploads/downloads
- Test concurrent operations

#### 8.3 UI Tests
- Test storage settings UI with Google Drive option
- Test connection status display
- Test OAuth flow integration

### Phase 9: Documentation Updates

#### 9.1 Storage Setup Documentation
**File**: `STORAGE_SETUP.md` (create or update)

**Sections to add**:
1. Google Drive Setup
   - Prerequisites (Google Cloud Project, OAuth credentials)
   - OAuth configuration steps
   - Storage settings configuration
   - Folder structure explanation
2. Comparison Table
   - Local vs S3 vs Google Drive
   - Performance characteristics
   - Cost considerations
   - Use case recommendations

#### 9.2 README Updates
- Add Google Drive to supported storage options
- Link to setup documentation

## Technical Challenges & Solutions

### Challenge 1: Path-to-FileID Mapping
**Problem**: Google Drive uses file IDs, not paths. Need efficient way to resolve application paths to file IDs.

**Solution**: 
- Use folder structure matching application paths
- Cache folder IDs in memory (with TTL)
- Fallback to API search if cache miss

### Challenge 2: OAuth Token Management
**Problem**: OAuth tokens expire and need refresh.

**Solution**: 
- Reuse existing `getAuthorizedClient()` which handles token refresh
- No additional token management needed

### Challenge 3: File Size Limits
**Problem**: Google Drive has upload size limits (5TB per file, but API has limits).

**Solution**:
- Use resumable uploads for large files (>5MB)
- Stream uploads to avoid memory issues
- Handle quota errors gracefully

### Challenge 4: Rate Limiting
**Problem**: Google Drive API has rate limits (1000 requests/100 seconds/user).

**Solution**:
- Implement request queuing/throttling
- Cache folder IDs aggressively
- Batch operations where possible
- Log rate limit errors for monitoring

## Implementation Checklist

### Backend
- [ ] Update `StorageConfig` type to include `'google-drive'` driver
- [ ] Update `IStorageProvider.getDriver()` return type
- [ ] Create `GoogleDriveStorageProvider` class
- [ ] Implement all `IStorageProvider` methods
- [ ] Update `StorageFactory` to support Google Drive
- [ ] Update storage settings API endpoints
- [ ] Add Google Drive settings to database query
- [ ] Update migration script (if needed)

### Frontend
- [ ] Add Google Drive option to storage driver select
- [ ] Add Google Drive configuration UI
- [ ] Show connection status
- [ ] Integrate with existing OAuth flow
- [ ] Update test connection functionality

### Testing
- [ ] Unit tests for GoogleDriveStorageProvider
- [ ] Integration tests with real Google Drive
- [ ] UI tests for settings page
- [ ] Performance testing (large files, concurrent operations)

### Documentation
- [ ] Update `STORAGE_SETUP.md`
- [ ] Update `README.md`
- [ ] Add inline code documentation
- [ ] Create troubleshooting guide

## Estimated Effort

- **Backend Implementation**: 8-12 hours
- **Frontend Updates**: 2-4 hours
- **Testing**: 4-6 hours
- **Documentation**: 2-3 hours
- **Total**: 16-25 hours

## Risks & Mitigation

### Risk 1: Google Drive API Changes
**Mitigation**: Use official `googleapis` library which is actively maintained

### Risk 2: Performance Issues
**Mitigation**: 
- Implement aggressive caching
- Use streaming for large files
- Monitor API usage and optimize

### Risk 3: OAuth Token Issues
**Mitigation**: 
- Reuse proven OAuth implementation
- Add comprehensive error handling
- Provide clear error messages to users

## Success Criteria

1. ✅ Users can select Google Drive as storage driver in Settings
2. ✅ All file operations (upload, download, delete) work with Google Drive
3. ✅ Files are organized in Google Drive matching application folder structure
4. ✅ OAuth connection status is displayed and managed
5. ✅ Large files (>10MB) upload/download successfully
6. ✅ Migration from local/S3 to Google Drive works
7. ✅ Documentation is complete and accurate

## Next Steps

1. Review and approve this plan
2. Create implementation branch
3. Start with Phase 1 (Type System Updates)
4. Implement incrementally with testing at each phase
5. Update plan document as implementation progresses
