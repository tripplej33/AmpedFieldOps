-- RLS policies for login/users features
-- Note: GRANTs must coexist with RLS; ensure roles have SELECT privileges via Supabase defaults.

-- Users table: per-user read, admin read/update
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_own ON users;
CREATE POLICY users_read_own ON users
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_admin_read_all ON users;
CREATE POLICY users_admin_read_all ON users
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

DROP POLICY IF EXISTS users_admin_update ON users;
CREATE POLICY users_admin_update ON users
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM users up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- User permissions: owner read, admin read all
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permissions_read_own ON user_permissions;
CREATE POLICY user_permissions_read_own ON user_permissions
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_permissions_admin_read_all ON user_permissions;
CREATE POLICY user_permissions_admin_read_all ON user_permissions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- Permissions catalog: allow read to authenticated
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_read_all ON permissions;
CREATE POLICY permissions_read_all ON permissions
  FOR SELECT TO authenticated
  USING (true);

-- Optional: restrict updates/inserts/deletes to admins
DROP POLICY IF EXISTS permissions_admin_write ON permissions;
CREATE POLICY permissions_admin_write ON permissions
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));
