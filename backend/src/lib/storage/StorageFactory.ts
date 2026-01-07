import { query } from '../../db';
import { IStorageProvider } from './IStorageProvider';
import { StorageConfig } from './types';
import { FlystorageStorageProvider } from './FlystorageStorageProvider';
import { GoogleDriveStorageProvider } from './GoogleDriveStorageProvider';
import { log } from '../logger';

let storageInstance: IStorageProvider | null = null;
let configCache: StorageConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get storage configuration from database settings
 */
async function getStorageConfigFromDB(): Promise<StorageConfig> {
  try {
    const result = await query(
      `SELECT key, value FROM settings 
       WHERE user_id IS NULL 
       AND key IN ('storage_driver', 'storage_base_path', 'storage_s3_bucket', 'storage_s3_region', 'storage_s3_access_key_id', 'storage_s3_secret_access_key', 'storage_s3_endpoint', 'storage_google_drive_folder_id')`
    );

    const settings: Record<string, string> = {};
    result.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });

    const driver = (settings.storage_driver || 'local') as 'local' | 's3' | 'google-drive';
    const config: StorageConfig = {
      driver,
      basePath: settings.storage_base_path || 'uploads',
    };

    if (driver === 's3') {
      config.s3Bucket = settings.storage_s3_bucket;
      config.s3Region = settings.storage_s3_region || 'us-east-1';
      config.s3AccessKeyId = settings.storage_s3_access_key_id;
      config.s3SecretAccessKey = settings.storage_s3_secret_access_key;
      config.s3Endpoint = settings.storage_s3_endpoint || undefined;
    } else if (driver === 'google-drive') {
      config.googleDriveFolderId = settings.storage_google_drive_folder_id || undefined;
    }

    return config;
  } catch (error) {
    log.error('Failed to load storage config from database', error);
    // Fallback to local storage
    return {
      driver: 'local',
      basePath: 'uploads',
    };
  }
}

/**
 * Decrypt sensitive setting value (if encryption is implemented)
 * For now, returns as-is. Can be enhanced with encryption later.
 */
function decryptSetting(value: string | null): string | null {
  if (!value) return null;
  // TODO: Implement decryption if secret access keys are encrypted
  return value;
}

/**
 * Create storage provider instance from configuration
 */
function createStorageProvider(config: StorageConfig): IStorageProvider {
  if (config.driver === 'google-drive') {
    return new GoogleDriveStorageProvider(config);
  }
  return new FlystorageStorageProvider(config);
}

/**
 * Storage Factory - Singleton pattern with cache invalidation
 * 
 * Reads storage configuration from database settings table and
 * creates appropriate storage provider instance.
 */
export class StorageFactory {
  /**
   * Get storage provider instance (singleton)
   * Caches instance for 1 minute to avoid repeated DB queries
   */
  static async getInstance(): Promise<IStorageProvider> {
    const now = Date.now();
    
    // Check if cache is still valid
    if (storageInstance && configCache && (now - cacheTimestamp) < CACHE_TTL) {
      return storageInstance;
    }

    // Load config from database
    const config = await getStorageConfigFromDB();
    
    // Decrypt sensitive values
    if (config.s3SecretAccessKey) {
      config.s3SecretAccessKey = decryptSetting(config.s3SecretAccessKey) || '';
    }

    // Check if config changed
    const configChanged = !configCache || 
      configCache.driver !== config.driver ||
      configCache.basePath !== config.basePath ||
      configCache.s3Bucket !== config.s3Bucket ||
      configCache.s3Region !== config.s3Region ||
      configCache.s3AccessKeyId !== config.s3AccessKeyId ||
      configCache.s3SecretAccessKey !== config.s3SecretAccessKey ||
      configCache.s3Endpoint !== config.s3Endpoint ||
      configCache.googleDriveFolderId !== config.googleDriveFolderId;

    // Create new instance if config changed or instance doesn't exist
    if (!storageInstance || configChanged) {
      storageInstance = createStorageProvider(config);
      configCache = { ...config }; // Deep copy for comparison
      cacheTimestamp = now;
    }

    return storageInstance;
  }

  /**
   * Invalidate cache (call when settings are updated)
   */
  static invalidateCache(): void {
    storageInstance = null;
    configCache = null;
    cacheTimestamp = 0;
  }

  /**
   * Create temporary storage provider for testing (doesn't use cache)
   */
  static async createTestInstance(config: StorageConfig): Promise<IStorageProvider> {
    if (config.s3SecretAccessKey) {
      config.s3SecretAccessKey = decryptSetting(config.s3SecretAccessKey) || '';
    }
    return createStorageProvider(config);
  }
}
