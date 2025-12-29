# Email Configuration Guide

AmpedFieldOps uses **nodemailer** to send emails (like password reset emails). You need to configure SMTP settings to enable email sending.

## Quick Setup Options

### Option 1: Gmail (Free, Easy Setup)

1. **Enable 2-Step Verification** on your Google account
2. **Generate an App Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. **Add to your `.env` file**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-app-password-here
   SMTP_FROM=your-email@gmail.com
   ```

### Option 2: SendGrid (Recommended for Production)

1. **Sign up** at [SendGrid](https://sendgrid.com/) (free tier: 100 emails/day)
2. **Create an API Key**:
   - Settings → API Keys → Create API Key
   - Give it "Mail Send" permissions
3. **Add to your `.env` file**:
   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASSWORD=your-sendgrid-api-key-here
   SMTP_FROM=noreply@yourdomain.com
   ```

### Option 3: Mailgun (Good for Production)

1. **Sign up** at [Mailgun](https://www.mailgun.com/) (free tier: 5,000 emails/month)
2. **Get SMTP credentials** from your Mailgun dashboard
3. **Add to your `.env` file**:
   ```env
   SMTP_HOST=smtp.mailgun.org
   SMTP_PORT=587
   SMTP_USER=your-mailgun-username
   SMTP_PASSWORD=your-mailgun-password
   SMTP_FROM=noreply@yourdomain.com
   ```

### Option 4: AWS SES (Best for High Volume)

1. **Set up AWS SES** in your AWS account
2. **Verify your email/domain**
3. **Get SMTP credentials** from AWS SES console
4. **Add to your `.env` file**:
   ```env
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=your-ses-smtp-username
   SMTP_PASSWORD=your-ses-smtp-password
   SMTP_FROM=noreply@yourdomain.com
   ```

### Option 5: Mailtrap (Testing/Development)

1. **Sign up** at [Mailtrap](https://mailtrap.io/) (free tier available)
2. **Get SMTP credentials** from your inbox
3. **Add to your `.env` file**:
   ```env
   SMTP_HOST=smtp.mailtrap.io
   SMTP_PORT=2525
   SMTP_USER=your-mailtrap-username
   SMTP_PASSWORD=your-mailtrap-password
   SMTP_FROM=noreply@test.com
   ```

## Configuration

Add these variables to your `.env` file (or `docker-compose.yml` environment section):

```env
# Email/SMTP Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password-or-api-key
SMTP_FROM=noreply@yourdomain.com
```

### Port Numbers:
- **587**: Standard SMTP port (TLS/STARTTLS) - Recommended
- **465**: SSL/TLS SMTP port
- **25**: Legacy SMTP port (often blocked by ISPs)

## Testing

After configuring SMTP, restart your backend:

```bash
docker-compose restart backend
```

Check the logs to see if email configuration is verified:
```bash
docker-compose logs backend | grep Email
```

You should see: `[Email] SMTP configuration verified successfully`

## Without Email Configuration

If SMTP is not configured, password reset tokens will be:
- **Logged to the server console/logs** (for development/testing)
- **Not sent via email**

This allows the forgot password feature to work in development, but you'll need to check server logs to get the reset token.

## Security Notes

- **Never commit** `.env` files with real credentials to git
- Use **App Passwords** for Gmail (not your regular password)
- For production, use a dedicated email service (SendGrid, Mailgun, AWS SES)
- Verify your sending domain to avoid emails going to spam

