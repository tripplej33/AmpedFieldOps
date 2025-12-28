# Docker Setup Guide

## Prerequisites

1. **Install Docker Desktop** (if not already installed):
   - Windows: Download from https://www.docker.com/products/docker-desktop/
   - Make sure Docker Desktop is running before proceeding

2. **Verify Docker Installation**:
   ```powershell
   docker --version
   docker compose version
   ```

## Quick Start

### 1. Create Environment File

A `.env` file has been created with secure random secrets. You can edit it if needed:

```env
DB_PASSWORD=changeme123
JWT_SECRET=your-super-secret-jwt-key-change-in-production
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001
```

### 2. Build and Start Containers

```powershell
# Build and start all services
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
- **PostgreSQL**: localhost:5432

### 5. Stop Containers

```powershell
# Stop all containers
docker compose down

# Stop and remove volumes (clears database)
docker compose down -v
```

## Troubleshooting

### Database Connection Issues

If the backend can't connect to the database:

1. Check if PostgreSQL container is running:
   ```powershell
   docker compose ps
   ```

2. Check PostgreSQL logs:
   ```powershell
   docker compose logs postgres
   ```

3. Verify database credentials in `.env` match `docker-compose.yml`

### Backend Migration Issues

The backend automatically runs migrations on startup. If migrations fail:

1. Check backend logs:
   ```powershell
   docker compose logs backend
   ```

2. Manually run migrations:
   ```powershell
   docker compose exec backend npm run migrate
   ```

3. Run fresh migration (WARNING: deletes all data):
   ```powershell
   docker compose exec backend npm run migrate -- --fresh
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
   netstat -ano | findstr :5432
   ```

2. Change ports in `docker-compose.yml`:
   ```yaml
   ports:
     - "3002:3001"  # Change external port
   ```

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

The `.env` file contains:
- `DB_PASSWORD`: PostgreSQL password
- `JWT_SECRET`: JWT signing secret (must be 32+ characters)
- `FRONTEND_URL`: Frontend URL for CORS
- `API_URL`: Backend API URL
- `XERO_CLIENT_ID`: Xero OAuth client ID (optional)
- `XERO_CLIENT_SECRET`: Xero OAuth secret (optional)

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

