#!/bin/bash

# AmpedFieldOps Installation Script (Docker)
# ==========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Spinner function that runs in background while command executes
run_with_spinner() {
    local message=$1
    shift
    local command="$@"
    
    # Start spinner in background
    local spinstr='|/-\'
    local spinner_pid
    (
        while true; do
            for i in ${spinstr}; do
                printf "\r${CYAN}[${i}]${NC} ${YELLOW}${message}${NC}"
                sleep 0.1
            done
        done
    ) &
    spinner_pid=$!
    
    # Run the command and capture output
    local exit_code=0
    eval "$command" || exit_code=$?
    
    # Stop spinner
    kill $spinner_pid 2>/dev/null
    wait $spinner_pid 2>/dev/null
    
    # Clear spinner line and show result
    printf "\r${GREEN}[✓]${NC} ${message}${NC}\n"
    
    return $exit_code
}

# Simple step header
show_step() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           AmpedFieldOps Installation Script               ║"
echo "║        Electrical Contracting Service Management          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Docker
show_step "Step 1: Checking Prerequisites"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"

# Create .env file if it doesn't exist
show_step "Step 2: Configuring Environment"

if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env 2>/dev/null || true
    
    # Generate secure JWT secret (alphanumeric only to avoid sed issues)
    echo -e "${YELLOW}Generating secure secrets...${NC}"
    JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 32)
    sed -i "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|" .env 2>/dev/null || \
    sed -i '' "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|" .env
    
    # Generate secure DB password
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 16)
    sed -i "s|changeme123|$DB_PASSWORD|g" .env 2>/dev/null || \
    sed -i '' "s|changeme123|$DB_PASSWORD|g" .env
    
    echo -e "${GREEN}✓ .env file created with secure secrets${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi

echo ""
echo -e "${YELLOW}Network Configuration${NC}"
echo "---------------------"
echo "If accessing from another machine (e.g., running in a VM/LXC),"
echo "enter the server's IP address. Otherwise press Enter for localhost."
echo ""
read -p "Server IP address [localhost]: " SERVER_IP
SERVER_IP=${SERVER_IP:-localhost}

# Update .env with server IP
if [ "$SERVER_IP" != "localhost" ]; then
    sed -i "s|VITE_API_URL=http://localhost:3001|VITE_API_URL=http://$SERVER_IP:3001|" .env
    sed -i "s|FRONTEND_URL=http://localhost:3000|FRONTEND_URL=http://$SERVER_IP:3000|" .env
    sed -i "s|FRONTEND_URL=http://localhost:5173|FRONTEND_URL=http://$SERVER_IP:3000|" .env
    echo -e "${GREEN}✓ Configured for remote access at $SERVER_IP${NC}"
fi

# Use docker compose or docker-compose depending on what's available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Create uploads directories
show_step "Step 3: Creating Directories"
echo -e "${YELLOW}Creating upload directories...${NC}"
mkdir -p backend/uploads/logos
echo -e "${GREEN}✓ Directories created${NC}"

# Start Docker containers
show_step "Step 4: Building and Starting Docker Containers"
echo -e "${YELLOW}This may take a few minutes...${NC}"
echo ""

run_with_spinner "Building Docker images..." "$COMPOSE_CMD up -d --build"

# Wait for PostgreSQL to be ready
show_step "Step 5: Waiting for PostgreSQL"
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 3

MAX_RETRIES=30
RETRY_COUNT=0
until $COMPOSE_CMD exec -T postgres pg_isready -U ampedfieldops -d ampedfieldops > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}Error: PostgreSQL failed to start${NC}"
        exit 1
    fi
    printf "\r${YELLOW}Waiting for PostgreSQL... (${RETRY_COUNT}/${MAX_RETRIES})${NC}"
    sleep 2
done
printf "\r${GREEN}✓ PostgreSQL is ready${NC}\n"

# Run migrations
show_step "Step 6: Running Database Migrations"
echo -e "${YELLOW}Running database migrations...${NC}"
$COMPOSE_CMD exec -T backend node dist/db/migrate.js
echo -e "${GREEN}✓ Migrations completed${NC}"

# Run seeds
show_step "Step 7: Seeding Default Data"
echo -e "${YELLOW}Seeding default data...${NC}"
$COMPOSE_CMD exec -T backend node dist/db/seed.js
echo -e "${GREEN}✓ Default data seeded (including admin user)${NC}"

# Mark setup as complete
show_step "Step 8: Completing Setup"
echo -e "${YELLOW}Completing setup...${NC}"
sleep 2
curl -s -X POST http://localhost:3001/api/setup/complete > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Setup marked complete${NC}"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                     ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Access AmpedFieldOps at: ${GREEN}http://$SERVER_IP:3000${NC}"
echo -e "API endpoint: ${GREEN}http://$SERVER_IP:3001${NC}"
echo ""
echo -e "${YELLOW}Default Admin Login:${NC}"
echo -e "  Email: ${YELLOW}admin@ampedfieldops.com${NC}"
echo -e "  Password: ${YELLOW}admin123${NC}"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Please change the admin password immediately after first login!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Open http://$SERVER_IP:3000 in your browser"
echo "  2. Log in with the default credentials above"
echo "  3. Change your password in Settings > Profile"
echo "  4. Configure Xero integration in Settings (optional)"
echo "  5. Add your first client and project"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:    $COMPOSE_CMD logs -f"
echo "  Stop:         $COMPOSE_CMD down"
echo "  Restart:      $COMPOSE_CMD restart"
echo ""
