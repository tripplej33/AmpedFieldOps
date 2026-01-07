import { Readable } from 'stream';
import { IStorageProvider } from './IStorageProvider';
import { StorageConfig, PutOptions, FileMetadata } from './types';
import { log } from '../logger';
import { getAuthorizedClient } from '../googleDrive';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import path from 'path';

/**
 * Google Drive Storage Provider
 * 
 * Implements IStorageProvider using Google Drive API v3.
 * Uses existing OAuth infrastructure from googleDrive.ts.
 * Maps application file paths to Google Drive folder structure.
 */
export class GoogleDriveStorageProvider implements IStorageProvider {
  private config: StorageConfig;
  private drive: any; // Google Drive API client
  private rootFolderId: string | null = null; // Cached root folder ID
  private folderCache: Map<string, string> = new Map(); // Cache folder IDs by path
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(config: StorageConfig) {
    if (config.driver !== 'google-drive') {
      throw new Error('GoogleDriveStorageProvider requires driver to be "google-drive"');
    }
    this.config = config;
    // Drive client will be initialized lazily in getDriveClient()
  }

  /**
   * Get or initialize Google Drive API client
   */
  private async getDriveClient(): Promise<any> {
    if (this.drive) {
      return this.drive;
    }

    const auth = await getAuthorizedClient();
    if (!auth) {
      throw new Error('Google Drive not authorized. Please connect your Google account in Settings → Integrations.');
    }

    this.drive = google.drive({ version: 'v3', auth });
    return this.drive;
  }

  /**
   * Get root folder ID (basePath or configured folder)
   */
  private async getRootFolderId(): Promise<string> {
    // Check cache
    if (this.rootFolderId && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.rootFolderId;
    }

    const drive = await this.getDriveClient();

    // If specific folder ID is configured, use it
    if (this.config.googleDriveFolderId) {
      try {
        // Verify folder exists and is accessible
        await drive.files.get({
          fileId: this.config.googleDriveFolderId,
          fields: 'id, name, mimeType'
        });
        this.rootFolderId = this.config.googleDriveFolderId;
        this.cacheTimestamp = Date.now();
        return this.rootFolderId;
      } catch (error: any) {
        log.error('Configured Google Drive folder not accessible', error);
        throw new Error(`Configured Google Drive folder is not accessible: ${error.message}`);
      }
    }

    // Otherwise, find or create folder based on basePath
    const basePath = this.config.basePath || 'uploads';
    this.rootFolderId = await this.findOrCreateFolder(basePath, 'root');
    this.cacheTimestamp = Date.now();
    return this.rootFolderId;
  }

  /**
   * Find or create a folder in Google Drive
   * @param folderName Name of the folder
   * @param parentId Parent folder ID or 'root' for root folder
   * @returns Folder ID
   */
  private async findOrCreateFolder(folderName: string, parentId: string): Promise<string> {
    const cacheKey = `${parentId}/${folderName}`;
    
    // Check cache
    if (this.folderCache.has(cacheKey) && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.folderCache.get(cacheKey)!;
    }

    const drive = await this.getDriveClient();
    const query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;

    try {
      // Search for existing folder
      const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
        pageSize: 1
      });

      if (response.data.files && response.data.files.length > 0) {
        const folderId = response.data.files[0].id!;
        this.folderCache.set(cacheKey, folderId);
        return folderId;
      }

