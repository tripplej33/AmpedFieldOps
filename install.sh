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
    
    # Generate secure JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    sed -i "s/your-super-secret-jwt-key-change-in-production-min-32-chars/$JWT_SECRET/" .env
    
    # Generate secure DB password
    DB_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9')
    sed -i "s/changeme123/$DB_PASSWORD/g" .env
    
    echo -e "${GREEN}✓ .env file created with secure secrets${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi

# Get admin credentials
echo ""
echo -e "${YELLOW}Setup Admin Account${NC}"
echo "-------------------"

read -p "Enter admin email: " ADMIN_EMAIL
while [ -z "$ADMIN_EMAIL" ]; do
    echo -e "${RED}Email cannot be empty${NC}"
    read -p "Enter admin email: " ADMIN_EMAIL
done

read -sp "Enter admin password (min 8 characters): " ADMIN_PASSWORD
echo ""
while [ ${#ADMIN_PASSWORD} -lt 8 ]; do
    echo -e "${RED}Password must be at least 8 characters${NC}"
    read -sp "Enter admin password: " ADMIN_PASSWORD
    echo ""
done

read -p "Enter admin name: " ADMIN_NAME
while [ -z "$ADMIN_NAME" ]; do
    echo -e "${RED}Name cannot be empty${NC}"
    read -p "Enter admin name: " ADMIN_NAME
done

read -p "Enter company name [AmpedFieldOps]: " COMPANY_NAME
COMPANY_NAME=${COMPANY_NAME:-AmpedFieldOps}

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
echo -e "${GREEN}✓ Default data seeded${NC}"

# Create admin user via API
echo -e "${YELLOW}Creating admin user...${NC}"

# Wait for backend to be ready
sleep 3

RESPONSE=$(curl -s -X POST http://localhost:3001/api/setup/admin \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$ADMIN_EMAIL\",
        \"password\": \"$ADMIN_PASSWORD\",
        \"name\": \"$ADMIN_NAME\",
        \"company_name\": \"$COMPANY_NAME\"
    }")

if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${YELLOW}Admin user may already exist or there was an issue:${NC}"
    echo "$RESPONSE"
else
    echo -e "${GREEN}✓ Admin user created${NC}"
fi

# Complete setup
curl -s -X POST http://localhost:3001/api/setup/complete > /dev/null

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                     ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Access AmpedFieldOps at: ${GREEN}http://localhost:3000${NC}"
echo -e "API endpoint: ${GREEN}http://localhost:3001${NC}"
echo ""
echo -e "Login with:"
echo -e "  Email: ${YELLOW}$ADMIN_EMAIL${NC}"
echo -e "  Password: ${YELLOW}(the password you entered)${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Log in with your admin credentials"
echo "  3. Configure Xero integration in Settings (optional)"
echo "  4. Add your first client and project"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:    $COMPOSE_CMD logs -f"
echo "  Stop:         $COMPOSE_CMD down"
echo "  Restart:      $COMPOSE_CMD restart"
echo ""
