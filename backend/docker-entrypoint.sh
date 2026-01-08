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
until pg_isready -h postgres -U ampedfieldops -d ampedfieldops; do
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
exec node dist/server.js