      // Create folder if it doesn't exist
      const folderResponse = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId === 'root' ? undefined : [parentId]
        },
        fields: 'id'
      });

      const newFolderId = folderResponse.data.id!;
      this.folderCache.set(cacheKey, newFolderId);
      return newFolderId;
    } catch (error: any) {
      log.error('Failed to find or create Google Drive folder', error, { folderName, parentId });
      throw new Error(`Failed to find or create folder: ${error.message}`);
    }
  }

  /**
   * Resolve application path to Google Drive folder structure
   * Returns parent folder ID and filename
   */
  private async resolvePath(applicationPath: string): Promise<{ parentId: string; fileName: string }> {
    // Normalize path (remove leading slash, handle Windows paths)
    const normalizedPath = applicationPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(p => p.length > 0);
    
    if (parts.length === 0) {
      throw new Error('Invalid file path');
    }

    const fileName = parts[parts.length - 1];
    const folderParts = parts.slice(0, -1);

    // Start from root folder
    let currentFolderId = await this.getRootFolderId();

    // Navigate/create folder structure
    for (const folderName of folderParts) {
      currentFolderId = await this.findOrCreateFolder(folderName, currentFolderId);
    }

    return { parentId: currentFolderId, fileName };
  }

  /**
   * Find file by path in Google Drive
   * Returns file ID if found, null otherwise
   */
  private async findFileByPath(applicationPath: string): Promise<string | null> {
    try {
      const { parentId, fileName } = await this.resolvePath(applicationPath);
      const drive = await this.getDriveClient();

      const query = `name='${fileName.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
      
      const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
        pageSize: 1
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id!;
      }

      return null;
    } catch (error: any) {
      log.error('Failed to find file in Google Drive', error, { path: applicationPath });
      return null;
    }
  }

  /**
   * Normalize path (remove leading slash, handle Windows paths)
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/^\/+/, '').replace(/\\/g, '/');
  }

  async put(filePath: string, content: Buffer | Readable, options?: PutOptions): Promise<string> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const { parentId, fileName } = await this.resolvePath(normalizedPath);
      const drive = await this.getDriveClient();

      // Check if file already exists
      const existingFileId = await this.findFileByPath(normalizedPath);
      
      // Convert Buffer to Readable if needed
      let stream: Readable;
      if (Buffer.isBuffer(content)) {
        stream = Readable.from(content);
      } else {
        stream = content;
      }

      const fileMetadata: any = {
        name: fileName,
        parents: [parentId]
      };

      // If file exists, update it; otherwise create new
      if (existingFileId) {
        // Update existing file
        await drive.files.update({
          fileId: existingFileId,
          requestBody: {
            name: fileName
          },
          media: {
            mimeType: options?.contentType || 'application/octet-stream',
            body: stream
          },
          fields: 'id'
        });

        // Return path with file ID for storage
        return `gdrive://${existingFileId}`;
      } else {
        // Create new file
        const response = await drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: options?.contentType || 'application/octet-stream',
            body: stream
          },
          fields: 'id'
        });

        const fileId = response.data.id!;
        // Return path with file ID for storage
        return `gdrive://${fileId}`;
      }
    } catch (error: any) {
      log.error('Google Drive put error', error, { filePath });
      throw new Error(`Failed to store file in Google Drive: ${error.message}`);
    }
  }

  async get(filePath: string): Promise<Buffer> {
    const stream = await this.getStream(filePath);
    
    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getStream(filePath: string): Promise<Readable> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const drive = await this.getDriveClient();

      // Try to find file by path or extract file ID from gdrive:// format
      let fileId: string | null = null;

      if (normalizedPath.startsWith('gdrive://')) {
        // Extract file ID from gdrive:// format
        fileId = normalizedPath.replace('gdrive://', '');
      } else {
        // Find file by path
        fileId = await this.findFileByPath(normalizedPath);
        if (!fileId) {
          throw new Error('File not found');
        }
      }

      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return response.data as Readable;
    } catch (error: any) {
      log.error('Google Drive getStream error', error, { filePath });
      throw new Error(`Failed to read file from Google Drive: ${error.message}`);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      
      // Check gdrive:// format
      if (normalizedPath.startsWith('gdrive://')) {
        const fileId = normalizedPath.replace('gdrive://', '');
        const drive = await this.getDriveClient();
        try {
          await drive.files.get({
            fileId,
            fields: 'id'
          });
          return true;
        } catch {
          return false;
        }
      }

      // Find by path
      const fileId = await this.findFileByPath(normalizedPath);
      return fileId !== null;
    } catch (error: any) {
      log.error('Google Drive exists error', error, { filePath });
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const drive = await this.getDriveClient();

      let fileId: string | null = null;

      if (normalizedPath.startsWith('gdrive://')) {
        fileId = normalizedPath.replace('gdrive://', '');
      } else {
        fileId = await this.findFileByPath(normalizedPath);
        if (!fileId) {
          throw new Error('File not found');
        }
      }

      await drive.files.delete({ fileId });
    } catch (error: any) {
      log.error('Google Drive delete error', error, { filePath });
      throw new Error(`Failed to delete file from Google Drive: ${error.message}`);
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    try {
      const normalizedSource = this.normalizePath(source);
      const normalizedDest = this.normalizePath(destination);
      const drive = await this.getDriveClient();

      // Find source file
      let sourceFileId: string | null = null;
      if (normalizedSource.startsWith('gdrive://')) {
        sourceFileId = normalizedSource.replace('gdrive://', '');
      } else {
        sourceFileId = await this.findFileByPath(normalizedSource);
        if (!sourceFileId) {
          throw new Error('Source file not found');
        }
      }

      // Resolve destination path
      const { parentId, fileName } = await this.resolvePath(normalizedDest);

      // Copy file in Google Drive
      await drive.files.copy({
        fileId: sourceFileId,
        requestBody: {
          name: fileName,
          parents: [parentId]
        },
        fields: 'id'
      });
    } catch (error: any) {
      log.error('Google Drive copy error', error, { source, destination });
      throw new Error(`Failed to copy file in Google Drive: ${error.message}`);
    }
  }

  async move(source: string, destination: string): Promise<void> {
    try {
      const normalizedSource = this.normalizePath(source);
      const normalizedDest = this.normalizePath(destination);
      const drive = await this.getDriveClient();

      // Find source file
      let sourceFileId: string | null = null;
      if (normalizedSource.startsWith('gdrive://')) {
        sourceFileId = normalizedSource.replace('gdrive://', '');
      } else {
        sourceFileId = await this.findFileByPath(normalizedSource);
        if (!sourceFileId) {
          throw new Error('Source file not found');
        }
      }

      // Get current parents
      const fileResponse = await drive.files.get({
        fileId: sourceFileId,
        fields: 'parents, name'
      });

      const previousParents = fileResponse.data.parents?.join(',') || '';

      // Resolve destination path
      const { parentId, fileName } = await this.resolvePath(normalizedDest);

      // Move file (update parents and optionally rename)
      await drive.files.update({
        fileId: sourceFileId,
        addParents: parentId,
        removeParents: previousParents,
        requestBody: {
          name: fileName
        },
        fields: 'id, parents'
      });
    } catch (error: any) {
      log.error('Google Drive move error', error, { source, destination });
      throw new Error(`Failed to move file in Google Drive: ${error.message}`);
    }
  }

  async url(filePath: string): Promise<string> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const drive = await this.getDriveClient();

      let fileId: string | null = null;
      if (normalizedPath.startsWith('gdrive://')) {
        fileId = normalizedPath.replace('gdrive://', '');
      } else {
        fileId = await this.findFileByPath(normalizedPath);
        if (!fileId) {
          throw new Error('File not found');
        }
      }

      // Get file metadata to get webViewLink
      const response = await drive.files.get({
        fileId,
        fields: 'webViewLink, webContentLink'
      });

      // Prefer webViewLink for viewing, fallback to webContentLink for download
      return response.data.webViewLink || response.data.webContentLink || '';
    } catch (error: any) {
      log.error('Google Drive url error', error, { filePath });
      throw new Error(`Failed to get file URL from Google Drive: ${error.message}`);
    }
  }

  async signedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const drive = await this.getDriveClient();

      let fileId: string | null = null;
      if (normalizedPath.startsWith('gdrive://')) {
        fileId = normalizedPath.replace('gdrive://', '');
      } else {
        fileId = await this.findFileByPath(normalizedPath);
        if (!fileId) {
          throw new Error('File not found');
        }
      }

      // Generate temporary download URL
      // Note: Google Drive doesn't support signed URLs like S3, but we can use webContentLink
      // For temporary access, we'd need to make the file temporarily public or use service account
      // For now, return webContentLink which requires authentication
      const response = await drive.files.get({
        fileId,
        fields: 'webContentLink'
      });

      if (!response.data.webContentLink) {
        throw new Error('Unable to generate download URL');
      }

      return response.data.webContentLink;
    } catch (error: any) {
      log.error('Google Drive signedUrl error', error, { filePath });
      throw new Error(`Failed to generate signed URL from Google Drive: ${error.message}`);
    }
  }

  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const drive = await this.getDriveClient();

      let fileId: string | null = null;
      if (normalizedPath.startsWith('gdrive://')) {
        fileId = normalizedPath.replace('gdrive://', '');
      } else {
        fileId = await this.findFileByPath(normalizedPath);
        if (!fileId) {
          throw new Error('File not found');
        }
      }

      const response = await drive.files.get({
        fileId,
        fields: 'id, name, size, mimeType, modifiedTime, createdTime'
      });

      const file = response.data;
      return {
        path: normalizedPath,
        name: file.name || '',
        size: parseInt(file.size || '0', 10),
        mimeType: file.mimeType || undefined,
        lastModified: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
        isDirectory: file.mimeType === 'application/vnd.google-apps.folder'
      };
    } catch (error: any) {
      log.error('Google Drive getMetadata error', error, { filePath });
      throw new Error(`Failed to get file metadata from Google Drive: ${error.message}`);
    }
  }

  getDriver(): 'google-drive' {
    return 'google-drive';
  }

  async list(prefix?: string): Promise<FileMetadata[]> {
    try {
      const drive = await this.getDriveClient();
      let parentId: string;

      if (prefix) {
        const normalizedPrefix = this.normalizePath(prefix);
        const { parentId: resolvedParentId } = await this.resolvePath(normalizedPrefix);
        parentId = resolvedParentId;
      } else {
        parentId = await this.getRootFolderId();
      }

      const response = await drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'files(id, name, size, mimeType, modifiedTime, createdTime)',
        spaces: 'drive',
        pageSize: 1000
      });

      const files = response.data.files || [];
      return files.map((file: any) => ({
        path: prefix ? `${prefix}/${file.name}` : file.name || '',
        name: file.name || '',
        size: parseInt(file.size || '0', 10),
        mimeType: file.mimeType || undefined,
        lastModified: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
        isDirectory: file.mimeType === 'application/vnd.google-apps.folder'
      }));
    } catch (error: any) {
      log.error('Google Drive list error', error, { prefix });
      throw new Error(`Failed to list files in Google Drive: ${error.message}`);
    }
  }

  async makeDirectory(dirPath: string): Promise<void> {
    try {
      const normalizedPath = this.normalizePath(dirPath);
      const parts = normalizedPath.split('/').filter(p => p.length > 0);
      
      if (parts.length === 0) {
        throw new Error('Invalid directory path');
      }

      let currentFolderId = await this.getRootFolderId();

      // Create folder structure
      for (const folderName of parts) {
        currentFolderId = await this.findOrCreateFolder(folderName, currentFolderId);
      }
    } catch (error: any) {
      log.error('Google Drive makeDirectory error', error, { dirPath });
      throw new Error(`Failed to create directory in Google Drive: ${error.message}`);
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const drive = await this.getDriveClient();
      
      // Test connection by listing root folder
      await drive.files.list({
        q: "trashed=false",
        fields: 'files(id, name)',
        pageSize: 1
      });

      // Test root folder access
      await this.getRootFolderId();

      return {
        success: true,
        message: 'Google Drive connection successful'
      };
    } catch (error: any) {
      log.error('Google Drive connection test failed', error);
      return {
        success: false,
        message: error.message || 'Failed to connect to Google Drive. Please check OAuth connection in Settings → Integrations.'
      };
    }
  }
}
