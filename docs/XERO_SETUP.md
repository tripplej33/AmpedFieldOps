# Xero Integration Setup Guide

## Prerequisites
- A Xero account
- Access to [Xero Developer Portal](https://developer.xero.com/myapps)

## Step 1: Create a Xero App

1. Go to https://developer.xero.com/myapps
2. Click **New App**
3. Fill in the details:
   - **App Name**: AmpedFieldPro (or your business name)
   - **Company/Organization**: Your company name
   - **Integration Type**: Web app

## Step 2: Configure OAuth 2.0 Redirect URI

This is **critical** - Xero will reject any redirect URI that's not pre-configured.

### For Local Development:
```
http://localhost:5173/api/xero/callback
```

### For Production/Deployed App (with reverse proxy):
```
https://admin.ampedlogix.com/api/xero/callback
```

**Important:** If you're using a reverse proxy (nginx) that routes `/api` requests to the backend, use your **frontend domain** with `/api/xero/callback` path.

**How to add:**
1. In your Xero app dashboard, go to **Configuration**
2. Find **OAuth 2.0 redirect URIs**
3. Click **Add redirect URI**
4. Paste the exact URL above
5. Click **Save**

## Step 3: Get Your Credentials

From your Xero app page, copy:
- **Client ID** (looks like: `A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6`)
- **Client Secret** (click **Generate a secret** if you don't have one)

## Step 4: Add Credentials to AmpedFieldPro

### Option 1: Via Settings Page (Recommended)
1. Open AmpedFieldPro
2. Go to **Settings** page
3. Scroll to **Xero Integration**
4. Paste your **Client ID** and **Client Secret**
5. The redirect URI will be displayed - make sure it matches what you added in Xero
6. Click **Connect to Xero**
7. A popup will open - authorize the app
8. Done! Your contacts will sync automatically

### Option 2: Via Environment Variables
1. Copy `.env.example` to `.env`
2. Add your credentials:
```env
XERO_CLIENT_ID=your_client_id_here
XERO_CLIENT_SECRET=your_client_secret_here
XERO_REDIRECT_URI=http://localhost:3001/api/xero/callback
```
3. Restart the backend server

## Step 5: Test the Connection

1. In Settings, click **Connect to Xero**
2. Authorize the app in the popup
3. You should see "Connected to Xero" status
4. Try pulling contacts: Click **Pull from Xero**

## Troubleshooting

### Error: "unauthorized_client" or "Unknown client"
- **Cause**: Client ID or Client Secret is incorrect
- **Fix**: Double-check your credentials in the Xero app dashboard

### Error: "redirect_uri_mismatch"
- **Cause**: The redirect URI in your Xero app doesn't match the one being sent
- **Fix**: 
  1. Check the redirect URI shown in Settings
  2. Go to your Xero app → Configuration → OAuth 2.0 redirect URIs
  3. Make sure the exact URL is added (including http/https, domain, and path)
  4. Click Save

### Popup Blocked
- **Cause**: Browser is blocking popups
- **Fix**: 
  1. Look for the popup blocker icon in your address bar
  2. Click "Always allow popups from this site"
  3. Try connecting again

### Token Expired
- **Cause**: Xero tokens expire after 30 minutes
- **Fix**: The app will automatically refresh tokens, but if it fails, just click **Connect to Xero** again

## Features

### Contact Sync
- **Pull from Xero**: Imports all customers from Xero as clients
- **Push to Xero**: Sends new clients to Xero as contacts
- Bidirectional sync keeps both systems in sync

### Invoice Creation
- Create invoices in AmpedFieldPro
- Automatically synced to Xero
- Line items map to Xero invoice lines

### Field Mapping
| AmpedFieldPro | Xero Contact Field |
|---|---|
| Client Name | Name |
| Contact Name | FirstName + LastName |
| Email | EmailAddress |
| Phone | Phones[0].PhoneNumber |
| Address | Addresses[0].AddressLine1 |
| Billing Address | Addresses[1].AddressLine1 |

## Security Notes

- **Never commit credentials to git**: Always use environment variables
- **Use HTTPS in production**: HTTP is only for local development
- **Rotate secrets regularly**: Generate new client secrets periodically
- **Limit permissions**: Only grant the OAuth scopes your app needs

## Support

For Xero API issues:
- [Xero Developer Documentation](https://developer.xero.com/documentation)
- [Xero Developer Community](https://community.xero.com/developer/)

For AmpedFieldPro issues:
- Check the application logs in the browser console
- Check the backend logs for API errors
