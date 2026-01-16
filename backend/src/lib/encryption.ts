import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Encryption utility for sensitive data storage
 * Uses AES-256-GCM for authenticated encryption
 */

// Get encryption key from environment or generate a warning
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || env.JWT_SECRET;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set for data encryption');
  }
  
  // Create a 32-byte key from the provided secret using SHA-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string value
 * @param text Plain text to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all hex-encoded)
 */
export function encrypt(text: string): string {
  if (!text) return text;
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // Initialization vector
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt a string value
 * @param encryptedText Encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText;
  
  // If the text doesn't contain colons, it might be unencrypted (legacy data)
  if (!encryptedText.includes(':')) {
    // Return as-is for backwards compatibility
    return encryptedText;
  }
  
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, authTagHex, encryptedData] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a value is encrypted
 * @param value String to check
 * @returns true if value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  
  // Check for our encryption format: hex:hex:hex
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  
  // Check if all parts are valid hex strings
  const hexRegex = /^[0-9a-fA-F]+$/;
  return parts.every(part => hexRegex.test(part) && part.length > 0);
}

/**
 * Safely decrypt a value (returns original if not encrypted or on error)
 * Use this for backwards compatibility with existing unencrypted data
 */
export function safeDecrypt(value: string): string {
  if (!value) return value;
  
  if (!isEncrypted(value)) {
    return value;
  }
  
  try {
    return decrypt(value);
  } catch (error) {
    // Log error but return original value to prevent breaking existing functionality
    console.error('Failed to decrypt value, returning as-is:', error);
    return value;
  }
}
