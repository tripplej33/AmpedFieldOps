#!/bin/bash

# AmpedFieldOps Installation Script (Local Development)
# =====================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      AmpedFieldOps Local Installation Script              ║"
echo "║        Electrical Contracting Service Management          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Node.js
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ is required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) is installed${NC}"

# Check for PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL CLI not found. Make sure PostgreSQL is running.${NC}"
fi

# Get database configuration
echo ""
echo -e "${YELLOW}Database Configuration${NC}"
echo "----------------------"

read -p "PostgreSQL host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "PostgreSQL port [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}

read -p "PostgreSQL database name [ampedfieldops]: " DB_NAME
DB_NAME=${DB_NAME:-ampedfieldops}

read -p "PostgreSQL username [postgres]: " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "PostgreSQL password: " DB_PASSWORD
echo ""

DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

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

# Create database if it doesn't exist
echo ""
echo -e "${YELLOW}Setting up database...${NC}"

if command -v psql &> /dev/null; then
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME"
    echo -e "${GREEN}✓ Database ready${NC}"
else
    echo -e "${YELLOW}Please ensure database '$DB_NAME' exists before continuing.${NC}"
    read -p "Press Enter when ready..."
fi

# Create .env file
echo -e "${YELLOW}Creating environment configuration...${NC}"

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)

cat > .env << EOF
# Database Configuration
DATABASE_URL=$DATABASE_URL

# Authentication
JWT_SECRET=$JWT_SECRET

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# API URL (for frontend)
VITE_API_URL=http://localhost:3001

# Xero Integration (Optional)
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=http://localhost:3001/api/xero/callback
EOF

# Copy to backend
cp .env backend/.env

echo -e "${GREEN}✓ Environment files created${NC}"

# Install frontend dependencies
echo ""
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

# Install backend dependencies
echo -e "${YELLOW}Installing backend dependencies...${NC}"
cd backend
npm install
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Create uploads directories
mkdir -p uploads/logos

# Build backend
echo -e "${YELLOW}Building backend...${NC}"
npm run build
echo -e "${GREEN}✓ Backend built${NC}"

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"
npm run migrate
echo -e "${GREEN}✓ Migrations completed${NC}"

# Run seeds
echo -e "${YELLOW}Seeding default data...${NC}"
npm run seed
echo -e "${GREEN}✓ Default data seeded${NC}"

# Start backend temporarily to create admin
echo -e "${YELLOW}Creating admin user...${NC}"
npm start &
BACKEND_PID=$!
sleep 5

cd ..

RESPONSE=$(curl -s -X POST http://localhost:3001/api/setup/admin \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$ADMIN_EMAIL\",
        \"password\": \"$ADMIN_PASSWORD\",
        \"name\": \"$ADMIN_NAME\"
    }")

if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${YELLOW}Note:${NC} $RESPONSE"
else
    echo -e "${GREEN}✓ Admin user created${NC}"
fi

# Complete setup
curl -s -X POST http://localhost:3001/api/setup/complete > /dev/null

# Stop temporary backend
kill $BACKEND_PID 2>/dev/null || true

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                     ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}To start the application:${NC}"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend && npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    npm run dev"
echo ""
echo -e "Then open: ${GREEN}http://localhost:5173${NC}"
echo ""
echo -e "Login with:"
echo -e "  Email: ${YELLOW}$ADMIN_EMAIL${NC}"
echo -e "  Password: ${YELLOW}(the password you entered)${NC}"
echo ""
