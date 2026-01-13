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
    echo -e "${YELLOW}Warning: Supabase CLI not found.${NC}"
    if command -v npm &> /dev/null; then
        read -p "Install Supabase CLI globally via npm now? (requires npm) [y/N]: " install_supabase
        if [[ "$install_supabase" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Installing supabase CLI via npm...${NC}"
            npm install -g supabase || echo "npm global install failed; please install supabase manually: https://supabase.com/docs/guides/cli"
        else
            echo "Supabase CLI not installed. See: https://supabase.com/docs/guides/cli"
        fi
    else
        echo "Please install the Supabase CLI: https://supabase.com/docs/guides/cli"
        echo "Continuing without Supabase CLI will require manual Supabase setup."
    fi
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
    supabase start --no-telemetry || true

    show_step "Step 3a: Fetching Supabase keys"
    SCRIPTS_DIR=$(dirname "$0")/scripts
    mkdir -p /tmp
    if bash "$SCRIPTS_DIR"/fetch_supabase_keys_fixed.sh > /tmp/sb_keys.env 2>/dev/null; then
        echo "Fetched Supabase keys to /tmp/sb_keys.env"
    else
        echo -e "${YELLOW}Could not fetch Supabase keys automatically. Falling back to prompting for values.${NC}"
        read -p "Supabase API URL (e.g. http://127.0.0.1:54321): " API_URL
        read -p "Database URL (Postgres) from Supabase (DATABASE_URL): " DB_URL
        read -p "Supabase service_role key (SUPABASE_SERVICE_ROLE_KEY): " SERVICE_ROLE_KEY
        read -p "Supabase anon key for frontend (VITE_SUPABASE_ANON_KEY): " ANON_KEY
        echo "SUPABASE_URL=${API_URL}" > /tmp/sb_keys.env
        echo "DATABASE_URL=${DB_URL}" >> /tmp/sb_keys.env
        echo "SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}" >> /tmp/sb_keys.env
        echo "VITE_SUPABASE_ANON_KEY=${ANON_KEY}" >> /tmp/sb_keys.env
    fi

    # Backup existing .env
    if [ -f .env ]; then
        cp .env .env.bak || true
    fi

    # Merge/replace keys in .env safely
    grep -vE '^(SUPABASE_URL|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY)=' .env > .env.tmp || cp .env .env.tmp
    cat /tmp/sb_keys.env >> .env.tmp
    mv .env.tmp .env

    # If SUPABASE_URL or DATABASE_URL point to 127.0.0.1, rewrite host to docker gateway
    SUPABASE_URL_VAL=$(grep '^SUPABASE_URL=' .env | cut -d= -f2- || true)
    DATABASE_URL_VAL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- || true)
    if echo "$DATABASE_URL_VAL" | grep -q "127.0.0.1" || echo "$SUPABASE_URL_VAL" | grep -q "127.0.0.1"; then
        DOCKER_GW=$(ip route | awk '/default/ {print $3}' || true)
        if [ -n "$DOCKER_GW" ]; then
            echo "Rewriting 127.0.0.1 in Supabase URLs to Docker gateway: $DOCKER_GW"
            sed -i "s/127.0.0.1/$DOCKER_GW/g" .env || true
        fi
    fi

    # Sync to backend/.env for local backend runtime
    if [ -d backend ]; then
        cp .env backend/.env || true
    fi

    echo -e "${GREEN}✓ Supabase credentials written to .env and backend/.env${NC}"
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
        supabase migration up --yes || echo "supabase migration up failed or no migrations to run"
    else
        echo -e "${YELLOW}No Supabase migrations detected or command unavailable.${NC}"
    fi
else
    echo -e "${YELLOW}Skipping migrations: Supabase CLI not available.${NC}"
fi

# Create storage buckets using project script
show_step "Step 7: Creating Storage Buckets"
SCRIPTS_DIR=$(dirname "$0")/scripts
    if [ -f "$SCRIPTS_DIR/run-tsx-in-docker.sh" ]; then
    echo "Running bucket creation via dockerized tsx runner"
    export SUPABASE_URL=$(grep '^SUPABASE_URL=' .env | cut -d= -f2- || true)
    export SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2- || true)
    export VITE_SUPABASE_ANON_KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2- || true)
    bash "$SCRIPTS_DIR"/run-tsx-in-docker.sh scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
    echo "Running initial admin creation (idempotent)"
    bash "$SCRIPTS_DIR"/run-tsx-in-docker.sh scripts/supabase-admin.ts || echo "Admin creation failed or skipped"
else
    echo -e "${YELLOW}No dockerized tsx runner found; falling back to host-based runners if available.${NC}"
    if command -v tsx &> /dev/null; then
        tsx scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
    elif command -v npx &> /dev/null; then
        npx tsx scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
    else
        echo -e "${YELLOW}Skipping bucket creation: no runner (tsx/npx) available.${NC}"
        echo "To create buckets manually, run: supabase storage create <bucket-name> or install Node.js and tsx and re-run this installer."
    fi
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
