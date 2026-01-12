#!/usr/bin/env bash

# AmpedFieldOps Installation Script (Supabase + Docker)
# ================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_step() {
    echo ""
    echo -e "${YELLOW}$1${NC}"
    echo "----------------------------------------"
}

echo -e "${GREEN}Starting AmpedFieldOps installer (Supabase-enabled)${NC}"

# Check for Docker
show_step "Step 1: Checking Prerequisites"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}Warning: Supabase CLI not found. Please install it:${NC}"
    echo "  https://supabase.com/docs/guides/cli"
    echo "Continuing without Supabase CLI will require manual Supabase setup."
fi

if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo -e "${GREEN}✓ Prerequisites check complete${NC}"

# Prepare .env
show_step "Step 2: Configuring Environment"

if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env 2>/dev/null || true
    echo -e "${GREEN}✓ .env file created from .env.example${NC}"
else
    echo -e "${YELLOW}Using existing .env file${NC}"
fi

# Supabase init & start
if command -v supabase &> /dev/null; then
    show_step "Step 3: Initializing/Starting Supabase (local)"
    if [ ! -f supabase/config.toml ]; then
        echo -e "${YELLOW}Running 'supabase init'...${NC}"
        supabase init || true
    fi

    echo -e "${YELLOW}Starting Supabase (this may pull containers)...${NC}"
    supabase start || true

    # Try to extract credentials from supabase status (JSON preferred)
    SUPABASE_STATUS=""
    if SUPABASE_STATUS=$(supabase status --output json 2>/dev/null); then
        : # got JSON in SUPABASE_STATUS
    else
        SUPABASE_STATUS=$(supabase status 2>/dev/null || true)
    fi

    # Parse with python if possible
    if command -v python3 &> /dev/null && [ -n "$SUPABASE_STATUS" ]; then
        API_URL=$(printf "%s" "$SUPABASE_STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('api',{}).get('url','')) if isinstance(d,dict) else print('')" 2>/dev/null || true)
        DB_URL=$(printf "%s" "$SUPABASE_STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('db',{}).get('url','')) if isinstance(d,dict) else print('')" 2>/dev/null || true)
        SERVICE_ROLE_KEY=$(printf "%s" "$SUPABASE_STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('secrets',{}).get('service_role','')) if isinstance(d,dict) else print('')" 2>/dev/null || true)
        ANON_KEY=$(printf "%s" "$SUPABASE_STATUS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('secrets',{}).get('anon','')) if isinstance(d,dict) else print('')" 2>/dev/null || true)
    fi

    # Prompt for any missing values
    if [ -z "${API_URL:-}" ]; then
        read -p "Supabase API URL (e.g. http://127.0.0.1:54321): " API_URL
    fi
    if [ -z "${DB_URL:-}" ]; then
        read -p "Database URL (Postgres) from Supabase (DATABASE_URL): " DB_URL
    fi
    if [ -z "${SERVICE_ROLE_KEY:-}" ]; then
        read -p "Supabase service_role key (SUPABASE_SERVICE_ROLE_KEY): " SERVICE_ROLE_KEY
    fi
    if [ -z "${ANON_KEY:-}" ]; then
        read -p "Supabase anon key for frontend (VITE_SUPABASE_ANON_KEY): " ANON_KEY
    fi

    # Persist into .env
    sed -i.bak \
        -e "s|SUPABASE_URL=.*|SUPABASE_URL=${API_URL}|g" \
        -e "s|DATABASE_URL=.*|DATABASE_URL=${DB_URL}|g" \
        -e "s|SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}|g" \
        -e "s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=${ANON_KEY}|g" .env 2>/dev/null || true

    echo -e "${GREEN}✓ Supabase credentials written to .env${NC}"
else
    echo -e "${YELLOW}Skipping Supabase automatic start - Supabase CLI not available.${NC}"
    echo "Please ensure SUPABASE_URL, DATABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set in .env before proceeding."
fi

# Create uploads directories
show_step "Step 4: Creating Directories"
mkdir -p backend/uploads/logos
echo -e "${GREEN}✓ Directories created${NC}"

# Build and start other services (backend, frontend, ocr)
show_step "Step 5: Building and Starting Docker Containers"
echo -e "${YELLOW}Building and starting containers (backend, frontend, ocr)...${NC}"
$COMPOSE_CMD up -d --build

# Run Supabase migrations if possible
if command -v supabase &> /dev/null; then
    show_step "Step 6: Running Supabase Migrations"
    if supabase migration status 2>/dev/null; then
        echo -e "${YELLOW}Applying Supabase migrations...${NC}"
        supabase migration run || echo "supabase migration run failed or no migrations to run"
    else
        echo -e "${YELLOW}No Supabase migrations detected or command unavailable.${NC}"
    fi
else
    echo -e "${YELLOW}Skipping migrations: Supabase CLI not available.${NC}"
fi

# Create storage buckets using project script
show_step "Step 7: Creating Storage Buckets"
if command -v npx &> /dev/null; then
    npx ts-node scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
else
    echo -e "${YELLOW}Skipping bucket creation: npx/ts-node not available.${NC}"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                     ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Access AmpedFieldOps frontend at: ${GREEN}http://localhost:3000${NC}"
echo -e "API endpoint: ${GREEN}http://localhost:3001${NC}"
echo ""
echo -e "${YELLOW}Supabase Studio (local):${NC} http://127.0.0.1:54323"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:    $COMPOSE_CMD logs -f"
echo "  Stop:         $COMPOSE_CMD down"
echo "  Restart:      $COMPOSE_CMD restart"
echo "  Supabase CLI: supabase status | supabase stop | supabase start"
echo ""
