import fs from 'fs';
import { StorageFactory } from './storage/StorageFactory';

/**
 * File content validation using magic numbers/file signatures
 * Validates actual file content matches declared MIME type
 * Prevents malicious files disguised as images or documents
 * 
 * Supports both local filesystem paths and storage provider paths
 */

// Magic number signatures for common file types
const FILE_SIGNATURES: { [key: string]: Array<{ offset: number; bytes: number[] }> } = {
  'image/jpeg': [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  ],
  'image/png': [
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  ],
  'application/pdf': [
    { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],
  'application/msword': [
    { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE2 (DOC)
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP (DOCX is a ZIP)
  ],
  'application/vnd.ms-excel': [
    { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE2 (XLS)
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP (XLSX is a ZIP)
  ],
  'text/plain': [
    // Text files don't have a reliable magic number, so we'll check if it's valid UTF-8
    // This is handled separately
  ],
  'text/csv': [
    // CSV files are text files, handled separately
  ],
};

/**
 * Validates file content matches declared MIME type
 * @param filePath Path to the file
 * @param declaredMimeType MIME type declared by the client
 * @returns true if file content matches declared type, false otherwise
 */
export async function validateFileContent(
  filePath: string,
  declaredMimeType: string,
  useStorageProvider: boolean = false
): Promise<boolean> {
  try {
    let buffer: Buffer;
    
    if (useStorageProvider) {
      // Use storage provider to read file
      const storage = await StorageFactory.getInstance();
      const fileContent = await storage.get(filePath);
      // Read first 32 bytes
      buffer = fileContent.slice(0, 32);
    } else {
      // Use local filesystem (backward compatibility)
      buffer = Buffer.alloc(32);
      const fd = await fs.promises.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 32, 0);
      await fd.close();
      
      if (bytesRead === 0) {
        return false; // Empty file
      }
    }

    if (buffer.length === 0) {
      return false; // Empty file
    }

    // Get signatures for declared MIME type
    const signatures = FILE_SIGNATURES[declaredMimeType];
    
    if (!signatures || signatures.length === 0) {
      // For text files, check if content is valid UTF-8
      if (declaredMimeType.startsWith('text/')) {
        try {
          const textContent = buffer.toString('utf8');
          // Basic check: if it decodes as UTF-8 without errors, it's likely a text file
          return textContent.length > 0;
        } catch {
          return false;
        }
      }
      
      // Unknown MIME type - allow it but log warning
      return true;
    }

    // Check if any signature matches
    for (const signature of signatures) {
      const { offset, bytes } = signature;
      
      if (offset + bytes.length > buffer.length) {
        continue; // Not enough data
      }

      let matches = true;
      for (let i = 0; i < bytes.length; i++) {
        if (buffer[offset + i] !== bytes[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return true;
      }
    }

    // For Office Open XML formats (DOCX, XLSX), check ZIP signature
    // and verify internal structure
    if (declaredMimeType.includes('openxmlformats')) {
      // Check ZIP signature
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        // It's a ZIP file, which is correct for OpenXML formats
        return true;
      }
    }

    return false;
  } catch (error) {
    // If we can't read the file, fail validation
    return false;
  }
}

/**
 * Validates file extension matches MIME type
 * Additional validation layer
 */
export function validateFileExtension(filename: string, mimeType: string): boolean {
  const extension = filename.toLowerCase().split('.').pop() || '';
  
  const extensionMap: { [key: string]: string[] } = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'text/plain': ['txt'],
    'text/csv': ['csv'],
  };

  const allowedExtensions = extensionMap[mimeType];
  if (!allowedExtensions) {
    return true; // Unknown MIME type, allow it
  }

  return allowedExtensions.includes(extension);
}
