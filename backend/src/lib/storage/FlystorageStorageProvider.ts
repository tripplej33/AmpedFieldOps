import { Readable } from 'stream';
import { IStorageProvider } from './IStorageProvider';
import { StorageConfig, PutOptions, FileMetadata } from './types';
import { log } from '../logger';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';

/**
 * Flystorage Storage Provider
 * 
 * Implements IStorageProvider using @flystorage/file-storage
 * Supports both local filesystem and S3-compatible storage.
 */
export class FlystorageStorageProvider implements IStorageProvider {
  private config: StorageConfig;
  private storage: any; // Flystorage instance
  private driver: 'local' | 's3'; // Note: This provider only supports local and S3

  constructor(config: StorageConfig) {
    // Validate that driver is not 'google-drive' (this provider doesn't support it)
    if (config.driver === 'google-drive') {
      throw new Error('FlystorageStorageProvider does not support Google Drive. Use GoogleDriveStorageProvider instead.');
    }
    
    this.config = config;
    this.driver = config.driver as 'local' | 's3'; // Type assertion is safe after validation

    // Initialize Flystorage based on driver
    if (config.driver === 's3') {
      this.initializeS3();
    } else {
      this.initializeLocal();
    }
  }

  private initializeLocal(): void {
    try {
      // Dynamic import to avoid requiring package if not installed
      const { FileStorage } = require('@flystorage/file-storage');
      const { LocalStorageAdapter } = require('@flystorage/local-fs');
      const basePath = path.resolve(process.cwd(), this.config.basePath || 'uploads');
      
      // Ensure base directory exists
      // Note: This is only needed for local storage. With memory storage for uploads,
      // files are streamed directly to storage, but we still need the base directory
      // for file retrieval and serving.
      // In Docker, the directory should already exist from the Dockerfile, but we
      // try to create it if it doesn't exist (e.g., in development or if volume mount fails)
      if (!fs.existsSync(basePath)) {
        try {
          fs.mkdirSync(basePath, { recursive: true });
          log.info('Created base storage directory', { basePath });
        } catch (mkdirError: any) {
          // If directory creation fails, check if it exists now (race condition)
          // or if we're in a read-only environment
          if (!fs.existsSync(basePath)) {
            log.error('Failed to create base storage directory', mkdirError, {
              basePath,
              resolvedPath: path.resolve(basePath),
              cwd: process.cwd(),
              errorCode: mkdirError.code,
              errorMessage: mkdirError.message
            });
            throw new Error(`Storage directory does not exist and could not be created: ${mkdirError.message} (code: ${mkdirError.code || 'unknown'})`);
          } else {
            // Directory was created by another process, that's fine
            log.info('Base storage directory exists (created by another process)', { basePath });
          }
        }
      } else {
        // Directory exists, verify it's accessible
        try {
          fs.accessSync(basePath, fs.constants.R_OK | fs.constants.W_OK);
        } catch (accessError: any) {
          log.error('Base storage directory exists but is not accessible', accessError, {
            basePath,
            errorCode: accessError.code,
            errorMessage: accessError.message
          });
          throw new Error(`Storage directory exists but is not accessible: ${accessError.message} (code: ${accessError.code || 'unknown'})`);
        }
      }

      const adapter = new LocalStorageAdapter(basePath);
      this.storage = new FileStorage(adapter);
    } catch (error: any) {
      log.error('Failed to initialize local storage', error, {
        basePath: this.config.basePath || 'uploads',
        resolvedPath: path.resolve(process.cwd(), this.config.basePath || 'uploads'),
        errorMessage: error.message,
        errorStack: error.stack
      });
      throw new Error(`Local storage initialization failed: ${error.message}`);
    }
  }

