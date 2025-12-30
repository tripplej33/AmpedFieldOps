import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Create project-specific storage
const projectStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get project_id from request body or params
    const projectId = req.body?.project_id || req.params?.project_id || 'general';
    
    // Create project-specific directory
    const projectDir = path.join(__dirname, '../../uploads/projects', projectId);
    
    // Ensure directory exists
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    
    cb(null, projectDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
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

// File upload storage for project files with organized directory structure
const fileUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.body?.project_id || 'general';
    const costCenterId = req.body?.cost_center_id;
    
    // Create directory: uploads/projects/{project_id}/files/
    let uploadDir = path.join(__dirname, '../../uploads/projects', projectId, 'files');
    
    // If cost center is specified, add it to the path
    if (costCenterId) {
      uploadDir = path.join(uploadDir, costCenterId);
    }
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
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
export const fileUpload = multer({
  storage: fileUploadStorage,
  fileFilter: fileUploadFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});
