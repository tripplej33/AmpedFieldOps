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

# Progress bar function
show_progress() {
    local current=$1
    local total=$2
    local message=$3
    local percent=$((current * 100 / total))
    local filled=$((percent / 2))
    local empty=$((50 - filled))
    
    # Build progress bar
    local bar=""
    for ((i=0; i<filled; i++)); do
        bar="${bar}█"
    done
    for ((i=0; i<empty; i++)); do
        bar="${bar}░"
    done
    
    # Print progress bar
    printf "\r${CYAN}[${bar}] ${percent}%%${NC} - ${YELLOW}${message}${NC}"
    
    if [ $current -eq $total ]; then
        echo "" # New line when complete
    fi
}

# Spinner function for indeterminate progress
show_spinner() {
    local pid=$1
    local message=$2
    local spinstr='|/-\'
    
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf "\r${CYAN}[${spinstr:0:1}]${NC} ${YELLOW}${message}${NC}"
        spinstr=$temp${spinstr%"$temp"}
        sleep 0.1
    done
    printf "\r${GREEN}[✓]${NC} ${message}${NC}"
    echo ""
}

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           AmpedFieldOps Installation Script               ║"
echo "║        Electrical Contracting Service Management          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Docker
TOTAL_STEPS=8
CURRENT_STEP=0

show_progress $CURRENT_STEP $TOTAL_STEPS "Checking prerequisites..."
CURRENT_STEP=$((CURRENT_STEP + 1))

if ! command -v docker &> /dev/null; then
    echo -e "\n${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "\n${RED}Error: Docker Compose is not installed.${NC}"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi

show_progress $CURRENT_STEP $TOTAL_STEPS "Prerequisites verified"
CURRENT_STEP=$((CURRENT_STEP + 1))

# Create .env file if it doesn't exist
show_progress $CURRENT_STEP $TOTAL_STEPS "Configuring environment..."
CURRENT_STEP=$((CURRENT_STEP + 1))

if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || true
    
    # Generate secure JWT secret (alphanumeric only to avoid sed issues)
    JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 32)
    sed -i "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|" .env 2>/dev/null || \
    sed -i '' "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|" .env
    
    # Generate secure DB password
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 16)
    sed -i "s|changeme123|$DB_PASSWORD|g" .env 2>/dev/null || \
    sed -i '' "s|changeme123|$DB_PASSWORD|g" .env
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

# Create uploads directories
show_progress $CURRENT_STEP $TOTAL_STEPS "Creating directories..."
CURRENT_STEP=$((CURRENT_STEP + 1))
mkdir -p backend/uploads/logos

# Use docker compose or docker-compose depending on what's available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Start Docker containers
show_progress $CURRENT_STEP $TOTAL_STEPS "Building and starting Docker containers (this may take a few minutes)..."
CURRENT_STEP=$((CURRENT_STEP + 1))

# Start build in background and show spinner
($COMPOSE_CMD up -d --build > /tmp/docker-build.log 2>&1) &
BUILD_PID=$!
show_spinner $BUILD_PID "Building Docker images"

# Wait for PostgreSQL to be ready
show_progress $CURRENT_STEP $TOTAL_STEPS "Waiting for PostgreSQL to start..."
CURRENT_STEP=$((CURRENT_STEP + 1))
sleep 3

MAX_RETRIES=30
RETRY_COUNT=0
until $COMPOSE_CMD exec -T postgres pg_isready -U ampedfieldops -d ampedfieldops > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "\n${RED}Error: PostgreSQL failed to start${NC}"
        exit 1
    fi
    show_progress $CURRENT_STEP $TOTAL_STEPS "Waiting for PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done
show_progress $CURRENT_STEP $TOTAL_STEPS "PostgreSQL is ready"
CURRENT_STEP=$((CURRENT_STEP + 1))

# Run migrations
show_progress $CURRENT_STEP $TOTAL_STEPS "Running database migrations..."
CURRENT_STEP=$((CURRENT_STEP + 1))
$COMPOSE_CMD exec -T backend node dist/db/migrate.js > /dev/null 2>&1 || true

# Run seeds
show_progress $CURRENT_STEP $TOTAL_STEPS "Seeding default data..."
CURRENT_STEP=$((CURRENT_STEP + 1))
$COMPOSE_CMD exec -T backend node dist/db/seed.js > /dev/null 2>&1 || true

# Mark setup as complete
show_progress $CURRENT_STEP $TOTAL_STEPS "Completing setup..."
CURRENT_STEP=$((CURRENT_STEP + 1))
sleep 2
curl -s -X POST http://localhost:3001/api/setup/complete > /dev/null 2>&1 || true

# Final step
show_progress $TOTAL_STEPS $TOTAL_STEPS "Installation complete!"

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
