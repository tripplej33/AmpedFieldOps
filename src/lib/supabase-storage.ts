/**
 * Supabase Storage Utilities
 * 
 * Provides functions for uploading, downloading, and managing files in Supabase Storage
 */

import { supabase } from './supabase';

export interface UploadOptions {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  upsert?: boolean;
}

export interface StorageFile {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: {
    size: number;
    mimetype: string;
    cacheControl?: string;
    contentEncoding?: string;
    contentDisposition?: string;
  };
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(options: UploadOptions): Promise<{ path: string; url: string }> {
  const { bucket, path, file, contentType, upsert = false } = options;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      upsert,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Upload a file and get a signed URL (for private buckets)
 */
export async function uploadFileWithSignedUrl(
  options: UploadOptions,
  expiresIn: number = 3600
): Promise<{ path: string; signedUrl: string }> {
  const { bucket, path, file, contentType, upsert = false } = options;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get signed URL for private access
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (signedUrlError) {
    throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
  }

  return {
    path: data.path,
    signedUrl: signedUrlData.signedUrl,
  };
}

/**
 * Download a file from Supabase Storage
 */
export async function downloadFile(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return data;
}

/**
 * Get a public URL for a file
 */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Get a signed URL for a file (for private buckets)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * List files in a bucket folder
 */
export async function listFiles(
  bucket: string,
  folder?: string,
  options?: { limit?: number; offset?: number; sortBy?: { column: string; order: 'asc' | 'desc' } }
): Promise<StorageFile[]> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder || '', {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      sortBy: options?.sortBy || { column: 'created_at', order: 'desc' },
    });

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }

  return data || [];
}

/**
 * Move or rename a file
 */
export async function moveFile(
  bucket: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .move(fromPath, toPath);

  if (error) {
    throw new Error(`Failed to move file: ${error.message}`);
  }
}

/**
 * Copy a file
 */
export async function copyFile(
  bucket: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .copy(fromPath, toPath);

  if (error) {
    throw new Error(`Failed to copy file: ${error.message}`);
  }
}

/**
 * Project Files Storage Helpers
 */
export const projectFilesStorage = {
  bucket: 'project-files',

  /**
   * Upload a project file
   */
  async upload(
    file: File,
    projectId: string,
    costCenterId?: string,
    customPath?: string
  ): Promise<{ path: string; url: string }> {
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = customPath || `projects/${projectId}${costCenterId ? `/${costCenterId}` : ''}/${timestamp}-${sanitizedFilename}`;

    return uploadFile({
      bucket: this.bucket,
      path,
      file,
      contentType: file.type,
    });
  },

  /**
   * Get file URL (public or signed)
   */
  async getUrl(path: string, useSignedUrl: boolean = false): Promise<string> {
    if (useSignedUrl) {
      return getSignedUrl(this.bucket, path);
    }
    return getPublicUrl(this.bucket, path);
  },

  /**
   * Delete a project file
   */
  async delete(path: string): Promise<void> {
    return deleteFile(this.bucket, path);
  },
};

/**
 * Timesheet Images Storage Helpers
 */
export const timesheetImagesStorage = {
  bucket: 'timesheet-images',

  /**
   * Upload timesheet images
   */
  async upload(
    file: File,
    projectId: string,
    timesheetId?: string
  ): Promise<{ path: string; url: string }> {
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `projects/${projectId}${timesheetId ? `/timesheet-${timesheetId}` : ''}/${timestamp}-${sanitizedFilename}`;

    return uploadFile({
      bucket: this.bucket,
      path,
      file,
      contentType: file.type,
    });
  },

  /**
   * Get image URL
   */
  async getUrl(path: string, useSignedUrl: boolean = false): Promise<string> {
    if (useSignedUrl) {
      return getSignedUrl(this.bucket, path);
    }
    return getPublicUrl(this.bucket, path);
  },

  /**
   * Delete timesheet image
   */
  async delete(path: string): Promise<void> {
    return deleteFile(this.bucket, path);
  },
};

/**
 * Safety Documents Storage Helpers
 */
export const safetyDocumentsStorage = {
  bucket: 'safety-documents',

  /**
   * Upload safety document
   */
  async upload(
    file: File | Blob,
    projectId: string,
    documentType: string,
    customPath?: string
  ): Promise<{ path: string; url: string }> {
    const timestamp = Date.now();
    const extension = file instanceof File ? file.name.split('.').pop() : 'pdf';
    const path = customPath || `projects/${projectId}/${documentType}/${timestamp}.${extension}`;

    return uploadFile({
      bucket: this.bucket,
      path,
      file,
      contentType: file instanceof File ? file.type : 'application/pdf',
    });
  },

  /**
   * Get document URL
   */
  async getUrl(path: string, useSignedUrl: boolean = true): Promise<string> {
    // Safety documents are typically private
    return getSignedUrl(this.bucket, path);
  },

  /**
   * Delete safety document
   */
  async delete(path: string): Promise<void> {
    return deleteFile(this.bucket, path);
  },
};

/**
 * Logos Storage Helpers
 */
export const logosStorage = {
  bucket: 'logos',

  /**
   * Upload logo
   */
  async upload(file: File, type: 'logo' | 'favicon' = 'logo'): Promise<{ path: string; url: string }> {
    const extension = file.name.split('.').pop() || 'png';
    const path = `${type}.${extension}`;

    return uploadFile({
      bucket: this.bucket,
      path,
      file,
      contentType: file.type,
      upsert: true, // Replace existing logo
    });
  },

  /**
   * Get logo URL
   */
  getUrl(type: 'logo' | 'favicon' = 'logo', extension: string = 'png'): string {
    return getPublicUrl(this.bucket, `${type}.${extension}`);
  },

  /**
   * Delete logo
   */
  async delete(type: 'logo' | 'favicon' = 'logo', extension: string = 'png'): Promise<void> {
    return deleteFile(this.bucket, `${type}.${extension}`);
  },
};

/**
 * Document Scans Storage Helpers
 */
export const documentScansStorage = {
  bucket: 'document-scans',

  /**
   * Upload document scan
   */
  async upload(
    file: File,
    projectId: string,
    scanId?: string
  ): Promise<{ path: string; url: string }> {
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `projects/${projectId}${scanId ? `/scan-${scanId}` : ''}/${timestamp}-${sanitizedFilename}`;

    return uploadFile({
      bucket: this.bucket,
      path,
      file,
      contentType: file.type,
    });
  },

  /**
   * Get scan URL
   */
  async getUrl(path: string, useSignedUrl: boolean = true): Promise<string> {
    return getSignedUrl(this.bucket, path);
  },

  /**
   * Delete document scan
   */
  async delete(path: string): Promise<void> {
    return deleteFile(this.bucket, path);
  },
};
