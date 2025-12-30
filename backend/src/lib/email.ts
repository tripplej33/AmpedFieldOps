import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { query } from '../db';

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;
let cachedSettings: {
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from?: string;
} | null = null;

// Cache settings for 5 minutes
let settingsCacheTime = 0;
const SETTINGS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getEmailSettings(): Promise<{
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from?: string;
}> {
  // Return cached settings if still valid
  if (cachedSettings && Date.now() - settingsCacheTime < SETTINGS_CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    // Get email settings from database (global settings only)
    const result = await query(
      `SELECT key, value FROM settings 
       WHERE user_id IS NULL 
       AND key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from')`
    );

    const settings: Record<string, string> = {};
    result.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });

    // Cache the settings
    cachedSettings = {
      smtp_host: settings.smtp_host,
      smtp_port: settings.smtp_port,
      smtp_user: settings.smtp_user,
      smtp_password: settings.smtp_password,
      smtp_from: settings.smtp_from,
    };
    settingsCacheTime = Date.now();

    return cachedSettings;
  } catch (error) {
    console.error('[Email] Failed to load settings from database:', error);
    // Return empty object on error, will fall back to env vars
    return {};
  }
}

// Clear settings cache (call this when settings are updated)
export function clearEmailSettingsCache() {
  cachedSettings = null;
  settingsCacheTime = 0;
  // Also clear transporter so it gets recreated with new settings
  transporter = null;
}

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  // Return cached transporter if available
  if (transporter) {
    return transporter;
  }

  // Get settings from database first, then fall back to env vars
  const dbSettings = await getEmailSettings();
  
  const smtpHost = dbSettings.smtp_host || process.env.SMTP_HOST;
  const smtpPort = dbSettings.smtp_port || process.env.SMTP_PORT;
  const smtpUser = dbSettings.smtp_user || process.env.SMTP_USER;
  const smtpPassword = dbSettings.smtp_password || process.env.SMTP_PASSWORD;
  const smtpFrom = dbSettings.smtp_from || process.env.SMTP_FROM || smtpUser || 'noreply@ampedfieldops.com';

  // If no SMTP configured, return null (emails will be logged only)
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    console.warn('[Email] SMTP not configured. Emails will be logged to console only.');
    console.warn('[Email] Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM to enable email sending.');
    return null;
  }

  // Create transporter
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort, 10),
    secure: parseInt(smtpPort, 10) === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
    // For development/testing with services like Mailtrap
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  return transporter;
}

export async function sendPasswordResetEmail(email: string, resetToken: string, userName?: string): Promise<boolean> {
  const resetUrl = `${env.FRONTEND_URL}/forgot-password?token=${resetToken}`;
  const subject = 'Password Reset Request';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        .code { background-color: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello${userName ? ` ${userName}` : ''},</p>
          <p>We received a request to reset your password for your AmpedFieldOps account.</p>
          <p>Click the button below to reset your password:</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <div class="code">${resetUrl}</div>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from AmpedFieldOps. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Password Reset Request

Hello${userName ? ` ${userName}` : ''},

We received a request to reset your password for your AmpedFieldOps account.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

This is an automated message from AmpedFieldOps.
  `;

  // Get current settings to determine "from" address
  const dbSettings = await getEmailSettings();
  const smtpFrom = dbSettings.smtp_from || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@ampedfieldops.com';

  const mailOptions = {
    from: smtpFrom,
    to: email,
    subject: subject,
    text: text,
    html: html,
  };

  const emailTransporter = await getTransporter();

  if (!emailTransporter) {
    // Log email details instead of sending
    console.log('\n=== PASSWORD RESET EMAIL (NOT SENT - SMTP NOT CONFIGURED) ===');
    console.log('To:', email);
    console.log('Subject:', subject);
    console.log('Reset URL:', resetUrl);
    console.log('Reset Token:', resetToken);
    console.log('===============================================================\n');
    return false;
  }

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[Email] Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send password reset email:', error);
    // Log email details as fallback
    console.log('\n=== PASSWORD RESET EMAIL (FAILED TO SEND) ===');
    console.log('To:', email);
    console.log('Subject:', subject);
    console.log('Reset URL:', resetUrl);
    console.log('Reset Token:', resetToken);
    console.log('===============================================\n');
    return false;
  }
}

// Verify email configuration
export async function verifyEmailConfig(): Promise<boolean> {
  const emailTransporter = await getTransporter();
  if (!emailTransporter) {
    return false;
  }

  try {
    await emailTransporter.verify();
    console.log('[Email] SMTP configuration verified successfully');
    return true;
  } catch (error) {
    console.error('[Email] SMTP configuration verification failed:', error);
    return false;
  }
}

// Send test email
export async function sendTestEmail(to: string): Promise<boolean> {
  const subject = 'Test Email from AmpedFieldOps';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Test Email</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>This is a test email from your AmpedFieldOps system.</p>
          <p>If you received this email, your SMTP configuration is working correctly!</p>
        </div>
        <div class="footer">
          <p>This is an automated test message from AmpedFieldOps.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Test Email

Hello,

This is a test email from your AmpedFieldOps system.

If you received this email, your SMTP configuration is working correctly!

This is an automated test message from AmpedFieldOps.
  `;

  const dbSettings = await getEmailSettings();
  const smtpFrom = dbSettings.smtp_from || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@ampedfieldops.com';

  const mailOptions = {
    from: smtpFrom,
    to: to,
    subject: subject,
    text: text,
    html: html,
  };

  const emailTransporter = await getTransporter();

  if (!emailTransporter) {
    throw new Error('SMTP not configured. Please configure email settings in the Settings page.');
  }

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[Email] Test email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send test email:', error);
    throw error;
  }
}

// Generic email sending function
export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const dbSettings = await getEmailSettings();
  const smtpFrom = dbSettings.smtp_from || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@ampedfieldops.com';

  const mailOptions = {
    from: smtpFrom,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html || options.text,
  };

  const emailTransporter = await getTransporter();

  if (!emailTransporter) {
    // Log email details instead of sending
    console.log('\n=== EMAIL (NOT SENT - SMTP NOT CONFIGURED) ===');
    console.log('To:', options.to);
    console.log('Subject:', options.subject);
    console.log('Body:', options.text);
    console.log('================================================\n');
    return false;
  }

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[Email] Email sent to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
    return false;
  }
}

