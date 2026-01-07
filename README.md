# AmpedFieldOps

**Electrical Contracting Service Management Platform**

A mobile-first service business management platform designed for electrical contractors and their field teams. Orchestrates client relationships, project workflows, timesheet capture, and financial reconciliation through Xero integration.

## Features

- 📊 **Command Center Dashboard** - Real-time metrics, project health, and team activity
- 📁 **Project Management** - Kanban board with status tracking and budget monitoring
- 👥 **Client Directory** - Searchable client database with contact management
- ⏱️ **Timesheet Tracking** - Mobile-optimized time entry with photo capture and multiple activity types
- 📈 **Reports & Analytics** - Cost center analysis and budget tracking
- 💰 **Xero Integration** - Invoices, quotes, bills, expenses, purchase orders, and financial sync
- 📧 **Email Configuration** - Admin-managed SMTP settings with test email functionality
- 👤 **User Management** - Role-based access control with granular permissions
- 🎨 **Activity Types** - Configurable work categories with hourly rates
- 📁 **File Management** - Project files, timesheet images, and company logos organized by client/project
- 🛡️ **Safety Documents** - Manage safety documentation (JSA, Electrical Compliance, etc.) with PDF generation
- 📄 **Document Scan (OCR)** - Upload documents for OCR processing and automatic matching
- 💾 **Backups** - Database backups with Google Drive integration
- ☁️ **Cloud Storage** - Optional cloud storage for timesheet images
- 🔧 **Troubleshooter** - System diagnostics and route testing
- 👤 **User Settings** - Profile updates and password changes
- 🔐 **Password Recovery** - Forgot password flow with email reset links

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
- Nodemailer for email delivery

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker (optional, for containerized setup)

### Option 1: Docker Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/tripplej33/AmpedFieldOps.git
cd AmpedFieldOps

# Run installation script
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
# Run local installation script
chmod +x install-local.sh
./install-local.sh
```

Or manually:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Copy environment file
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
cd backend && npm run migrate && cd ..

# Seed default data
cd backend && npm run seed && cd ..

# Start backend (terminal 1)
cd backend && npm run dev

# Start frontend (terminal 2, from root)
npm run dev
```

## Environment Variables

Create a `.env` file in the `backend` directory based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ampedfieldops

# Authentication
JWT_SECRET=your-secret-key-min-32-characters

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3001

# Xero Integration (Optional - can also be configured in Settings)
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=http://localhost:3001/api/xero/callback

# Email/SMTP (Optional - can be configured in Settings page)
# These are fallback values if not set in the Settings page
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

> **Note:** Email settings can be managed through the Settings page (Admin only). Environment variables serve as fallback values.

## First-Time Setup

1. Navigate to http://localhost:5173 (or http://localhost:3000 for Docker)
2. Complete the setup wizard:
   - Create admin account
   - Configure company name and logo
   - Set up email configuration (optional)
   - Connect Xero (optional)
3. Start adding clients and projects!

## Configuration

### Email Settings

Email configuration can be managed in the Settings page (Admin only):

1. Navigate to **Settings → Email Configuration**
2. Enter your SMTP details:
   - SMTP Host (e.g., `smtp.gmail.com`, `smtp.sendgrid.net`)
   - SMTP Port (typically `587` for TLS or `465` for SSL)
   - SMTP User (your email or API key username)
   - SMTP Password (your password or API key)
   - From Email Address (optional, defaults to SMTP User)
3. Click **Send Test Email** to verify your configuration

For detailed email setup instructions, see [EMAIL_SETUP.md](./EMAIL_SETUP.md).

### Xero Integration

1. Create a Xero app at https://developer.xero.com/app/manage
2. Set OAuth 2.0 redirect URI to `http://your-domain/api/xero/callback`
3. Add your Client ID and Secret in **Settings → Xero Integration**
4. Click **Connect to Xero** and authorize the connection

For detailed Xero setup instructions, see [XERO_SETUP.md](./XERO_SETUP.md).

## User Roles & Permissions

### Roles
- **Admin** - Full system access, can manage all settings
- **Manager** - View all data, manage projects, approve timesheets
- **User** - Create timesheets, view assigned projects

### Permissions

