import { Readable } from 'stream';

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: string;
}

export interface FileMetadata {
  path: string;
  name: string;
  size: number;
  mimeType?: string;
  lastModified?: Date;
  isDirectory?: boolean;
}

export interface StorageConfig {
  driver: 'local' | 's3' | 'google-drive';
  basePath?: string;
  // S3 config
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Endpoint?: string;
  // Google Drive config (optional, uses existing OAuth tokens from settings)
  googleDriveFolderId?: string; // Optional: specific folder ID to use as root, otherwise uses basePath
}
