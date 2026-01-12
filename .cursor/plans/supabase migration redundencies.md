Cleanup Redundancies and Update Install Script for Supabase
Overview
Remove redundant services (Adminer, PostgreSQL) from Docker Compose, update install.sh to use Supabase CLI, and display Supabase Studio URL after installation.

Changes Required
1. Remove Redundant Services from docker-compose.yml
File: docker-compose.yml

Remove adminer service (lines 105-114) - redundant since Supabase Studio provides better UI
Remove postgres service (lines 4-20) - Supabase provides PostgreSQL via CLI
Keep: backend, frontend, ocr-service, redis (if still needed)
Update backend service:
Remove depends_on: postgres
Update environment variables to use Supabase connection strings
Remove JWT_SECRET (Supabase handles auth)
Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
2. Update install.sh for Supabase
File: install.sh

Changes:

Step 1 (Prerequisites):
Check for Supabase CLI: command -v supabase
If not found, provide installation instructions
Keep Docker checks for other services
Step 2 (Environment):
Remove JWT_SECRET generation (Supabase handles this)
Add Supabase environment variables:
SUPABASE_URL (default: http://127.0.0.1:54321)
SUPABASE_SERVICE_ROLE_KEY (will be retrieved from supabase status)
DATABASE_URL (will be retrieved from supabase status)
Update frontend .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
Step 3 (Directories):
Keep upload directories creation
Add Supabase initialization check
Step 4 (Supabase Setup):
New step: Initialize Supabase if not already initialized
if [ ! -f supabase/config.toml ]; then
  supabase init
fi
Start Supabase: supabase start
Wait for Supabase to be ready
Extract Supabase credentials from supabase status:
API URL → SUPABASE_URL
DB URL → DATABASE_URL
service_role key → SUPABASE_SERVICE_ROLE_KEY
anon key → VITE_SUPABASE_ANON_KEY
Update .env files with these values
Step 5 (Migrations):
Replace: $COMPOSE_CMD exec -T backend node dist/db/migrate.js
With: supabase migration up
Or: supabase db reset (if fresh install)
Step 6 (Storage Buckets):
New step: Create Supabase Storage buckets
Run: npx ts-node scripts/create-storage-buckets.ts
Or check if buckets exist and create if missing
Step 7 (Seeding):
Keep seeding step but may need adjustment for Supabase
Or remove if using Supabase seed files
Step 8 (Completion):
Update success message to show:
Frontend URL
Backend API URL
Supabase Studio URL: http://127.0.0.1:54323 (NEW)
Supabase API URL
Database connection info
3. Update update.sh
File: update.sh

Remove Adminer reference (line 159)
Add Supabase Studio URL instead:
echo -e "  Supabase Studio: ${GREEN}http://127.0.0.1:54323${NC}"
4. Update .env.example (if exists)
File: .env.example (root level, if it exists)

Remove JWT_SECRET
Add Supabase variables:
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=
5. Update Backend Environment in docker-compose.yml
File: docker-compose.yml

Backend service environment variables:

Remove: DATABASE_URL (old PostgreSQL)
Remove: JWT_SECRET
Add: SUPABASE_URL=${SUPABASE_URL:-http://127.0.0.1:54321}
Add: SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
Add: DATABASE_URL=${DATABASE_URL} (Supabase PostgreSQL URL)
Implementation Details
Supabase Status Parsing
The install script needs to parse supabase status output to extract:

API URL
DB URL  
service_role key
anon key
Example parsing:

SUPABASE_STATUS=$(supabase status --output json 2>/dev/null || supabase status)
# Parse and extract values
Error Handling
Check if Supabase CLI is installed
Check if Supabase is already running
Handle Supabase start failures gracefully
Verify migrations ran successfully
Verify storage buckets were created
Backward Compatibility
Check if old PostgreSQL container exists and warn user
Provide migration path from old setup to Supabase
Keep docker-compose.yml structure for other services
Files to Modify
docker-compose.yml - Remove adminer and postgres services
install.sh - Complete rewrite for Supabase CLI
update.sh - Update URLs displayed
.env.example (if exists) - Update environment variables
Testing Checklist
[ ] Install script checks for Supabase CLI
[ ] Install script initializes Supabase if needed
[ ] Install script starts Supabase successfully
[ ] Install script extracts credentials from supabase status
[ ] Install script runs migrations successfully
[ ] Install script creates storage buckets
[ ] Install script displays Supabase Studio URL
[ ] Docker Compose services (backend, frontend, ocr) can connect to Supabase
[ ] Adminer is removed and no longer accessible
[ ] Old PostgreSQL service is removed
Notes
Supabase CLI manages its own Docker containers internally
Supabase Studio is accessible at http://127.0.0.1:54323 when Supabase is running
The backend service in Docker Compose will connect to Supabase running via CLI
All database operations now go through Supabase instead of direct PostgreSQL
