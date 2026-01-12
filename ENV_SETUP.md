# Environment Variables Setup Guide

This document describes the environment variables needed for AmpedFieldOps after the Supabase migration.

## Frontend Environment Variables

Frontend uses Vite, so all environment variables must be prefixed with `VITE_`.

### Required Variables

1. **`VITE_SUPABASE_URL`**
   - **Description:** The URL of your Supabase instance
   - **Local Development:** `http://127.0.0.1:54321`
   - **Production:** Your Supabase instance URL (e.g., `https://your-domain.com` or `http://your-server-ip:8000`)
   - **Default:** `http://127.0.0.1:54321` (fallback in code)

2. **`VITE_SUPABASE_ANON_KEY`** (Optional)
   - **Description:** Supabase anonymous key (public, safe for frontend)
   - **Local Development:** Uses default local key (already in code as fallback)
   - **Production:** Get from Supabase dashboard
   - **Default:** Local Supabase default key (fallback in code)

### Optional Variables

- **`VITE_BASE_PATH`**: Base path for the application (default: `/`)

### Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and set your values:
   ```env
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. Restart your development server for changes to take effect.

## Backend Environment Variables

Backend uses Node.js with dotenv, so no prefix is needed.

### Required Variables

1. **`SUPABASE_URL`**
   - **Description:** The URL of your Supabase instance
   - **Local Development:** `http://127.0.0.1:54321`
   - **Production:** Your Supabase instance URL
   - **Default:** `http://127.0.0.1:54321`

2. **`SUPABASE_SERVICE_ROLE_KEY`**
   - **Description:** Supabase service role key (secret, backend only!)
   - **Local Development:** Get from `supabase status` command
   - **Production:** Get from Supabase dashboard
   - **⚠️ WARNING:** Never expose this in frontend code or commit to git!

3. **`DATABASE_URL`** (Optional but recommended)
   - **Description:** Direct PostgreSQL connection string for database operations
   - **Local Development:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   - **Production:** Get from Supabase dashboard or `supabase status`
   - **Used for:** Database backups, direct SQL queries, migrations
   - **Note:** If not set, backend will try to derive from SUPABASE_URL for local development

### Optional Variables

- **`PORT`**: Backend server port (default: `3001`)
- **`NODE_ENV`**: Environment (default: `development`)
- **`FRONTEND_URL`**: Frontend URL for CORS (default: `http://localhost:5173`)
- **`BACKEND_URL`**: Backend URL (optional)
- **`XERO_CLIENT_ID`**: Xero OAuth client ID
- **`XERO_CLIENT_SECRET`**: Xero OAuth client secret
- **`XERO_REDIRECT_URI`**: Xero OAuth redirect URI
- **`REDIS_HOST`**: Redis host (for job queues)
- **`REDIS_PORT`**: Redis port
- **`REDIS_PASSWORD`**: Redis password
- **`SMTP_HOST`**: SMTP server host
- **`SMTP_PORT`**: SMTP server port
- **`SMTP_USER`**: SMTP username
- **`SMTP_PASSWORD`**: SMTP password
- **`SMTP_FROM`**: SMTP from address
- **`OCR_SERVICE_URL`**: OCR service URL (default: `http://ocr-service:8000`)

### Setup

1. Copy `backend/env.example` to `backend/.env`:
   ```bash
   cd backend
   cp env.example .env
   ```

2. Edit `backend/.env` and set your values:
   ```env
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   ```

3. Get Supabase keys:
   ```bash
   # For local development
   supabase status
   
   # Look for:
   # - API URL: http://127.0.0.1:54321
   # - DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
   # - service_role key: (shown in output)
   ```

## Removed Variables

The following variables are no longer needed after the Supabase migration:

- **`JWT_SECRET`**: Supabase handles JWT generation
- **`DATABASE_URL`**: Still used for direct DB access, but can be derived from Supabase

> Security note: The codebase includes a local `JWT_SECRET` fallback to ease
> bootstrapping during development. This fallback is intended for local use
> only. For any production deployment, set an explicit `JWT_SECRET` (min 32
> chars) in your backend `.env` and never commit it to source control. Also
> ensure `SUPABASE_SERVICE_ROLE_KEY` remains backend-only and is not exposed
> to frontend builds.

## Production Setup

For production (self-hosted Supabase):

1. **Frontend:**
   ```env
   VITE_SUPABASE_URL=https://your-domain.com
   VITE_SUPABASE_ANON_KEY=your-production-anon-key
   ```

2. **Backend:**
   ```env
   SUPABASE_URL=https://your-domain.com
   SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
   DATABASE_URL=postgresql://postgres:password@your-db-host:5432/postgres
   ```

## Security Notes

1. **Never commit `.env` or `.env.local` files to git**
2. **Service Role Key is secret** - only use in backend, never in frontend
3. **Anon Key is public** - safe for frontend, but still use RLS policies
4. **Use different keys for development and production**

## Getting Supabase Keys

### Local Development

```bash
# Start Supabase
supabase start

# Get status and keys
supabase status

# Output includes:
# API URL: http://127.0.0.1:54321
# DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
# service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Production (Self-Hosted)

1. Access your Supabase dashboard
2. Navigate to Settings → API
3. Copy the API URL and keys
4. For database URL, check your Supabase configuration or use the connection pooling URL
