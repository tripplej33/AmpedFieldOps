# Docker Setup Guide (Supabase Stack)

## Prerequisites

1. Install Docker (or Docker Desktop on Windows/macOS)
2. Verify installation:

```bash
docker --version
docker compose version
```

## Quick Start

### 1) Environment Variables

Use the root `.env`. Key variables:

```env
# Frontend
VITE_API_URL=
VITE_SUPABASE_URL=http://supabase.ampedlogix.com:54321   # https in production with valid cert
VITE_SUPABASE_ANON_KEY=<anon key>

# Backend
SUPABASE_URL=http://127.0.0.1:54321                      # or http://host.docker.internal:54321 from containers
SUPABASE_SERVICE_ROLE_KEY=<service role key>
JWT_SECRET=<32+ chars>
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 2) Build and Start Containers

```bash
# Build and start all services
docker compose up --build -d

# Tail logs (optional)
docker compose logs -f
```

### 3) Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Supabase (Kong): http://localhost:54321 (browser should use supabase.ampedlogix.com in production)

### 4) Stop Containers

```bash
docker compose down
# Remove volumes (clears Supabase data)
docker compose down -v
```

## Rebuilds and Deployments

### Rebuild Frontend Bundle

```bash
# Build locally (uses VITE_* baked at build time)
docker run --rm -v "$PWD":/workspace -w /workspace node:20 npm ci
docker run --rm -v "$PWD":/workspace -w /workspace node:20 npm run build

# Deploy into nginx container
docker exec ampedfieldops-web rm -rf /usr/share/nginx/html/assets
docker cp dist/. ampedfieldops-web:/usr/share/nginx/html/
```

### Apply Backend Source Changes

```bash
# Copy updated files into container
docker cp backend/src/routes/setup.ts ampedfieldops-api:/app/src/routes/setup.ts
docker cp backend/src/config/env.ts ampedfieldops-api:/app/src/config/env.ts
docker cp backend/tsconfig.json ampedfieldops-api:/app/tsconfig.json

# Rebuild dist & restart
docker exec ampedfieldops-api sh -c "cd /app && npm run build"
docker restart ampedfieldops-api
```

## Troubleshooting

### Supabase Connectivity

```bash
# Check containers
docker ps --format '{{.Names}} {{.Status}}'

# Check Supabase Kong logs
docker compose logs -f supabase_kong_AmpedFieldOps
```

- Verify `.env` has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- If you see `net::ERR_CERT_COMMON_NAME_INVALID` in the browser for `auth/v1/token`, use HTTP for dev (`VITE_SUPABASE_URL=http://supabase.ampedlogix.com:54321`) or install a valid certificate for the subdomain and rebuild the frontend.

### Frontend Not Loading

```bash
docker compose ps ampedfieldops-web
docker compose logs -f ampedfieldops-web
```

- Frontend static files are served by nginx in `ampedfieldops-web`.
- Check browser console for API/Supabase errors (mixed content, cert issues).

### Backend Build Issues

```bash
docker compose logs -f ampedfieldops-api
```

- Ensure `tsconfig.json` exists in `/app` before running `npm run build`.
- Rebuild `/app/dist` after copying source; then restart the container.

## First-Time Setup

1. Access http://localhost:3000
2. If no admin exists, the Login page shows the Admin Setup modal
3. Create the first admin (handled via Supabase Auth)
4. On subsequent loads, the modal stays hidden (`/api/setup/default-admin-status` returns true)

## Production Considerations

1. Use a valid certificate for `supabase.ampedlogix.com` (or wildcard `*.ampedlogix.com`)
2. Set `VITE_SUPABASE_URL` to `https://supabase.ampedlogix.com` and rebuild the frontend
3. Keep `VITE_API_URL` empty; proxy `/api/*` to backend via nginx
4. Rotate all secrets and store securely
5. Monitor container health and logs