  private initializeS3(): void {
    try {
      if (!this.config.s3Bucket || !this.config.s3AccessKeyId || !this.config.s3SecretAccessKey) {
        throw new Error('S3 configuration incomplete. Missing bucket, access key, or secret key.');
      }

      // Dynamic import
      const { FileStorage } = require('@flystorage/file-storage');
      const { S3StorageAdapter } = require('@flystorage/s3');
      const { S3Client } = require('@aws-sdk/client-s3');

      const s3Client = new S3Client({
        region: this.config.s3Region || 'us-east-1',
        credentials: {
          accessKeyId: this.config.s3AccessKeyId!,
          secretAccessKey: this.config.s3SecretAccessKey!,
        },
        ...(this.config.s3Endpoint && {
          endpoint: this.config.s3Endpoint,
          forcePathStyle: true, // Required for S3-compatible services
        }),
      });

      const prefix = this.config.basePath ? `${this.config.basePath}/` : '';
      const adapter = new S3StorageAdapter({
        client: s3Client,
        bucket: this.config.s3Bucket,
        prefix, // Optional prefix for all files
      });
      
      this.storage = new FileStorage(adapter);
    } catch (error: any) {
      log.error('Failed to initialize S3 storage', error);
      throw new Error(`S3 storage initialization failed: ${error.message}`);
    }
  }

  async put(filePath: string, content: Buffer | Readable, options?: PutOptions): Promise<string> {
    try {
      // Normalize path (remove leading slash, handle Windows paths)
      const normalizedPath = this.normalizePath(filePath);

      // Convert Buffer to Readable if needed
      let stream: Readable;
      if (Buffer.isBuffer(content)) {
        const { Readable } = require('stream');
        stream = Readable.from(content);
      } else {
        stream = content;
      }

      // Put file using Flystorage
      // Flystorage write() accepts string, Uint8Array, or Readable
      await this.storage.write(normalizedPath, stream);

      return normalizedPath;
    } catch (error: any) {
      log.error('Storage put error', error, { filePath });
      throw new Error(`Failed to store file: ${error.message}`);
    }
  }

