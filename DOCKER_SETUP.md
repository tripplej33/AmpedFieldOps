# Docker Setup Guide

## Prerequisites

1. **Install Docker Desktop** (if not already installed):
   - Windows: Download from https://www.docker.com/products/docker-desktop/
   - Make sure Docker Desktop is running before proceeding

2. **(Optional) Install Supabase CLI** for local Supabase instances and easier key extraction:
   - https://supabase.com/docs/guides/cli
   - Useful commands: `supabase init`, `supabase start`, `supabase status`

3. **Verify Docker Installation**:
   ```powershell
   docker --version
   docker compose version
   ```

## Quick Start

### 1. Create Environment File

An `.env` file will be created by `install.sh` (or copy from `.env.example`). Edit if needed to add Supabase keys:

```env
# Example .env entries (edit with your Supabase values)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001
```

### 2. Build and Start Containers

If using the Supabase CLI locally you can start Supabase first (optional):

```powershell
# Start local Supabase (optional)
supabase start

# Build and start the application services
docker compose up --build

# Or run in detached mode (background)
docker compose up --build -d
```

### 3. View Logs

```powershell
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Supabase Studio (local)**: http://127.0.0.1:54323

### 5. Stop Containers

```powershell
# Stop all containers
docker compose down

# Stop and remove volumes (clears database)
docker compose down -v
```


### Troubleshooting

### Database / Supabase Connection Issues

If the backend can't connect to Supabase or the database:

1. If using local Supabase, check Supabase status:
   ```powershell
   supabase status
   ```

2. Check containers' status and logs:
   ```powershell
   docker compose ps
   docker compose logs -f backend
   ```

3. If you need direct DB access, get the `DATABASE_URL` from `supabase status` and use `psql` or `pg_dump` as needed.

### Backend Migration Issues

The backend attempts to run migrations on startup. If migrations fail:

1. Check backend logs:
   ```powershell
   docker compose logs backend
   ```

2. If using Supabase CLI, prefer `supabase migration run` for Supabase-managed migrations:
   ```powershell
   supabase migration run
   ```

3. Or run legacy migrations via the backend container:
   ```powershell
   docker compose exec backend npm run migrate
   docker compose exec backend npm run seed
   ```

### Frontend Not Loading

1. Check if frontend container is running:
   ```powershell
   docker compose ps frontend
   ```

2. Check frontend logs:
   ```powershell
   docker compose logs frontend
   ```

3. Verify nginx is proxying correctly:
   - Frontend should proxy `/api/*` to backend
   - Check browser console for API errors

### Port Already in Use

If you get "port already in use" errors:

1. Check what's using the ports:
   ```powershell
   netstat -ano | findstr :3000
   netstat -ano | findstr :3001
   netstat -ano | findstr :54323  # Supabase Studio
   ```

2. Change ports in `.env` or `docker-compose.yml` if required.

### Rebuild After Code Changes

```powershell
# Rebuild and restart
docker compose up --build

# Or rebuild specific service
docker compose build backend
docker compose up backend
```

## Development Workflow

### Making Code Changes

1. Make your code changes
2. Rebuild the affected service:
   ```powershell
   docker compose build backend
   docker compose up backend
   ```

### Accessing Container Shells

```powershell
# Backend shell
docker compose exec backend sh

# PostgreSQL shell
docker compose exec postgres psql -U ampedfieldops -d ampedfieldops
```

### Viewing Database

```powershell
# Connect to PostgreSQL
docker compose exec postgres psql -U ampedfieldops -d ampedfieldops

# List tables
\dt

# Query users
SELECT * FROM users;
```

## Environment Variables

The `.env` file should include Supabase-related values and server settings. Key entries:
- `SUPABASE_URL` - e.g. `http://127.0.0.1:54321`
- `SUPABASE_SERVICE_ROLE_KEY` - secret, backend only
- `DATABASE_URL` - optional direct Postgres connection string (used for backups/migrations)
- `VITE_SUPABASE_ANON_KEY` - frontend anon key
- `FRONTEND_URL` - frontend URL for CORS
- `API_URL` - backend API URL

## First-Time Setup

After starting containers for the first time:

1. Wait for migrations to complete (check backend logs)
2. Access http://localhost:3000
3. Complete the setup wizard to create your admin account
4. Start using the application!

## Production Considerations

For production deployment:

1. Change all default passwords and secrets
2. Use strong JWT_SECRET (32+ characters)
3. Set proper CORS origins in `FRONTEND_URL`
4. Use environment-specific database credentials
5. Enable SSL/TLS for database connections
6. Set up proper backup strategy for PostgreSQL volumes

