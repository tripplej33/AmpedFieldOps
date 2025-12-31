import { Readable } from 'stream';
import { uploadToGoogleDrive, getAuthorizedClient } from './googleDrive';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

export interface CloudStorageConfig {
  provider: 's3' | 'google-drive' | 'local';
  // S3 config
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  // Google Drive config (uses existing googleDrive.ts)
  googleDriveFolderId?: string;
}

/**
 * Get cloud storage configuration from environment or database
 */
export async function getCloudStorageConfig(): Promise<CloudStorageConfig> {
  // Check environment variables first
  const provider = (process.env.CLOUD_STORAGE_PROVIDER || 'local') as 's3' | 'google-drive' | 'local';
  
  if (provider === 's3') {
    return {
      provider: 's3',
      s3Bucket: process.env.AWS_S3_BUCKET,
      s3Region: process.env.AWS_REGION || 'us-east-1',
      s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  } else if (provider === 'google-drive') {
    return {
      provider: 'google-drive',
      googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    };
  }
  
  return { provider: 'local' };
}

/**
 * Upload a file to cloud storage and return the public/signed URL
 */
export async function uploadFileToCloud(
  filePath: string,
  fileName: string,
  folderPath?: string
): Promise<string> {
  const config = await getCloudStorageConfig();
  
  if (config.provider === 'google-drive') {
    return await uploadToGoogleDriveForTimesheets(filePath, fileName, folderPath);
  } else if (config.provider === 's3') {
    return await uploadToS3(filePath, fileName, folderPath, config);
  } else {
    // Local storage - return relative path
    return `/uploads/${folderPath || 'general'}/${path.basename(filePath)}`;
  }
}

/**
 * Upload file to Google Drive for timesheet images
 */
async function uploadToGoogleDriveForTimesheets(
  filePath: string,
  fileName: string,
  folderPath?: string
): Promise<string> {
  const auth = await getAuthorizedClient();
  if (!auth) {
    throw new Error('Google Drive not authorized. Please connect your Google account in Settings.');
  }

  const drive = google.drive({ version: 'v3', auth });

  // Find or create folder structure: AmpedFieldOps/Timesheets/{project_id}
  let folderId: string | null = null;
  
  if (folderPath) {
    // Parse folderPath (e.g., "projects/{project_id}")
    const parts = folderPath.split('/');
    if (parts.length >= 2 && parts[0] === 'projects') {
      const projectId = parts[1];
      folderId = await findOrCreateTimesheetFolder(auth, projectId);
    }
  }

  // If no specific folder, use root or default folder
  if (!folderId) {
    folderId = await findOrCreateTimesheetFolder(auth);
  }

  const fileMetadata: any = {
    name: fileName,
  };

  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  // Determine MIME type from file extension
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };

  try {
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    // Make file publicly viewable (or use service account for better security)
    if (response.data.id) {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    // Return the web view link (public URL)
    return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`;
  } catch (error: any) {
    console.error('Failed to upload to Google Drive:', error);
    throw new Error(`Failed to upload to Google Drive: ${error.message}`);
  }
}

/**
 * Find or create timesheet folder in Google Drive
 */
async function findOrCreateTimesheetFolder(
  auth: any,
  projectId?: string
): Promise<string | null> {
  const drive = google.drive({ version: 'v3', auth });
  const baseFolderName = 'AmpedFieldOps';
  const timesheetFolderName = 'Timesheets';

  try {
    // Find or create base folder
    let baseFolderId = await findFolderByName(drive, baseFolderName);
    if (!baseFolderId) {
      const baseFolder = await drive.files.create({
        requestBody: {
          name: baseFolderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      baseFolderId = baseFolder.data.id || null;
      
      // Make base folder accessible
      if (baseFolderId) {
        await drive.permissions.create({
          fileId: baseFolderId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });
      }
    }

    if (!baseFolderId) return null;

    // Find or create Timesheets folder
    let timesheetFolderId = await findFolderByName(drive, timesheetFolderName, baseFolderId);
    if (!timesheetFolderId) {
      const timesheetFolder = await drive.files.create({
        requestBody: {
          name: timesheetFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [baseFolderId],
        },
        fields: 'id',
      });
      timesheetFolderId = timesheetFolder.data.id || null;
    }

    // If projectId is provided, create project-specific subfolder
    if (projectId && timesheetFolderId) {
      let projectFolderId = await findFolderByName(drive, projectId, timesheetFolderId);
      if (!projectFolderId) {
        const projectFolder = await drive.files.create({
          requestBody: {
            name: projectId,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [timesheetFolderId],
          },
          fields: 'id',
        });
        projectFolderId = projectFolder.data.id || null;
      }
      return projectFolderId;
    }

    return timesheetFolderId;
  } catch (error: any) {
    console.error('Failed to find or create timesheet folder:', error);
    return null;
  }
}

/**
 * Helper to find a folder by name
 */
async function findFolderByName(
  drive: any,
  folderName: string,
  parentId?: string
): Promise<string | null> {
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id || null;
  }

  return null;
}

/**
 * Upload file to S3
 */
async function uploadToS3(
  filePath: string,
  fileName: string,
  folderPath: string | undefined,
  config: CloudStorageConfig
): Promise<string> {
  // Dynamic import to avoid requiring AWS SDK if not using S3
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');

  if (!config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error('S3 configuration incomplete. Please set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.');
  }

  const s3Client = new S3Client({
    region: config.s3Region || 'us-east-1',
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
  });

  // Construct S3 key (path)
  const s3Key = folderPath ? `${folderPath}/${fileName}` : fileName;

  // Read file
  const fileContent = fs.readFileSync(filePath);

  // Upload to S3
  const putCommand = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: s3Key,
    Body: fileContent,
    ContentType: getContentType(fileName),
    ACL: 'public-read', // Or use signed URLs for better security
  });

  try {
    await s3Client.send(putCommand);

    // Return public URL
    return `https://${config.s3Bucket}.s3.${config.s3Region || 'us-east-1'}.amazonaws.com/${s3Key}`;
  } catch (error: any) {
    console.error('Failed to upload to S3:', error);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Get content type from file extension
 */
function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Delete file from cloud storage
 */
export async function deleteFileFromCloud(fileUrl: string): Promise<void> {
  const config = await getCloudStorageConfig();
  
  if (config.provider === 'google-drive') {
    // Extract file ID from Google Drive URL
    const fileIdMatch = fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const { deleteFromGoogleDrive } = await import('./googleDrive');
      await deleteFromGoogleDrive(fileIdMatch[1]);
    }
  } else if (config.provider === 's3') {
    // Extract key from S3 URL and delete
    const urlMatch = fileUrl.match(/\.amazonaws\.com\/(.+)$/);
    if (urlMatch && urlMatch[1]) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: config.s3Region || 'us-east-1',
        credentials: {
          accessKeyId: config.s3AccessKeyId!,
          secretAccessKey: config.s3SecretAccessKey!,
        },
      });
      
      await s3Client.send(new DeleteObjectCommand({
        Bucket: config.s3Bucket!,
        Key: urlMatch[1],
      }));
    }
  }
  // Local storage - file deletion handled separately
}
