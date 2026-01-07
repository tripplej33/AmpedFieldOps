import { Readable } from 'stream';
import { PutOptions, FileMetadata } from './types';

/**
 * Storage Provider Interface
 * 
 * Abstract interface for file storage operations supporting
 * local filesystem, S3-compatible cloud storage, and Google Drive.
 */
export interface IStorageProvider {
  // Core operations
  put(filePath: string, content: Buffer | Readable, options?: PutOptions): Promise<string>;
  get(filePath: string): Promise<Buffer>;
  getStream(filePath: string): Promise<Readable>; // CRITICAL: For streaming large files
  exists(filePath: string): Promise<boolean>;
  delete(filePath: string): Promise<void>;
  copy(source: string, destination: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  
  // URL generation
  url(filePath: string): Promise<string>;
  signedUrl(filePath: string, expiresIn?: number): Promise<string>; // CRITICAL: For S3/Google Drive direct access
  
  // Metadata
  getMetadata(filePath: string): Promise<FileMetadata>;
  getDriver(): 'local' | 's3' | 'google-drive'; // Returns current driver type
  
  // Directory operations
  list(prefix?: string): Promise<FileMetadata[]>;
  makeDirectory(path: string): Promise<void>;
  
  // Connection testing (for UI)
  testConnection(): Promise<{ success: boolean; message: string }>;
}
