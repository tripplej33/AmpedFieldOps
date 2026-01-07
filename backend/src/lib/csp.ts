import { StorageFactory } from './storage/StorageFactory';
import { log } from './logger';

/**
 * Generate Content-Security-Policy header based on storage configuration
 * 
 * When S3 is used, we need to allow S3 bucket domains in CSP to prevent
 * browser blocking of images/files loaded from S3.
 */
export async function generateCSPDirective(): Promise<string> {
  try {
    const storage = await StorageFactory.getInstance();
    const driver = storage.getDriver();
    
    // Base CSP directives
    let csp = "default-src 'self';";
    csp += " style-src 'self' 'unsafe-inline';"; // Allow inline styles for React
    csp += " script-src 'self';";
    csp += " connect-src 'self';";
    csp += " font-src 'self';";
    csp += " object-src 'none';";
    csp += " frame-src 'none';";
    
    // Image sources
    csp += " img-src 'self' data: https:;";
    
    // Media sources
    csp += " media-src 'self';";
    
    // If using S3, add S3 domains to CSP
    if (driver === 's3') {
      try {
        // Get S3 configuration to determine domain
        // For now, we'll use wildcard patterns that cover most S3 setups
        // In production, you might want to read the actual bucket/region from settings
        csp += " img-src 'self' data: https: https://*.s3.amazonaws.com https://*.s3.*.amazonaws.com https://*.s3-*.amazonaws.com;";
        csp += " media-src 'self' https://*.s3.amazonaws.com https://*.s3.*.amazonaws.com https://*.s3-*.amazonaws.com;";
        csp += " object-src 'self' https://*.s3.amazonaws.com https://*.s3.*.amazonaws.com https://*.s3-*.amazonaws.com;";
      } catch (error) {
        log.error('Failed to get S3 config for CSP', error);
        // Fallback to wildcard S3 patterns
        csp += " img-src 'self' data: https: https://*.s3.amazonaws.com https://*.s3.*.amazonaws.com;";
        csp += " media-src 'self' https://*.s3.amazonaws.com https://*.s3.*.amazonaws.com;";
      }
    }
    
    return csp;
  } catch (error) {
    log.error('Failed to generate CSP directive', error);
    // Return safe default CSP
    return "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:;";
  }
}

/**
 * Extract S3 domain from configuration
 * Helper function to get exact S3 domain for CSP
 */
export function extractS3Domain(bucket?: string, region?: string, endpoint?: string): string {
  if (endpoint) {
    // Custom endpoint (MinIO, DigitalOcean Spaces, etc.)
    try {
      const url = new URL(endpoint);
      return `${url.protocol}//${url.hostname}`;
    } catch {
      return endpoint;
    }
  }
  
  if (bucket && region) {
    // Standard AWS S3: https://bucket.s3.region.amazonaws.com
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }
  
  // Fallback to wildcard patterns
  return 'https://*.s3.amazonaws.com https://*.s3.*.amazonaws.com';
}
