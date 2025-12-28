#!/bin/sh
set -e

echo "🚀 Starting AmpedFieldOps Backend..."

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

