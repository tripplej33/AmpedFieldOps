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

# Detect deployment mode
show_step "Step 0: Deployment Configuration"
echo ""
echo "Choose your deployment mode:"
echo "  1) Local Development (default - Supabase on 127.0.0.1)"
echo "  2) Production (expose services for remote access)"
echo ""
read -p "Enter choice [1]: " DEPLOY_MODE
DEPLOY_MODE=${DEPLOY_MODE:-1}

if [ "$DEPLOY_MODE" = "2" ]; then
    echo -e "${YELLOW}Production mode selected${NC}"
    
    # Auto-detect server IP
    SERVER_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "")
    
    echo ""
    echo "Enter your server's IP address or domain name."
    echo "This will be used for:"
    echo "  - Frontend API calls (VITE_API_URL)"
    echo "  - Supabase API endpoint (VITE_SUPABASE_URL)"
    echo "  - CORS configuration (FRONTEND_URL)"
    echo ""
    if [ -n "$SERVER_IP" ]; then
        echo "Detected IP: $SERVER_IP"
        read -p "Server IP/Domain [$SERVER_IP]: " USER_SERVER
        SERVER_HOST=${USER_SERVER:-$SERVER_IP}
    else
        read -p "Server IP/Domain: " SERVER_HOST
    fi
    
    read -p "Frontend domain (e.g., admin.ampedlogix.com) [$SERVER_HOST]: " FRONTEND_DOMAIN
    FRONTEND_DOMAIN=${FRONTEND_DOMAIN:-$SERVER_HOST}
    
    # Determine protocol
    if [[ "$FRONTEND_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        FRONTEND_URL="http://${FRONTEND_DOMAIN}:3000"
        IS_HTTPS=0
    else
        FRONTEND_URL="https://${FRONTEND_DOMAIN}"
        IS_HTTPS=1
    fi
    
    # CRITICAL: Check for HTTPS mismatch
    if [ "$IS_HTTPS" = "1" ]; then
        echo ""
        echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  IMPORTANT: HTTPS Detected - Security Configuration      ${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Your frontend will be served over HTTPS, but local HTTP services"
        echo "(Supabase, Backend API) are not SSL-encrypted."
        echo ""
        echo "This causes 'Mixed Content' errors - browsers block HTTP requests"
        echo "from HTTPS pages for security reasons."
        echo ""
        echo "You have two options:"
        echo ""
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ Option A: Use Supabase Cloud (Recommended)                 │"
        echo "│  ✓ Everything is HTTPS - no mixed content issues           │"
        echo "│  ✓ No SSL setup needed                                     │"
        echo "│  ✓ Free tier available (perfect for production)            │"
        echo "│  ✓ Handles scaling & backups automatically                 │"
        echo "└─────────────────────────────────────────────────────────────┘"
        echo ""
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ Option B: Use Reverse Proxy (Advanced)                     │"
        echo "│  • nginx/caddy reverse proxy with SSL termination          │"
        echo "│  • Proxies HTTPS → HTTP to local services                  │"
        echo "│  • More complex setup, requires SSL certificates           │"
        echo "│  • Requires manual nginx/caddy configuration               │"
        echo "└─────────────────────────────────────────────────────────────┘"
        echo ""
        read -p "Use Supabase Cloud credentials? [Y/n]: " USE_CLOUD
        USE_CLOUD=${USE_CLOUD:-Y}
        
        if [[ "$USE_CLOUD" =~ ^[Yy]$ ]]; then
            IS_HTTPS=1
            USE_CLOUD=1
        else
            IS_HTTPS=0
            USE_CLOUD=0
            echo ""
            echo -e "${YELLOW}Note: You'll need to set up a reverse proxy for HTTPS to work correctly.${NC}"
            echo "See: docs/PRODUCTION_SETUP.md for reverse proxy configuration."
        fi
    fi
    
    echo -e "${GREEN}✓ Production config: API=${SERVER_HOST}, Frontend=${FRONTEND_URL}${NC}"
else
    echo -e "${GREEN}✓ Local development mode${NC}"
    SERVER_HOST="127.0.0.1"
    FRONTEND_URL="http://localhost:3000"
    DEPLOY_MODE="1"
fi

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
SKIP_LOCAL_SUPABASE=${SKIP_LOCAL_SUPABASE:-0}
USE_CLOUD=${USE_CLOUD:-0}

# If HTTPS + using cloud, skip local supabase entirely
if [ "$DEPLOY_MODE" = "2" ] && [ "$IS_HTTPS" = "1" ] && [ "$USE_CLOUD" = "1" ]; then
    SKIP_LOCAL_SUPABASE=1
    echo ""
    echo -e "${YELLOW}Supabase Cloud mode: Skipping local Supabase startup${NC}"
fi

if command -v supabase &> /dev/null && [ "$SKIP_LOCAL_SUPABASE" != "1" ]; then
    show_step "Step 3: Initializing/Starting Supabase (local)"
    if [ ! -f supabase/config.toml ]; then
        echo -e "${YELLOW}Running 'supabase init'...${NC}"
        supabase init || true
    fi

    echo -e "${YELLOW}Starting Supabase (this may pull containers)...${NC}"
    supabase start || true

    # Try to reliably fetch Supabase keys and wait for Supabase to be healthy
    show_step "Step 3a: Waiting for Supabase to be healthy"
    MAX_RETRIES=60
    RETRY=0
    KEYS_OK=0
    while [ $RETRY -lt $MAX_RETRIES ]; do
        # Prefer helper script if present and executable
        if [ -x ./scripts/fetch_supabase_keys.sh ]; then
            # ensure executable
            chmod +x ./scripts/fetch_supabase_keys.sh || true
            if bash ./scripts/fetch_supabase_keys.sh > /tmp/sb_keys.env 2>/dev/null; then
                # ensure we have values
                if grep -q '^SUPABASE_URL=' /tmp/sb_keys.env && grep -q '^DATABASE_URL=' /tmp/sb_keys.env; then
                    KEYS_OK=1
                    break
                fi
            fi
        else
            # fallback to supabase status parsing using node/python
            if SUPABASE_STATUS=$(supabase status --output json 2>/dev/null); then
                :
            else
                SUPABASE_STATUS=$(supabase status 2>/dev/null || true)
            fi
            if command -v node &> /dev/null && [ -n "$SUPABASE_STATUS" ]; then
                API_URL=$(printf "%s" "$SUPABASE_STATUS" | node -e "try{const s=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(s.project?.api?.url||s.api?.url||'') }catch(e){}") || true
                DB_URL=$(printf "%s" "$SUPABASE_STATUS" | node -e "try{const s=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(s.project?.db?.url||s.db?.url||'') }catch(e){}") || true
                if [ -n "$API_URL" ] && [ -n "$DB_URL" ]; then
                    echo "SUPABASE_URL=$API_URL" > /tmp/sb_keys.env
                    echo "DATABASE_URL=$DB_URL" >> /tmp/sb_keys.env
                    echo "VITE_SUPABASE_URL=$API_URL" >> /tmp/sb_keys.env
                    # do not attempt to extract secrets here; prompt later if missing
                    KEYS_OK=1
                    break
                fi
            fi
        fi

        RETRY=$((RETRY+1))
        sleep 2
    done

    if [ $KEYS_OK -ne 1 ]; then
        echo -e "${YELLOW}Warning: Could not auto-detect Supabase keys after waiting. Using local defaults to avoid prompts.${NC}"
        # Set API URL based on deployment mode
        if [ "$DEPLOY_MODE" = "2" ]; then
            API_URL="http://${SERVER_HOST}:54321"
        else
            API_URL="http://127.0.0.1:54321"
        fi
        ANON_KEY_DEFAULT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
        echo "SUPABASE_URL=${API_URL}" > /tmp/sb_keys.env
        # Leave DATABASE_URL untouched if not known; installer won't override existing .env entries
        if grep -q '^DATABASE_URL=' .env; then
            DB_URL=$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d'=' -f2-)
            echo "DATABASE_URL=${DB_URL}" >> /tmp/sb_keys.env
        fi
        echo "SUPABASE_SERVICE_ROLE_KEY=" >> /tmp/sb_keys.env
        echo "VITE_SUPABASE_URL=${API_URL}" >> /tmp/sb_keys.env
        echo "VITE_SUPABASE_ANON_KEY=${ANON_KEY_DEFAULT}" >> /tmp/sb_keys.env
    else
        # If helper provided values, also ensure ANON and SERVICE_ROLE are present; prompt if not
        if ! grep -q '^VITE_SUPABASE_ANON_KEY=' /tmp/sb_keys.env 2>/dev/null; then
            echo "VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" >> /tmp/sb_keys.env
        fi
        if ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=' /tmp/sb_keys.env 2>/dev/null; then
            echo "SUPABASE_SERVICE_ROLE_KEY=" >> /tmp/sb_keys.env
        fi
    fi

    # Merge/replace keys in .env safely
    # Remove existing keys then append values from /tmp/sb_keys.env
    grep -vE '^(SUPABASE_URL|VITE_SUPABASE_URL|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY)=' .env > .env.tmp || cp .env .env.tmp
    cat /tmp/sb_keys.env >> .env.tmp
    mv .env.tmp .env

    # Add production-specific env vars if in production mode
    if [ "$DEPLOY_MODE" = "2" ]; then
        echo -e "${YELLOW}Setting production environment variables...${NC}"
        grep -vE '^(VITE_API_URL|FRONTEND_URL|NODE_ENV)=' .env > .env.tmp || cp .env .env.tmp
        echo "VITE_API_URL=http://${SERVER_HOST}:3001" >> .env.tmp
        echo "FRONTEND_URL=${FRONTEND_URL}" >> .env.tmp
        echo "NODE_ENV=production" >> .env.tmp
        mv .env.tmp .env
        echo -e "${GREEN}✓ Production URLs configured${NC}"
    fi

    # Sync to backend/.env for local backend runtime
    if [ -d backend ]; then
        cp .env backend/.env || true
    fi

    echo -e "${GREEN}✓ Supabase credentials written to .env and backend/.env${NC}"
else
    echo -e "${YELLOW}Skipping Supabase automatic start - Supabase CLI not available.${NC}"
    echo "Please ensure SUPABASE_URL, DATABASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set in .env before proceeding."
    # For local developer convenience, set sensible defaults if missing
    if ! grep -q '^VITE_SUPABASE_URL=' .env 2>/dev/null; then
        echo "VITE_SUPABASE_URL=http://127.0.0.1:54321" >> .env
    fi
    if ! grep -q '^SUPABASE_URL=' .env 2>/dev/null; then
        echo "SUPABASE_URL=http://127.0.0.1:54321" >> .env
    fi
    # Provide local anon key default if not set
    if ! grep -q '^VITE_SUPABASE_ANON_KEY=' .env 2>/dev/null; then
        echo "VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" >> .env
    fi
fi

# Expose Supabase Kong gateway for production if needed
if [ "$DEPLOY_MODE" = "2" ] && command -v supabase &> /dev/null; then
    show_step "Step 3b: Configuring Supabase for Production Access"
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}                 PRODUCTION DEPLOYMENT NOTICE               ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Supabase Local is designed for development and binds to 127.0.0.1."
    echo "For production deployments, you have two recommended options:"
    echo ""
    echo "┌─────────────────────────────────────────────────────────────┐"
    echo "│ Option 1: Supabase Cloud (Recommended)                     │"
    echo "│  • Go to https://supabase.com/dashboard                    │"
    echo "│  • Create a new project (free tier available)              │"
    echo "│  • Get your Project URL and anon key                       │"
    echo "│  • Run this installer again and provide those values       │"
    echo "└─────────────────────────────────────────────────────────────┘"
    echo ""
    echo "┌─────────────────────────────────────────────────────────────┐"
    echo "│ Option 2: Expose Local Supabase (Advanced)                 │"
    echo "│  • Requires manual Docker port remapping                   │"
    echo "│  • Security implications - no SSL, weak default keys       │"
    echo "│  • Not recommended for internet-facing production          │"
    echo "└─────────────────────────────────────────────────────────────┘"
    echo ""
    read -p "Do you have Supabase Cloud credentials? [y/N]: " has_cloud
    
    if [[ "$has_cloud" =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "${YELLOW}Enter your Supabase Cloud credentials:${NC}"
        read -p "Project URL (https://xxx.supabase.co): " CLOUD_URL
        read -p "Anon key (public): " CLOUD_ANON_KEY
        read -p "Service role key (secret): " CLOUD_SERVICE_KEY
        read -p "Database connection URL (postgres://...): " CLOUD_DB_URL
        
        # Override the detected keys with cloud credentials
        echo "SUPABASE_URL=${CLOUD_URL}" > /tmp/sb_keys.env
        echo "VITE_SUPABASE_URL=${CLOUD_URL}" >> /tmp/sb_keys.env
        echo "VITE_SUPABASE_ANON_KEY=${CLOUD_ANON_KEY}" >> /tmp/sb_keys.env
        echo "SUPABASE_SERVICE_ROLE_KEY=${CLOUD_SERVICE_KEY}" >> /tmp/sb_keys.env
        echo "DATABASE_URL=${CLOUD_DB_URL}" >> /tmp/sb_keys.env
        
        echo -e "${GREEN}✓ Supabase Cloud credentials configured${NC}"
        
        # We can skip starting local Supabase
        SKIP_LOCAL_SUPABASE=1
        USE_CLOUD=1
    else
        echo ""
        echo -e "${YELLOW}Continuing with local Supabase (127.0.0.1 only).${NC}"
        echo -e "${YELLOW}Note: This requires a reverse proxy or HTTP frontend for HTTPS.${NC}"
        echo ""
        echo "See PRODUCTION_SETUP.md for reverse proxy configuration (nginx/caddy)."
        echo ""
    fi
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
if command -v tsx &> /dev/null; then
    tsx scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
elif command -v npx &> /dev/null; then
    npx tsx scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
elif command -v npm &> /dev/null; then
    # Prefer installing tsx globally if missing
    if ! command -v tsx &> /dev/null; then
        read -p "Install 'tsx' globally via npm now? (requires npm) [y/N]: " install_tsx
        if [[ "$install_tsx" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Installing tsx via npm...${NC}"
            npm install -g tsx || echo "npm global install failed; you can run 'npx tsx scripts/create-storage-buckets.ts' if npx is available"
        fi
    fi
    if command -v tsx &> /dev/null; then
        tsx scripts/create-storage-buckets.ts || echo "Bucket creation failed or already exists"
    else
        echo -e "${YELLOW}Attempting to run via 'npm exec'...${NC}"
        npm exec -- tsx scripts/create-storage-buckets.ts || echo "Bucket creation failed or tsx not installed"
    fi
else
    echo -e "${YELLOW}Skipping bucket creation: no runner (tsx/npx/npm) available.${NC}"
    echo "To create buckets manually, run: supabase storage create <bucket-name> or install Node.js and tsx (https://nodejs.org) and re-run this installer."
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
