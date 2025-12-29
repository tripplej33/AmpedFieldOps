import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  // Database
  DATABASE_URL: string;
  
  // Auth
  JWT_SECRET: string;
  
  // Server
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  FRONTEND_URL: string;
  BACKEND_URL?: string;
  
  // Xero (optional)
  XERO_CLIENT_ID?: string;
  XERO_CLIENT_SECRET?: string;
  XERO_REDIRECT_URI?: string;
  
  // Email/SMTP (optional)
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
}

function getEnvVar(key: string, required = true, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  
  return value || '';
}

function validateEnv(): EnvConfig {
  // Validate required variables
  const jwtSecret = getEnvVar('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  return {
    DATABASE_URL: getEnvVar('DATABASE_URL'),
    JWT_SECRET: jwtSecret,
    PORT: parseInt(getEnvVar('PORT', false, '3001'), 10),
    NODE_ENV: (getEnvVar('NODE_ENV', false, 'development') as 'development' | 'production' | 'test'),
    FRONTEND_URL: getEnvVar('FRONTEND_URL', false, 'http://localhost:5173'),
    BACKEND_URL: getEnvVar('BACKEND_URL', false),
    XERO_CLIENT_ID: getEnvVar('XERO_CLIENT_ID', false),
    XERO_CLIENT_SECRET: getEnvVar('XERO_CLIENT_SECRET', false),
    XERO_REDIRECT_URI: getEnvVar('XERO_REDIRECT_URI', false),
    SMTP_HOST: getEnvVar('SMTP_HOST', false),
    SMTP_PORT: getEnvVar('SMTP_PORT', false),
    SMTP_USER: getEnvVar('SMTP_USER', false),
    SMTP_PASSWORD: getEnvVar('SMTP_PASSWORD', false),
    SMTP_FROM: getEnvVar('SMTP_FROM', false),
  };
}

// Validate on import
export const env = validateEnv();