  async get(filePath: string): Promise<Buffer> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const stream = await this.storage.read(normalizedPath);
      
      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error: any) {
      log.error('Storage get error', error, { filePath });
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async getStream(filePath: string): Promise<Readable> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      return await this.storage.read(normalizedPath);
    } catch (error: any) {
      log.error('Storage getStream error', error, { filePath });
      throw new Error(`Failed to read file stream: ${error.message}`);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      // Flystorage doesn't have exists(), use stat() and catch error
      try {
        await this.storage.stat(normalizedPath);
        return true;
      } catch {
        return false;
      }
    } catch (error: any) {
      log.error('Storage exists error', error, { filePath });
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      await this.storage.deleteFile(normalizedPath);
    } catch (error: any) {
      log.error('Storage delete error', error, { filePath });
      // Don't throw - file might already be deleted
      // Log but continue
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    try {
      const normalizedSource = this.normalizePath(source);
      const normalizedDest = this.normalizePath(destination);
      
      // Read source file
      const sourceStream = await this.storage.read(normalizedSource);
      // Write to destination
      await this.storage.write(normalizedDest, sourceStream);
    } catch (error: any) {
      log.error('Storage copy error', error, { source, destination });
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  async move(source: string, destination: string): Promise<void> {
    try {
      const normalizedSource = this.normalizePath(source);
      const normalizedDest = this.normalizePath(destination);
      
      // Copy then delete
      await this.copy(source, destination);
      await this.delete(source);
    } catch (error: any) {
      log.error('Storage move error', error, { source, destination });
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }

  async url(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    
    if (this.driver === 's3') {
      // For S3, return signed URL for direct access
      return await this.signedUrl(filePath, 3600); // 1 hour default
    } else {
      // For local, return relative URL
      return `/uploads/${normalizedPath}`;
    }
  }

  async signedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      
      if (this.driver === 's3') {
        // Use S3 presigned URL
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { S3Client } = require('@aws-sdk/client-s3');

        const s3Client = new S3Client({
          region: this.config.s3Region || 'us-east-1',
          credentials: {
            accessKeyId: this.config.s3AccessKeyId!,
            secretAccessKey: this.config.s3SecretAccessKey!,
          },
          ...(this.config.s3Endpoint && {
            endpoint: this.config.s3Endpoint,
            forcePathStyle: true,
          }),
        });

        const key = this.config.basePath 
          ? `${this.config.basePath}/${normalizedPath}`.replace(/\/+/g, '/')
          : normalizedPath;

        const command = new GetObjectCommand({
          Bucket: this.config.s3Bucket!,
          Key: key,
        });

        return await getSignedUrl(s3Client, command, { expiresIn });
      } else {
        // Local storage doesn't support signed URLs, return regular URL
        return `/uploads/${normalizedPath}`;
      }
    } catch (error: any) {
      log.error('Storage signedUrl error', error, { filePath });
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const stat = await this.storage.stat(normalizedPath);
      
      return {
        path: normalizedPath,
        name: path.basename(normalizedPath),
        size: stat.size || 0,
        mimeType: stat.mimeType || stat.contentType,
        lastModified: stat.lastModified ? new Date(stat.lastModified) : undefined,
        isDirectory: stat.isDirectory || false,
      };
    } catch (error: any) {
      log.error('Storage getMetadata error', error, { filePath });
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  getDriver(): 'local' | 's3' | 'google-drive' {
    // This provider only supports 'local' and 's3', but interface requires union type
    return this.driver;
  }

  async list(prefix?: string): Promise<FileMetadata[]> {
    try {
      const normalizedPrefix = prefix ? this.normalizePath(prefix) : '';
      const files: FileMetadata[] = [];
      
      // Flystorage list() returns async iterator
      for await (const item of this.storage.list(normalizedPrefix, { deep: false })) {
        files.push({
          path: item.path,
          name: path.basename(item.path),
          size: item.size || 0,
          mimeType: item.mimeType,
          lastModified: item.lastModified ? new Date(item.lastModified) : undefined,
          isDirectory: item.isDirectory || false,
        });
      }
      
      return files;
    } catch (error: any) {
      log.error('Storage list error', error, { prefix });
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  async makeDirectory(dirPath: string): Promise<void> {
    try {
      // For S3, directories don't exist (object-based storage)
      // For local, ensure directory exists
      if (this.driver === 'local') {
        const normalizedPath = this.normalizePath(dirPath);
        const fullPath = path.resolve(process.cwd(), this.config.basePath || 'uploads', normalizedPath);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      }
      // S3 doesn't need directory creation
    } catch (error: any) {
      log.error('Storage makeDirectory error', error, { dirPath });
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.driver === 's3') {
        // Test S3 connection by listing bucket (with limit 1)
        try {
          // Try to list first item (limit iteration)
          let count = 0;
          for await (const _ of this.storage.list('', { deep: false })) {
            count++;
            if (count >= 1) break; // Just test we can list
          }
          return { success: true, message: 'S3 connection successful' };
        } catch (error: any) {
          return { 
            success: false, 
            message: `S3 connection failed: ${error.message}` 
          };
        }
      } else {
        // Test local storage by checking directory permissions
        const basePath = path.resolve(process.cwd(), this.config.basePath || 'uploads');
        try {
          fs.accessSync(basePath, fs.constants.W_OK);
          return { success: true, message: 'Local storage accessible' };
        } catch (error: any) {
          return { 
            success: false, 
            message: `Local storage not accessible: ${error.message}` 
          };
        }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: `Connection test failed: ${error.message}` 
      };
    }
  }

  /**
   * Normalize file path
   * - Remove leading/trailing slashes
   * - Normalize Windows paths to forward slashes
   * - Remove path traversal attempts
   */
  private normalizePath(filePath: string): string {
    if (!filePath) return '';
    
    // Remove leading slash
    let normalized = filePath.replace(/^\/+/, '');
    
    // Normalize Windows paths
    normalized = normalized.replace(/\\/g, '/');
    
    // Remove path traversal attempts
    normalized = normalized.replace(/\.\./g, '');
    
    // Remove multiple slashes
    normalized = normalized.replace(/\/+/g, '/');
    
    return normalized;
  }
}
