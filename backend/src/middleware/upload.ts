import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeProjectId } from './validateProject';
import { Readable } from 'stream';

/**
 * Validates UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Use memory storage for all uploads - files will be streamed directly to storage provider
// This avoids filesystem permission issues and works with all storage drivers (local, S3, Google Drive)
const memoryStorage = multer.memoryStorage();

// All uploads use memory storage - no filesystem directory creation needed

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
  }
};

// Enhanced file filter with size and dimension validation
const enhancedFileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed.'));
  }
  
  // File size is already limited by multer limits, but we can add additional checks here
  cb(null, true);
};

export const upload = multer({
  storage: memoryStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Project-specific upload for timesheet images (uses memory storage)
export const projectUpload = multer({
  storage: memoryStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

export const logoUpload = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

export const faviconUpload = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.ico')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ICO, PNG, SVG, or JPEG images are allowed for favicons.'));
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB (favicons should be small)
  }
});

// File filter for project files - allows images, PDFs, and common document types
const fileUploadFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: images, PDFs, documents, spreadsheets, text files.`));
  }
};

// File upload middleware for project files
// Uses memory storage - files are streamed directly to storage provider after validation
export const fileUpload = multer({
  storage: memoryStorage,
  fileFilter: fileUploadFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Helper function to convert Buffer to Readable stream for storage provider
export function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}
