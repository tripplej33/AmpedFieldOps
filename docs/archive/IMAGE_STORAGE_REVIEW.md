# Image Storage and Viewing Review

## Current Implementation

### Storage Mechanism

1. **File Upload Location**
   - Files are stored in: `backend/uploads/` directory
   - Storage handled by `multer` middleware (`backend/src/middleware/upload.ts`)
   - Files are renamed with UUIDs: `${uuidv4()}${ext}` (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`)

2. **File Constraints**
   - Maximum file size: 10MB per file
   - Maximum files: 5 images per timesheet
   - Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`

3. **Database Storage**
   - Image URLs stored in `timesheets.image_urls` column (TEXT[] array)
   - Format: `/uploads/{filename}` (e.g., `/uploads/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`)
   - Stored as relative paths, not absolute URLs

### Upload Flow

#### Option 1: Upload with Timesheet Creation (Current - Not Fully Implemented)
- Frontend sends `image_files` array in `createTimesheet()` call
- API client detects `image_files` and converts to FormData
- **ISSUE**: Backend route doesn't handle FormData - it expects JSON with `image_urls` array
- Backend route: `POST /api/timesheets` only accepts JSON, not multipart/form-data

#### Option 2: Separate Image Upload Endpoint (Partially Implemented)
- Endpoint: `POST /api/timesheets/:id/images`
- Uses `upload.array('images', 5)` middleware
- Accepts FormData with multiple files
- Updates existing timesheet's `image_urls` array
- **ISSUE**: This requires creating the timesheet first, then uploading images separately

### Current Issues

1. **Incomplete Upload Flow**
   - Frontend prepares FormData when `image_files` exist
   - Backend doesn't have a route handler for FormData on `POST /api/timesheets`
   - The route only accepts JSON with `image_urls` (pre-uploaded URLs)

2. **Image Serving**
   - Backend serves static files: `app.use('/uploads', express.static(...))`
   - Nginx proxies `/uploads` to backend: `proxy_pass http://backend:3001/uploads`
   - **Potential Issue**: If backend container restarts, files in `uploads/` directory may be lost (unless volume mounted)

3. **Image Display**
   - Frontend displays images using `<img src={url}>` where `url` is `/uploads/filename`
   - Images are shown as thumbnails (12x12 = 48px) in timesheet entries
   - Clicking opens in new tab via `<a href={url} target="_blank">`
   - **Issue**: No image viewer/modal for better viewing experience

4. **Volume Persistence**
   - Docker volume: `./backend/uploads:/app/uploads` (mounted in docker-compose.yml)
   - This should persist files, but only if the host directory exists
   - **Risk**: If volume not properly mounted, images lost on container restart

### Recommendations

#### 1. Fix Upload Flow
**Option A: Handle FormData in Create Route** (Recommended)
- Modify `POST /api/timesheets` to accept both JSON and FormData
- Use conditional middleware: `upload.array('images', 5)` when FormData detected
- Process files, save to disk, then create timesheet with image URLs

**Option B: Use Separate Upload Endpoint**
- Keep current flow: create timesheet first, then upload images
- Update frontend to call `/api/timesheets/:id/images` after creation

#### 2. Improve Image Viewing
- Add image modal/lightbox for full-size viewing
- Add image gallery with navigation (prev/next)
- Show image metadata (filename, size, upload date)

#### 3. Add Image Management
- Allow deleting individual images from timesheet
- Add image validation (dimensions, file size)
- Add image compression/optimization before storage

#### 4. Security Enhancements
- Add authentication check for `/uploads` route (currently public)
- Validate file types server-side (already done, but verify)
- Sanitize filenames
- Add rate limiting for uploads

#### 5. Storage Improvements
- Consider cloud storage (S3, Cloudinary) for production
- Add image thumbnails generation
- Implement image cleanup for deleted timesheets

### Current Code Flow

**Frontend (src/lib/api.ts):**
```typescript
async createTimesheet(data: any) {
  if (data.image_files && data.image_files.length > 0) {
    const formData = new FormData();
    // ... append fields and files
    return this.requestFormData('/api/timesheets', formData);
  }
  // ... JSON request
}
```

**Backend (backend/src/routes/timesheets.ts):**
```typescript
router.post('/', authenticate,
  body('project_id').isUUID(),
  // ... validation
  async (req: AuthRequest, res: Response) => {
    const { image_urls = [] } = req.body; // Expects JSON, not FormData!
    // ... creates timesheet
  }
);
```

**Issue**: Backend expects `image_urls` in JSON body, but frontend sends FormData with files.

### Proposed Fix

Update the create timesheet route to handle FormData:

```typescript
router.post('/', authenticate, upload.array('images', 5), async (req: AuthRequest, res: Response) => {
  // Check if FormData (has files) or JSON
  const isFormData = req.files && (req.files as Express.Multer.File[]).length > 0;
  
  let imageUrls: string[] = [];
  if (isFormData) {
    const files = req.files as Express.Multer.File[];
    imageUrls = files.map(f => `/uploads/${f.filename}`);
  } else {
    // JSON request
    imageUrls = req.body.image_urls || [];
  }
  
  // Extract other fields from req.body (works for both JSON and FormData)
  const { project_id, date, hours, ... } = req.body;
  
  // Create timesheet with imageUrls
  // ...
});
```

