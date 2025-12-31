-- Add cloud storage support for timesheet images
-- This migration adds cloud_image_urls column to replace local file paths

-- Timesheets table: Add cloud_image_urls column
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS cloud_image_urls TEXT[] DEFAULT '{}';

-- Note: The existing image_urls column will remain for backward compatibility
-- During migration, we can copy data from image_urls to cloud_image_urls
-- Eventually, image_urls can be deprecated

-- Create index for cloud URLs (if needed for queries)
-- Note: Array indexes in PostgreSQL are less common, but we can add GIN index if needed
-- CREATE INDEX IF NOT EXISTS idx_timesheets_cloud_image_urls ON timesheets USING GIN(cloud_image_urls);
