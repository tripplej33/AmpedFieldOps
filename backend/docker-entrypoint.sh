#!/bin/sh
set -e

echo "🚀 Starting AmpedFieldOps Backend..."

# Fix permissions for mounted volumes if running as root
# This handles cases where the host directory has wrong permissions
if [ "$(id -u)" = "0" ]; then
  echo "🔧 Fixing permissions for mounted volumes..."
  # Get the node user's UID/GID from the image (typically 1000)
  NODE_UID=${NODE_UID:-1000}
  NODE_GID=${NODE_GID:-1000}
  
  # Create node user if it doesn't exist
  if ! id -u node >/dev/null 2>&1; then
    addgroup -g "$NODE_GID" node 2>/dev/null || true
    adduser -D -u "$NODE_UID" -G node node 2>/dev/null || true
  fi
  
  # Fix permissions for uploads directory (if mounted)
  if [ -d "/app/uploads" ]; then
    chown -R node:node /app/uploads 2>/dev/null || echo "⚠️  Could not fix /app/uploads permissions (may need manual fix on host)"
    chmod -R 755 /app/uploads 2>/dev/null || true
  fi
  
  # Fix permissions for backups and logs directories
  [ -d "/app/backups" ] && chown -R node:node /app/backups 2>/dev/null || true
  [ -d "/app/logs" ] && chown -R node:node /app/logs 2>/dev/null || true
  
  # Switch to node user for the rest of the script
  exec su-exec node "$0" "$@"
fi

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
# If DATABASE_URL is provided, parse host, port, user, and db from it
if [ -n "${DATABASE_URL:-}" ]; then
  # Expected format: postgresql://user:pass@host:port/dbname
  PG_HOST=$(printf "%s" "$DATABASE_URL" | sed -n 's;.*@\([^:/]*\):\([0-9]*\)/.*;\1;p')
  PG_PORT=$(printf "%s" "$DATABASE_URL" | sed -n 's;.*@[^:]*:\([0-9]*\)/.*;\1;p')
  PG_USER=$(printf "%s" "$DATABASE_URL" | sed -n 's;.*//\([^:/]*\):.*@.*;\1;p')
  PG_DB=$(printf "%s" "$DATABASE_URL" | sed -n 's;.*/\([^/?#]*\).*;\1;p')
fi

# Fallbacks
: ${PG_HOST:=postgres}
: ${PG_PORT:=5432}
: ${PG_USER:=ampedfieldops}
: ${PG_DB:=ampedfieldops}

echo "Waiting for PostgreSQL at ${PG_HOST}:${PG_PORT} (db=${PG_DB}, user=${PG_USER})"
while true; do
  if pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    echo "✅ PostgreSQL is ready at $PG_HOST:$PG_PORT"
    break
  fi
  # Try localhost (useful when container uses host network)
  if pg_isready -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    echo "✅ PostgreSQL is reachable via 127.0.0.1:$PG_PORT; switching host"
    PG_HOST=127.0.0.1
    break
  fi
  # Try docker gateway IP as a fallback
  DOCKER_GW=$(ip route | awk '/default/ {print $3}' || true)
  if [ -n "$DOCKER_GW" ] && pg_isready -h "$DOCKER_GW" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    echo "✅ PostgreSQL is reachable via Docker gateway $DOCKER_GW:$PG_PORT; switching host"
    PG_HOST=$DOCKER_GW
    break
  fi
  sleep 1
done
echo "✅ PostgreSQL is ready"

# Run migrations
echo "🔄 Running database migrations..."
npx tsx src/db/migrate.ts || echo "⚠️  Migration failed or already run"

# Run seeds (only if tables are empty)
echo "🌱 Seeding database..."
npx tsx src/db/seed.ts || echo "⚠️  Seed failed or already run"

# Start the application
echo "🎯 Starting API server..."

# If REDIS_HOST cannot be resolved (e.g., backend running with host networking),
# attempt fallbacks so the app can connect to Redis.
if [ -n "${REDIS_HOST:-}" ]; then
  if ! getent hosts "$REDIS_HOST" >/dev/null 2>&1; then
    echo "⚠️  Could not resolve REDIS host '$REDIS_HOST' — attempting fallbacks"
    # Try localhost
    if nc -z 127.0.0.1 6379 >/dev/null 2>&1; then
      export REDIS_HOST=127.0.0.1
      echo "➡️  Falling back to REDIS_HOST=127.0.0.1"
    else
      # Try docker0 gateway
      DGW=$(ip -4 addr show docker0 2>/dev/null | grep -oP '(?<=inet\s)\d+(?:\.\d+){3}' | head -n1 || true)
      if [ -n "$DGW" ] && nc -z "$DGW" 6379 >/dev/null 2>&1; then
        export REDIS_HOST=$DGW
        echo "➡️  Falling back to REDIS_HOST=$DGW"
      else
        echo "⚠️  No reachable Redis host found; continuing with REDIS_HOST=$REDIS_HOST (may fail)"
      fi
    fi
  fi
fi

exec node dist/server.js