| Permission | Description | Admin | Manager | User |
|------------|-------------|-------|---------|------|
| `can_view_dashboard` | Access the main dashboard | ✅ | ✅ | ✅ |
| `can_view_financials` | Access invoices and quotes | ✅ | ✅ | ❌ |
| `can_edit_projects` | Create/edit projects | ✅ | ✅ | ❌ |
| `can_view_projects` | View project details | ✅ | ✅ | ✅ |
| `can_manage_users` | User administration | ✅ | ❌ | ❌ |
| `can_sync_xero` | Xero integration control | ✅ | ❌ | ❌ |
| `can_view_all_timesheets` | See all team timesheets | ✅ | ✅ | ❌ |
| `can_create_timesheets` | Create new timesheet entries | ✅ | ✅ | ✅ |
| `can_view_own_timesheets` | View own timesheet entries | ✅ | ✅ | ✅ |
| `can_edit_own_timesheets` | Edit own timesheet entries | ✅ | ✅ | ✅ |
| `can_delete_own_timesheets` | Delete own timesheet entries | ✅ | ✅ | ✅ |
| `can_edit_activity_types` | Configure activity types | ✅ | ❌ | ❌ |
| `can_manage_clients` | Client administration | ✅ | ✅ | ❌ |
| `can_view_clients` | View client details | ✅ | ✅ | ✅ |
| `can_manage_cost_centers` | Cost center setup | ✅ | ❌ | ❌ |
| `can_view_reports` | Access reports section | ✅ | ✅ | ❌ |
| `can_export_data` | Export data to CSV/PDF | ✅ | ✅ | ❌ |
| `can_manage_settings` | Access and modify application settings | ✅ | ❌ | ❌ |

> **Note:** Permissions can be customized per role in **Settings → Permissions**. The table above shows default permissions.

## API Documentation

### Authentication
```
POST   /api/auth/register          - Register new user
POST   /api/auth/login             - Login
POST   /api/auth/refresh           - Refresh token
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password    - Reset password with token
GET    /api/auth/me                - Get current user
PUT    /api/auth/profile           - Update user profile
PUT    /api/auth/change-password   - Change password
```

### Clients
```
GET    /api/clients                - List all clients
POST   /api/clients                - Create client
GET    /api/clients/:id            - Get client details
PUT    /api/clients/:id            - Update client
DELETE /api/clients/:id            - Delete client
```

### Projects
```
GET    /api/projects               - List projects
POST   /api/projects               - Create project
GET    /api/projects/:id           - Get project details
PUT    /api/projects/:id           - Update project
DELETE /api/projects/:id           - Delete project
```

### Timesheets
```
GET    /api/timesheets             - List timesheets
POST   /api/timesheets             - Create entry
PUT    /api/timesheets/:id         - Update entry
DELETE /api/timesheets/:id         - Delete entry
POST   /api/timesheets/:id/images  - Upload photos
DELETE /api/timesheets/:id/images/:index - Delete photo
```

### Settings
```
GET    /api/settings               - Get all settings
GET    /api/settings/:key          - Get specific setting
PUT    /api/settings/:key           - Update setting
POST   /api/settings/email/test     - Send test email (Admin only)
POST   /api/settings/logo          - Upload company logo (Admin only)
GET    /api/settings/logs/activity - Get activity logs (Admin only)
```

### Xero Integration
```
GET    /api/xero/auth/url          - Get OAuth URL
GET    /api/xero/status            - Connection status
POST   /api/xero/sync              - Trigger sync
DELETE /api/xero/disconnect        - Disconnect Xero
GET    /api/xero/invoices          - List invoices
POST   /api/xero/invoices          - Create invoice
POST   /api/xero/invoices/from-timesheets - Create invoice from timesheets
POST   /api/xero/invoices/:id/paid - Mark invoice as paid
GET    /api/xero/quotes            - List quotes
POST   /api/xero/quotes            - Create quote
GET    /api/xero/summary           - Financial summary
POST   /api/xero/contacts/pull     - Pull contacts from Xero
POST   /api/xero/contacts/push/:id - Push client to Xero
POST   /api/xero/contacts/push-all - Push all clients to Xero
```

