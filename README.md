# AmpedFieldOps

**Electrical Contracting Service Management Platform**

A mobile-first service business management platform designed for electrical contractors and their field teams. Orchestrates client relationships, project workflows, timesheet capture, and financial reconciliation through Xero integration.

![AmpedFieldOps](https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=80)

## Features

- 📊 **Command Center Dashboard** - Real-time metrics, project health, and team activity
- 📁 **Project Management** - Kanban board with status tracking and budget monitoring
- 👥 **Client Directory** - Searchable client database with contact management
- ⏱️ **Timesheet Tracking** - Mobile-optimized time entry with photo capture
- 📈 **Reports & Analytics** - Cost center analysis and budget tracking
- 💰 **Xero Integration** - Invoices, quotes, and financial sync
- 👤 **User Management** - Role-based access control with granular permissions
- 🎨 **Activity Types** - Configurable work categories with hourly rates

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite build tool
- Tailwind CSS with custom "Technical Command Center" theme
- Shadcn/ui components (Radix UI)
- React Router v6
- Lucide React icons

### Backend
- Node.js with Express
- PostgreSQL database
- JWT authentication
- Xero API integration

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker (optional, for containerized setup)

### Option 1: Docker Installation (Recommended)

```bash
# Clone and run installation script
git clone https://github.com/tripplej33/AmpedFieldOps.git
cd AmpedFieldOps

chmod +x install.sh
./install.sh
```

This will:
1. Check Docker installation
2. Generate secure secrets
3. Prompt for admin credentials
4. Start all services
5. Run migrations and seeds
6. Create your admin account

Access the app at **http://localhost:3000**

### Option 2: Local Development

```bash
# Clone and run local installation script
chmod +x install-local.sh
./install-local.sh
```

Or manually:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Copy environment file
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
npm run migrate

# Seed default data
npm run seed

# Start backend (terminal 1)
npm run dev

# Start frontend (terminal 2, from root)
cd .. && npm run dev
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ampedfieldops

# Authentication
JWT_SECRET=your-secret-key-min-32-characters

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Frontend API
VITE_API_URL=http://localhost:3001

# Xero Integration (Optional)
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=http://localhost:3001/api/xero/callback
```

## First-Time Setup

1. Navigate to http://localhost:5173 (or http://localhost:3000 for Docker)
2. Complete the setup wizard:
   - Create admin account
   - Configure company name and logo
   - Connect Xero (optional)
3. Start adding clients and projects!

## User Roles & Permissions

### Roles
- **Admin** - Full system access
- **Manager** - View all data, manage projects, approve timesheets
- **User** - Create timesheets, view assigned projects

### Permissions
| Permission | Description | Admin | Manager | User |
|------------|-------------|-------|---------|------|
| can_view_financials | Access invoices and quotes | ✅ | ✅ | ❌ |
| can_edit_projects | Create/edit projects | ✅ | ✅ | ❌ |
| can_manage_users | User administration | ✅ | ❌ | ❌ |
| can_sync_xero | Xero integration control | ✅ | ❌ | ❌ |
| can_view_all_timesheets | See all team timesheets | ✅ | ✅ | ❌ |
| can_edit_activity_types | Configure activity types | ✅ | ❌ | ❌ |
| can_manage_clients | Client administration | ✅ | ✅ | ❌ |
| can_manage_cost_centers | Cost center setup | ✅ | ❌ | ❌ |

## API Documentation

### Authentication
```
POST /api/auth/register     - Register new user
POST /api/auth/login        - Login
POST /api/auth/refresh      - Refresh token
POST /api/auth/forgot-password - Request password reset
GET  /api/auth/me           - Get current user
```

### Clients
```
GET    /api/clients         - List all clients
POST   /api/clients         - Create client
GET    /api/clients/:id     - Get client details
PUT    /api/clients/:id     - Update client
DELETE /api/clients/:id     - Delete client
```

### Projects
```
GET    /api/projects        - List projects
POST   /api/projects        - Create project
GET    /api/projects/:id    - Get project details
PUT    /api/projects/:id    - Update project
DELETE /api/projects/:id    - Delete project
```

### Timesheets
```
GET    /api/timesheets      - List timesheets
POST   /api/timesheets      - Create entry
PUT    /api/timesheets/:id  - Update entry
DELETE /api/timesheets/:id  - Delete entry
POST   /api/timesheets/:id/images - Upload photos
```

### Xero Integration
```
GET    /api/xero/auth/url   - Get OAuth URL
GET    /api/xero/status     - Connection status
POST   /api/xero/sync       - Trigger sync
GET    /api/xero/invoices   - List invoices
POST   /api/xero/invoices   - Create invoice
GET    /api/xero/quotes     - List quotes
GET    /api/xero/summary    - Financial summary
```

## Xero Integration Setup

1. Create a Xero app at https://developer.xero.com/app/manage
2. Set OAuth 2.0 redirect URI to `http://your-domain/api/xero/callback`
3. Add your Client ID and Secret to environment variables
4. In AmpedFieldOps Settings, click "Connect to Xero"
5. Authorize the connection

## Database Schema

```
users               - User accounts and authentication
user_permissions    - Granular permission assignments
clients             - Customer records
projects            - Project management
project_cost_centers - Project to cost center mapping
timesheets          - Time tracking entries
cost_centers        - Cost categorization
activity_types      - Work type definitions
xero_tokens         - OAuth token storage
xero_invoices       - Cached invoice data
xero_quotes         - Cached quote data
settings            - System and user settings
activity_logs       - Audit trail
```

## Backup & Restore

### Docker
```bash
# Backup
docker exec ampedfieldops-db pg_dump -U ampedfieldops ampedfieldops > backup.sql

# Restore
docker exec -i ampedfieldops-db psql -U ampedfieldops ampedfieldops < backup.sql
```

### Local PostgreSQL
```bash
# Backup
pg_dump -U postgres ampedfieldops > backup.sql

# Restore
psql -U postgres ampedfieldops < backup.sql
```

## Troubleshooting

### Common Issues

**"Database connection failed"**
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database exists

**"Xero connection failed"**
- Verify XERO_CLIENT_ID and XERO_CLIENT_SECRET
- Check redirect URI matches Xero app settings
- Ensure tokens haven't expired

**"401 Unauthorized"**
- Token may have expired, try logging in again
- Check JWT_SECRET is consistent

### Logs
```bash
# Docker logs
docker compose logs -f backend

# View activity logs
GET /api/settings/logs/activity
```

## Development

```bash
# Frontend development
npm run dev

# Backend development
cd backend && npm run dev

# Type checking
npx tsc --noEmit

# Build for production
npm run build
cd backend && npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.
