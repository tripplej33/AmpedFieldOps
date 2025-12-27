#!/bin/bash

# AmpedFieldOps Installation Script (Docker)
# ==========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           AmpedFieldOps Installation Script               ║"
echo "║        Electrical Contracting Service Management          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Docker
echo -e "${YELLOW}Checking prerequisites...${NC}"

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
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    
    # Generate secure JWT secret (alphanumeric only to avoid sed issues)
    JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 32)
    sed -i "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|" .env
    
    # Generate secure DB password
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 16)
    sed -i "s|changeme123|$DB_PASSWORD|g" .env
    
    echo -e "${GREEN}✓ .env file created with secure secrets${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi

# Get company name
echo ""
echo -e "${YELLOW}Company Configuration${NC}"
echo "---------------------"

read -p "Enter company name [AmpedFieldOps]: " COMPANY_NAME
COMPANY_NAME=${COMPANY_NAME:-AmpedFieldOps}

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
echo -e "${YELLOW}Creating upload directories...${NC}"
mkdir -p backend/uploads/logos

# Start Docker containers
echo ""
echo -e "${YELLOW}Starting Docker containers...${NC}"

# Use docker compose or docker-compose depending on what's available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

$COMPOSE_CMD up -d --build

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 5

MAX_RETRIES=30
RETRY_COUNT=0
until $COMPOSE_CMD exec -T postgres pg_isready -U ampedfieldops -d ampedfieldops > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}Error: PostgreSQL failed to start${NC}"
        exit 1
    fi
    echo "Waiting for PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"
$COMPOSE_CMD exec -T backend node dist/db/migrate.js
echo -e "${GREEN}✓ Migrations completed${NC}"

# Run seeds
echo -e "${YELLOW}Seeding default data...${NC}"
$COMPOSE_CMD exec -T backend node dist/db/seed.js
echo -e "${GREEN}✓ Default data seeded (including admin user)${NC}"

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
