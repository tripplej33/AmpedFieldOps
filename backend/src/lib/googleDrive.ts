import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { query } from '../db';
import dotenv from 'dotenv';
dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

// Get OAuth2 client
function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/backups/google-drive/callback`
  );
}

// Get stored Google Drive tokens from database
export async function getStoredTokens(): Promise<{ access_token?: string; refresh_token?: string; expiry_date?: number } | null> {
  try {
    const result = await query(
      "SELECT value FROM settings WHERE key = 'google_drive_tokens'"
    );

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].value || '{}');
  } catch (error) {
    console.error('Failed to get stored Google Drive tokens:', error);
    return null;
  }
}

// Store Google Drive tokens in database
export async function storeTokens(tokens: any, userId?: string): Promise<void> {
  try {
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type
    };

    await query(
      `INSERT INTO settings (key, value, user_id)
       VALUES ('google_drive_tokens', $1, $2)
       ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(tokenData), userId || null]
    );
  } catch (error) {
    console.error('Failed to store Google Drive tokens:', error);
    throw error;
  }
}

// Get authorized OAuth2 client
export async function getAuthorizedClient(userId?: string): Promise<OAuth2Client | null> {
  const oauth2Client = getOAuth2Client();
  const tokens = await getStoredTokens();

  if (!tokens || !tokens.access_token) {
    return null;
  }

  oauth2Client.setCredentials(tokens);

  // Check if token needs refresh
  if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
    if (tokens.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await storeTokens(credentials, userId);
        oauth2Client.setCredentials(credentials);
      } catch (error) {
        console.error('Failed to refresh Google Drive token:', error);
        return null;
      }
    } else {
      return null;
    }
  }

  return oauth2Client;
}

// Get Google Drive OAuth URL
export function getAuthUrl(state?: string): string {
  const oauth2Client = getOAuth2Client();
  
  const scopes = [
    'https://www.googleapis.com/auth/drive.file' // Access to files created by the app
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: state || ''
  });
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string, userId?: string): Promise<any> {
  const oauth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    await storeTokens(tokens, userId);
    return tokens;
  } catch (error: any) {
    console.error('Failed to exchange code for tokens:', error);
    throw new Error(`Failed to exchange authorization code: ${error.message}`);
  }
}

// Upload file to Google Drive
export async function uploadToGoogleDrive(
  filePath: string,
  fileName: string,
  userId?: string
): Promise<string> {
  const auth = await getAuthorizedClient(userId);
  if (!auth) {
    throw new Error('Google Drive not authorized. Please connect your Google account.');
  }

  const drive = google.drive({ version: 'v3', auth });

  // Check if backup folder exists, create if not
  let folderId = await findOrCreateBackupFolder(auth);

  const fileMetadata = {
    name: fileName,
    parents: folderId ? [folderId] : undefined
  };

  const media = {
    mimeType: 'application/gzip',
    body: createReadStream(filePath)
  };

  try {
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, size'
    });

    return response.data.id || '';
  } catch (error: any) {
    console.error('Failed to upload to Google Drive:', error);
    throw new Error(`Failed to upload to Google Drive: ${error.message}`);
  }
}

// Find or create backup folder in Google Drive
async function findOrCreateBackupFolder(auth: OAuth2Client): Promise<string | null> {
  const drive = google.drive({ version: 'v3', auth });
  const folderName = 'AmpedFieldOps Backups';

  try {
    // Search for existing folder
    const response = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id || null;
    }

    // Create folder if it doesn't exist
    const folderResponse = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });

    return folderResponse.data.id || null;
  } catch (error: any) {
    console.error('Failed to find or create backup folder:', error);
    return null; // Continue without folder organization
  }
}

// Delete file from Google Drive
export async function deleteFromGoogleDrive(fileId: string, userId?: string): Promise<void> {
  const auth = await getAuthorizedClient(userId);
  if (!auth) {
    throw new Error('Google Drive not authorized');
  }

  const drive = google.drive({ version: 'v3', auth });

  try {
    await drive.files.delete({ fileId });
  } catch (error: any) {
    console.error('Failed to delete from Google Drive:', error);
    throw new Error(`Failed to delete from Google Drive: ${error.message}`);
  }
}

// Download file from Google Drive
export async function downloadFromGoogleDrive(
  fileId: string,
  outputPath: string,
  userId?: string
): Promise<void> {
  const auth = await getAuthorizedClient(userId);
  if (!auth) {
    throw new Error('Google Drive not authorized');
  }

  const drive = google.drive({ version: 'v3', auth });

  try {
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    const writeStream = createWriteStream(outputPath);
    response.data.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      response.data.on('error', reject);
    });
  } catch (error: any) {
    console.error('Failed to download from Google Drive:', error);
    throw new Error(`Failed to download from Google Drive: ${error.message}`);
  }
}

// Check if Google Drive is connected
export async function isGoogleDriveConnected(): Promise<boolean> {
  const tokens = await getStoredTokens();
  return !!(tokens && tokens.access_token);
}

