import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeProjectId } from './validateProject';

/**
 * Validates UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Create project-specific storage
const projectStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Get project_id from request body or params
      const rawProjectId = req.body?.project_id || req.params?.project_id;
      
      if (!rawProjectId) {
        return cb(new Error('project_id is required'), '');
      }

      // Sanitize and validate project_id to prevent path traversal
      const projectId = sanitizeProjectId(rawProjectId);
      
      // Use path.resolve and path.join to prevent directory traversal
      const baseDir = path.resolve(__dirname, '../../uploads/projects');
      const projectDir = path.join(baseDir, projectId);
      
      // Ensure the resolved path is still within the base directory
      const resolvedPath = path.resolve(projectDir);
      if (!resolvedPath.startsWith(path.resolve(baseDir))) {
        return cb(new Error('Invalid project_id: path traversal detected'), '');
      }
      
      // Ensure directory exists
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      
      cb(null, projectDir);
    } catch (error: any) {
      cb(new Error(`Invalid project_id: ${error.message}`), '');
    }
  },
  filename: (req, file, cb) => {
    // Sanitize file extension
    const ext = path.extname(file.originalname).toLowerCase();
    // Only allow safe extensions
    const safeExt = /^\.(jpg|jpeg|png|gif|webp|pdf)$/i.test(ext) ? ext : '.bin';
    cb(null, `${uuidv4()}${safeExt}`);
  }
});

// Keep general storage for non-project uploads (logos, etc.)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

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
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Project-specific upload for timesheet images
export const projectUpload = multer({
  storage: projectStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

export const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../../uploads/logos'));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `logo-${Date.now()}${ext}`);
    }
  }),
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
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../../uploads/logos'));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      // Always save as favicon.ico or favicon.png for easier reference
      const isIco = ext.toLowerCase() === '.ico';
      cb(null, isIco ? 'favicon.ico' : `favicon-${Date.now()}${ext}`);
    }
  }),
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

// Temporary storage for file uploads (we'll move files after we have project_id)
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use a temporary directory - we'll move the file after validation
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Sanitize file extension
    const ext = path.extname(file.originalname).toLowerCase();
    // Allow safe extensions for documents
    const safeExt = /^\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|csv)$/i.test(ext) ? ext : '.bin';
    cb(null, `${uuidv4()}${safeExt}`);
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
// Uses temporary storage, then files are moved to correct location after project_id validation
export const fileUpload = multer({
  storage: tempStorage,
  fileFilter: fileUploadFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});
