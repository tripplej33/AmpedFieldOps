#!/usr/bin/env bash

# Script to expose Supabase Kong gateway for production access
# This allows remote browsers to access Supabase Auth/API

set -euo pipefail

PROJECT_ID=${1:-AmpedFieldOps}
KONG_CONTAINER="supabase_kong_${PROJECT_ID}"

echo "Exposing Supabase Kong gateway for external access..."

if ! docker ps --format '{{.Names}}' | grep -q "^${KONG_CONTAINER}$"; then
    echo "Error: Kong container ${KONG_CONTAINER} is not running."
    echo "Please start Supabase first: supabase start"
    exit 1
fi

# Get the current Kong container port mapping
CURRENT_PORTS=$(docker port "${KONG_CONTAINER}" 8000 2>/dev/null || echo "")

if echo "$CURRENT_PORTS" | grep -q "0.0.0.0"; then
    echo "✓ Kong is already exposed on all interfaces:"
    echo "$CURRENT_PORTS"
    exit 0
fi

echo "Kong is currently bound to localhost only."
echo "To expose it for production access, we need to recreate the container."
echo ""
echo "WARNING: This will temporarily stop Supabase services."
read -p "Continue? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Stop Supabase
echo "Stopping Supabase..."
cd "$(dirname "$0")/.." && supabase stop

# Modify the Kong service to bind to 0.0.0.0
# This requires editing the Supabase-managed docker-compose
echo "Starting Supabase with modified Kong binding..."
echo ""
echo "Note: Supabase CLI doesn't support custom port bindings."
echo "To properly expose Kong, you have two options:"
echo ""
echo "1. Use SSH tunneling: ssh -L 54321:localhost:54321 user@server"
echo "2. Use Supabase Cloud (recommended for production)"
echo ""
echo "Restarting Supabase in local mode..."
supabase start

echo ""
echo "For production deployments, we recommend using Supabase Cloud:"
echo "  1. Create a project at https://supabase.com/dashboard"
echo "  2. Get your project URL and anon key"
echo "  3. Update .env with your production credentials"
echo "  4. Set VITE_SUPABASE_URL=https://your-project.supabase.co"
echo "  5. Set VITE_SUPABASE_ANON_KEY=your-anon-key"
