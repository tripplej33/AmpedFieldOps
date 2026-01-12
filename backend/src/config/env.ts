import dotenv from 'dotenv';
import { AUTH_CONSTANTS } from '../lib/constants';

// Load .env file, suppressing parsing warnings (non-critical)
// Warnings about unparseable lines are usually from comments or optional config
dotenv.config({ 
  debug: false,
  override: false 
});

interface EnvConfig {
  // Database (PostgreSQL connection string)
  // For Supabase: Use the direct PostgreSQL connection string from Supabase
  // Local: postgresql://postgres:postgres@127.0.0.1:54322/postgres
  // Production: Get from Supabase dashboard or supabase status
  DATABASE_URL?: string;
  
  // Supabase (required)
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  
  // Server
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  FRONTEND_URL: string;
  BACKEND_URL?: string;
  
  // Xero (optional)
  XERO_CLIENT_ID?: string;
  XERO_CLIENT_SECRET?: string;
  XERO_REDIRECT_URI?: string;
  
  // Redis (optional)
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  REDIS_PASSWORD?: string;
  
  // Email/SMTP (optional)
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  
  // OCR Service (optional)
  OCR_SERVICE_URL?: string;
  JWT_SECRET?: string;
}

function getEnvVar(key: string, required = true, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  
  return value || '';
}

function validateEnv(): EnvConfig {
  // Try to derive DATABASE_URL from Supabase if not provided
  const supabaseUrl = getEnvVar('SUPABASE_URL', false, 'http://127.0.0.1:54321');
  let databaseUrl = getEnvVar('DATABASE_URL', false);
  
  // If DATABASE_URL not provided, try to derive from Supabase URL
  // For local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres
  if (!databaseUrl && supabaseUrl.includes('127.0.0.1:54321')) {
    databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  }
  
  return {
    DATABASE_URL: databaseUrl,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    PORT: parseInt(getEnvVar('PORT', false, '3001'), 10),
    NODE_ENV: (getEnvVar('NODE_ENV', false, 'development') as 'development' | 'production' | 'test'),
    FRONTEND_URL: getEnvVar('FRONTEND_URL', false, 'http://localhost:5173'),
    BACKEND_URL: getEnvVar('BACKEND_URL', false),
    XERO_CLIENT_ID: getEnvVar('XERO_CLIENT_ID', false),
    XERO_CLIENT_SECRET: getEnvVar('XERO_CLIENT_SECRET', false),
    XERO_REDIRECT_URI: getEnvVar('XERO_REDIRECT_URI', false),
    REDIS_HOST: getEnvVar('REDIS_HOST', false),
    REDIS_PORT: getEnvVar('REDIS_PORT', false),
    REDIS_PASSWORD: getEnvVar('REDIS_PASSWORD', false),
    SMTP_HOST: getEnvVar('SMTP_HOST', false),
    SMTP_PORT: getEnvVar('SMTP_PORT', false),
    SMTP_USER: getEnvVar('SMTP_USER', false),
    SMTP_PASSWORD: getEnvVar('SMTP_PASSWORD', false),
    SMTP_FROM: getEnvVar('SMTP_FROM', false),
    OCR_SERVICE_URL: getEnvVar('OCR_SERVICE_URL', false, 'http://ocr-service:8000'),
      JWT_SECRET: getEnvVar('JWT_SECRET', false),
  };
}

// Validate on import
export const env = validateEnv();