### Files
```
GET    /api/files                           - List project files
GET    /api/files/timesheet-images/:projectId - Get timesheet images for project
GET    /api/files/timesheet-images          - Get all timesheet images summary
GET    /api/files/logos                     - List company logos
POST   /api/files                           - Upload project file
DELETE /api/files/:id                       - Delete project file
DELETE /api/files/logos/:filename           - Delete logo
```

### Backups
```
GET    /api/backups                - List backups
POST   /api/backups                - Create backup
GET    /api/backups/:id/download   - Download backup
DELETE /api/backups/:id            - Delete backup
GET    /api/backups/schedule       - Get backup schedule
POST   /api/backups/schedule       - Set backup schedule
GET    /api/backups/google-drive/auth - Get Google Drive auth URL
GET    /api/backups/google-drive/callback - Google Drive OAuth callback
GET    /api/backups/google-drive/status - Get Google Drive connection status
```

### Safety Documents
```
GET    /api/safety-documents                - List safety documents
POST   /api/safety-documents                - Create safety document
GET    /api/safety-documents/:id            - Get safety document
PUT    /api/safety-documents/:id            - Update safety document
DELETE /api/safety-documents/:id            - Delete safety document
POST   /api/safety-documents/:id/generate-pdf - Generate PDF from safety document
GET    /api/safety-documents/:id/pdf        - Download generated PDF
```

### Document Scan (OCR)
```
POST   /api/document-scan/upload            - Upload and process document (OCR)
GET    /api/document-scan                   - List all scanned documents
GET    /api/document-scan/:id               - Get scan status and extracted data
GET    /api/document-scan/:id/matches       - Get suggested matches for a scan
POST   /api/document-scan/:id/match/:matchId/confirm - Confirm and link a match
POST   /api/document-scan/:id/match/reject  - Reject all matches
POST   /api/document-scan/:id/retry         - Retry failed scan
```

### Troubleshooter
```
GET    /api/troubleshooter         - Run system diagnostics
GET    /api/troubleshooter/routes  - List all API routes
```

### Health
```
GET    /api/health                 - System health check (database, Xero status)
```

### Role Permissions
```
GET    /api/role-permissions       - Get all permissions and role assignments
PUT    /api/role-permissions       - Update role permissions (Admin only)
```

## Database Schema

```
users                 - User accounts and authentication
user_permissions      - Granular permission assignments
clients               - Customer records
projects              - Project management
project_cost_centers  - Project to cost center mapping
project_files         - Project file metadata
timesheets            - Time tracking entries (with billing_status, invoice_id, image_urls, cloud_image_urls, location)
cost_centers          - Cost categorization
activity_types        - Work type definitions
permissions           - Available system permissions
xero_tokens           - OAuth token storage
xero_invoices         - Cached invoice data
xero_quotes           - Cached quote data
safety_documents      - Safety documentation records
settings              - System and user settings (including email config, Xero, Google Drive)
activity_logs         - Audit trail
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
- Check `DATABASE_URL` in `.env`
- Ensure database exists

**"Xero connection failed"**
- Verify Xero credentials in Settings page
- Check redirect URI matches Xero app settings
- Ensure tokens haven't expired

**"Email sending failed"**
- Verify SMTP settings in Settings page
- Test email configuration using "Send Test Email"
- Check SMTP credentials and firewall settings
- See [EMAIL_SETUP.md](./EMAIL_SETUP.md) for detailed setup

**"401 Unauthorized"**
- Token may have expired, try logging in again
- Check `JWT_SECRET` is consistent across restarts

### Logs

```bash
# Docker logs
docker compose logs -f backend

# View activity logs via API
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
cd backend && npx tsc --noEmit

# Build for production
npm run build
cd backend && npm run build
```

## Additional Documentation

- [DOCKER_SETUP.md](./DOCKER_SETUP.md) - Detailed Docker setup instructions
- [EMAIL_SETUP.md](./EMAIL_SETUP.md) - Email/SMTP configuration guide
- [XERO_SETUP.md](./XERO_SETUP.md) - Xero integration setup guide
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Implementation details
- [TROUBLESHOOTER_PROMPT.md](./TROUBLESHOOTER_PROMPT.md) - Troubleshooting guide
- [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) - System architecture diagrams

**Historical Documentation:** Archived implementation summaries and reviews are available in `docs/archive/` for reference.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.
