-- RLS Policies for Direct Frontend Access
-- Enable RLS on all public tables
-- Since this is single-org-per-instance, auth.uid() = organization owner
-- All data belongs to the authenticated user's organization

-- Enable RLS on tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- CLIENTS POLICIES
-- All users can view all clients (no organization scoping needed)
CREATE POLICY "All authenticated users can view clients"
  ON clients FOR SELECT
  USING (TRUE);

-- All users can create clients
CREATE POLICY "All authenticated users can create clients"
  ON clients FOR INSERT
  WITH CHECK (TRUE);

-- All users can update clients
CREATE POLICY "All authenticated users can update clients"
  ON clients FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- All users can delete clients
CREATE POLICY "All authenticated users can delete clients"
  ON clients FOR DELETE
  USING (TRUE);

-- PROJECTS POLICIES
-- All users can view all projects
CREATE POLICY "All authenticated users can view projects"
  ON projects FOR SELECT
  USING (TRUE);

-- All users can create projects
CREATE POLICY "All authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (TRUE);

-- All users can update projects
CREATE POLICY "All authenticated users can update projects"
  ON projects FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- All users can delete projects
CREATE POLICY "All authenticated users can delete projects"
  ON projects FOR DELETE
  USING (TRUE);

-- TIMESHEETS POLICIES
-- All users can view all timesheets
CREATE POLICY "All authenticated users can view timesheets"
  ON timesheets FOR SELECT
  USING (TRUE);

-- All users can create timesheets
CREATE POLICY "All authenticated users can create timesheets"
  ON timesheets FOR INSERT
  WITH CHECK (TRUE);

-- All users can update timesheets
CREATE POLICY "All authenticated users can update timesheets"
  ON timesheets FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- All users can delete timesheets
CREATE POLICY "All authenticated users can delete timesheets"
  ON timesheets FOR DELETE
  USING (TRUE);

-- ACTIVITY TYPES POLICIES
-- Activity types are readable to all authenticated users
CREATE POLICY "All authenticated users can view activity types"
  ON activity_types FOR SELECT
  USING (TRUE);

-- Users can create activity types
CREATE POLICY "All authenticated users can create activity types"
  ON activity_types FOR INSERT
  WITH CHECK (TRUE);

-- Users can update activity types
CREATE POLICY "All authenticated users can update activity types"
  ON activity_types FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- Users can delete activity types
CREATE POLICY "All authenticated users can delete activity types"
  ON activity_types FOR DELETE
  USING (TRUE);

-- COST CENTERS POLICIES
-- All users can view cost centers
CREATE POLICY "All authenticated users can view cost centers"
  ON cost_centers FOR SELECT
  USING (TRUE);

-- All users can create cost centers
CREATE POLICY "All authenticated users can create cost centers"
  ON cost_centers FOR INSERT
  WITH CHECK (TRUE);

-- All users can update cost centers
CREATE POLICY "All authenticated users can update cost centers"
  ON cost_centers FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- All users can delete cost centers
CREATE POLICY "All authenticated users can delete cost centers"
  ON cost_centers FOR DELETE
  USING (TRUE);

-- USERS POLICIES
-- All users can view other users
CREATE POLICY "All authenticated users can view users"
  ON users FOR SELECT
  USING (TRUE);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
