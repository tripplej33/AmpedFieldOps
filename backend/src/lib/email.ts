import nodemailer from 'nodemailer';
import { env } from '../config/env';

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  // Return cached transporter if available
  if (transporter) {
    return transporter;
  }

  // Check if email is configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || 'noreply@ampedfieldops.com';

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

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@ampedfieldops.com',
    to: email,
    subject: subject,
    text: text,
    html: html,
  };

  const emailTransporter = getTransporter();

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
  const emailTransporter = getTransporter();
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

