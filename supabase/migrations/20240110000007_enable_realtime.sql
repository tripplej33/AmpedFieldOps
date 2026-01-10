-- Enable Realtime on key tables for live updates
-- This allows clients to subscribe to database changes in real-time

-- Enable Realtime publication (if not already enabled)
-- Note: In self-hosted Supabase, you may need to configure Realtime separately

-- Enable Realtime on core tables
ALTER PUBLICATION supabase_realtime ADD TABLE timesheets;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE xero_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE xero_quotes;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;

-- Note: For self-hosted Supabase, you may need to:
-- 1. Ensure Realtime service is running
-- 2. Configure Realtime in your Supabase config
-- 3. Check that the publication exists: SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';
-- 4. If publication doesn't exist, create it: CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
