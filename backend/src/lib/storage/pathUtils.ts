import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Generate partitioned path for file storage
 * 
 * Creates a path structure like: {basePath}/{hash[0:2]}/{hash[2:4]}/{uuid}.{ext}
 * This distributes files across multiple directories to avoid filesystem
 * performance issues with large numbers of files in a single directory.
 * 
 * @param filename Original filename (used to extract extension)
 * @param basePath Base storage path (e.g., 'uploads/projects/{project_id}')
 * @returns Partitioned path string
 */
export function generatePartitionedPath(filename: string, basePath: string): string {
  // Generate UUID for filename
  const fileUuid = uuidv4();
  
  // Create hash from UUID for partitioning
  const hash = createHash('sha256').update(fileUuid).digest('hex');
  
  // Extract extension from original filename
  const ext = path.extname(filename).toLowerCase();
  const safeExt = /^\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|csv|bin)$/i.test(ext) 
    ? ext 
    : '.bin';
  
  // Create partitioned path: {basePath}/{hash[0:2]}/{hash[2:4]}/{uuid}.{ext}
  const partition1 = hash.substring(0, 2);
  const partition2 = hash.substring(2, 4);
  
  // Normalize basePath (remove trailing slashes)
  const normalizedBase = basePath.replace(/\/+$/, '');
  
  return `${normalizedBase}/${partition1}/${partition2}/${fileUuid}${safeExt}`;
}

/**
 * Sanitize file path to prevent directory traversal attacks
 * 
 * @param filePath Path to sanitize
 * @returns Sanitized path
 */
export function sanitizePath(filePath: string): string {
  if (!filePath) return '';
  
  // Remove path traversal attempts
  let sanitized = filePath.replace(/\.\./g, '');
  
  // Normalize Windows paths
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Remove leading slashes (paths should be relative)
  sanitized = sanitized.replace(/^\/+/, '');
  
  // Remove multiple slashes
  sanitized = sanitized.replace(/\/+/g, '/');
  
  // Remove trailing slashes
  sanitized = sanitized.replace(/\/+$/, '');
  
  return sanitized;
}

/**
 * Resolve storage path to a storage-agnostic relative path
 * 
 * @param relativePath Relative path from uploads root
 * @returns Normalized storage path
 */
export function resolveStoragePath(relativePath: string): string {
  // Remove /uploads prefix if present
  let resolved = relativePath.replace(/^\/?uploads\/?/, '');
  
  // Apply sanitization
  resolved = sanitizePath(resolved);
  
  return resolved;
}

/**
 * Extract directory path from full file path
 * 
 * @param filePath Full file path
 * @returns Directory path (without filename)
 */
export function getDirectoryPath(filePath: string): string {
  const dir = path.dirname(filePath);
  return dir === '.' ? '' : dir;
}
