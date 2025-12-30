#!/bin/bash

# AmpedFieldOps Installation Script (Docker)
# ==========================================

set -e

# Enhanced color scheme
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Enhanced step header with better visual design
show_step() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} ${BOLD}${YELLOW}$1${NC} ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Countdown timer for IP input
countdown_input() {
    local prompt_text="$1"
    local default_value="$2"
    local timeout="$3"
    local result=""
    local remaining=$timeout
    
    # Display initial prompt
    echo -ne "${YELLOW}${prompt_text}${NC} ${DIM}[${default_value}]${NC} ${CYAN}(${remaining} seconds remaining):${NC} "
    
    # Read input with timeout, checking every second
    while [ $remaining -gt 0 ]; do
        if read -t 1 -r input 2>/dev/null; then
            result="$input"
            echo "" # New line after input
            break
        fi
        remaining=$((remaining - 1))
        # Clear the line and update countdown
        echo -ne "\r\033[K${YELLOW}${prompt_text}${NC} ${DIM}[${default_value}]${NC} ${CYAN}(${remaining} seconds remaining):${NC} "
    done
    
    # If no input was provided, use default
    if [ -z "$result" ]; then
        result="$default_value"
        echo -e "\r\033[K${GREEN}✓${NC} Using default: ${BOLD}${default_value}${NC}"
        echo ""
    fi
    
    echo "$result"
}

clear
echo -e "${GREEN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                               ║"
echo "║              ${CYAN}${BOLD}AmpedFieldOps Installation Script${GREEN}${BOLD}                      ║"
echo "║         ${MAGENTA}Electrical Contracting Service Management${GREEN}${BOLD}                    ║"
echo "║                                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

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

echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Docker and Docker Compose are installed${NC}"

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
    
    echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}.env file created with secure secrets${NC}"
else
    echo -e "${YELLOW}${BOLD}✓${NC} ${YELLOW}.env file already exists${NC}"
fi

echo ""
echo -e "${CYAN}${BOLD}Network Configuration${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${DIM}If accessing from another machine (e.g., running in a VM/LXC),${NC}"
echo -e "${DIM}enter the server's IP address. Otherwise, localhost will be used automatically.${NC}"
echo ""

# Use countdown function for IP input
SERVER_IP=$(countdown_input "Server IP address" "localhost" 30)

# Update .env with server IP
if [ "$SERVER_IP" != "localhost" ]; then
    sed -i "s|VITE_API_URL=http://localhost:3001|VITE_API_URL=http://$SERVER_IP:3001|" .env
    sed -i "s|FRONTEND_URL=http://localhost:3000|FRONTEND_URL=http://$SERVER_IP:3000|" .env
    sed -i "s|FRONTEND_URL=http://localhost:5173|FRONTEND_URL=http://$SERVER_IP:3000|" .env
    echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Configured for remote access at ${BOLD}$SERVER_IP${NC}"
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
echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Directories created${NC}"

# Start Docker containers
show_step "Step 4: Building and Starting Docker Containers"
echo -e "${YELLOW}Building and starting containers (this may take a few minutes)...${NC}"
echo -e "${DIM}This process may take 3-5 minutes depending on your system.${NC}"
echo ""

# Run docker compose build and start (show all output)
echo -e "${CYAN}[${NC}${YELLOW}Building${NC}${CYAN}]${NC} Starting Docker build process..."
$COMPOSE_CMD up -d --build
echo ""
echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Containers built and started${NC}"

# Wait for PostgreSQL to be ready
show_step "Step 5: Waiting for PostgreSQL"
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 2

MAX_RETRIES=30
RETRY_COUNT=0
until $COMPOSE_CMD exec -T postgres pg_isready -U ampedfieldops -d ampedfieldops > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo ""
        echo -e "${RED}${BOLD}✗${NC} ${RED}Error: PostgreSQL failed to start${NC}"
        exit 1
    fi
    # Animated dots
    dots=""
    for i in $(seq 1 $((RETRY_COUNT % 4))); do
        dots="${dots}."
    done
    printf "\r${CYAN}[${NC}${YELLOW}Waiting${NC}${CYAN}]${NC} ${DIM}PostgreSQL starting${dots}${NC} ${YELLOW}(${RETRY_COUNT}/${MAX_RETRIES})${NC}"
    sleep 2
done
printf "\r\033[K${GREEN}${BOLD}✓${NC} ${GREEN}PostgreSQL is ready${NC}\n"

# Run migrations
show_step "Step 6: Running Database Migrations"
echo -e "${YELLOW}Running database migrations...${NC}"
$COMPOSE_CMD exec -T backend node dist/db/migrate.js
echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Migrations completed${NC}"

# Run seeds
show_step "Step 7: Seeding Default Data"
echo -e "${YELLOW}Seeding default data...${NC}"
$COMPOSE_CMD exec -T backend node dist/db/seed.js
echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Default data seeded (including admin user)${NC}"

# Mark setup as complete
show_step "Step 8: Completing Setup"
echo -e "${YELLOW}Completing setup...${NC}"
sleep 2
curl -s -X POST http://localhost:3001/api/setup/complete > /dev/null 2>&1 || true
echo -e "${GREEN}${BOLD}✓${NC} ${GREEN}Setup marked complete${NC}"

echo ""
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║                                                                               ║${NC}"
echo -e "${GREEN}${BOLD}║                    ${CYAN}${BOLD}🎉 Installation Complete! 🎉${GREEN}${BOLD}                          ║${NC}"
echo -e "${GREEN}${BOLD}║                                                                               ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo ""
echo -e "${CYAN}${BOLD}Access Information:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}Web Interface:${NC}  ${GREEN}${BOLD}http://$SERVER_IP:3000${NC}"
echo -e "  ${BOLD}API Endpoint:${NC}   ${GREEN}${BOLD}http://$SERVER_IP:3001${NC}"
echo ""
echo ""
echo -e "${YELLOW}${BOLD}Default Admin Credentials:${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}Email:${NC}    ${YELLOW}admin@ampedfieldops.com${NC}"
echo -e "  ${BOLD}Password:${NC} ${YELLOW}admin123${NC}"
echo ""
echo -e "${RED}${BOLD}⚠️  SECURITY WARNING:${NC} ${RED}Please change the admin password immediately after first login!${NC}"
echo ""
echo ""
echo -e "${CYAN}${BOLD}Next Steps:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}1.${NC} Open ${GREEN}http://$SERVER_IP:3000${NC} in your browser"
echo -e "  ${BOLD}2.${NC} Log in with the default credentials above"
echo -e "  ${BOLD}3.${NC} Change your password in ${YELLOW}Settings > Profile${NC}"
echo -e "  ${BOLD}4.${NC} Configure integrations in ${YELLOW}Settings > Integrations${NC} (optional)"
echo -e "  ${BOLD}5.${NC} Add your first client and project"
echo ""
echo ""
echo -e "${CYAN}${BOLD}Useful Commands:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}View logs:${NC}    ${DIM}$COMPOSE_CMD logs -f${NC}"
echo -e "  ${BOLD}Stop:${NC}         ${DIM}$COMPOSE_CMD down${NC}"
echo -e "  ${BOLD}Restart:${NC}      ${DIM}$COMPOSE_CMD restart${NC}"
echo -e "  ${BOLD}Status:${NC}        ${DIM}$COMPOSE_CMD ps${NC}"
echo ""
echo ""
