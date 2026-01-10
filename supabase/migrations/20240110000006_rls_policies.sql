-- Row Level Security (RLS) Policies Migration
-- Comprehensive security policies based on roles and permissions

-- Helper function to check if user has a specific permission
CREATE OR REPLACE FUNCTION user_has_permission(permission_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_permissions up
    JOIN user_profiles upf ON up.user_id = upf.id
    WHERE upf.id = auth.uid()
    AND up.permission = permission_key
    AND up.granted = true
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'  -- Admins have all permissions
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to check if user is admin or manager
CREATE OR REPLACE FUNCTION is_admin_or_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================================
-- USER PROFILES POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON user_profiles FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON user_profiles FOR SELECT
USING (is_admin());

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
ON user_profiles FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
ON user_profiles FOR INSERT
WITH CHECK (is_admin());

-- ============================================================================
-- TIMESHEETS POLICIES
-- ============================================================================

-- Users can view their own timesheets
CREATE POLICY "Users can view own timesheets"
ON timesheets FOR SELECT
USING (auth.uid() = user_id);

-- Managers and admins can view all timesheets
CREATE POLICY "Managers can view all timesheets"
ON timesheets FOR SELECT
USING (is_admin_or_manager());

-- Users can insert their own timesheets
CREATE POLICY "Users can insert own timesheets"
ON timesheets FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own unbilled timesheets
CREATE POLICY "Users can update own unbilled timesheets"
ON timesheets FOR UPDATE
USING (
  auth.uid() = user_id
  AND billing_status = 'unbilled'
)
WITH CHECK (
  auth.uid() = user_id
  AND billing_status = 'unbilled'
);

-- Managers and admins can update any timesheet
CREATE POLICY "Managers can update all timesheets"
ON timesheets FOR UPDATE
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- Only admins can delete timesheets
CREATE POLICY "Admins can delete timesheets"
ON timesheets FOR DELETE
USING (is_admin());

-- ============================================================================
-- PROJECTS POLICIES
-- ============================================================================

-- Users can view projects they have timesheets for
CREATE POLICY "Users can view assigned projects"
ON projects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM timesheets
    WHERE timesheets.project_id = projects.id
    AND timesheets.user_id = auth.uid()
  )
  OR is_admin_or_manager()
);

-- Managers and admins can insert projects
CREATE POLICY "Managers can insert projects"
ON projects FOR INSERT
WITH CHECK (is_admin_or_manager());

-- Managers and admins can update projects
CREATE POLICY "Managers can update projects"
ON projects FOR UPDATE
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- Only admins can delete projects
CREATE POLICY "Admins can delete projects"
ON projects FOR DELETE
USING (is_admin());

-- ============================================================================
-- CLIENTS POLICIES
-- ============================================================================

-- All authenticated users can view clients
CREATE POLICY "Authenticated users can view clients"
ON clients FOR SELECT
USING (auth.role() = 'authenticated');

-- Managers and admins can insert clients
CREATE POLICY "Managers can insert clients"
ON clients FOR INSERT
WITH CHECK (is_admin_or_manager());

-- Managers and admins can update clients
CREATE POLICY "Managers can update clients"
ON clients FOR UPDATE
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- Only admins can delete clients
CREATE POLICY "Admins can delete clients"
ON clients FOR DELETE
USING (is_admin());

-- ============================================================================
-- COST CENTERS POLICIES
-- ============================================================================

-- All authenticated users can view cost centers
CREATE POLICY "Authenticated users can view cost centers"
ON cost_centers FOR SELECT
USING (auth.role() = 'authenticated');

-- Managers and admins can manage cost centers
CREATE POLICY "Managers can manage cost centers"
ON cost_centers FOR ALL
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- ============================================================================
-- ACTIVITY TYPES POLICIES
-- ============================================================================

-- All authenticated users can view activity types
CREATE POLICY "Authenticated users can view activity types"
ON activity_types FOR SELECT
USING (auth.role() = 'authenticated');

-- Users with permission can manage activity types
CREATE POLICY "Users with permission can manage activity types"
ON activity_types FOR ALL
USING (user_has_permission('can_edit_activity_types'))
WITH CHECK (user_has_permission('can_edit_activity_types'));

-- ============================================================================
-- XERO INVOICES POLICIES
-- ============================================================================

-- Users with can_view_financials can view invoices
CREATE POLICY "Users with can_view_financials can view invoices"
ON xero_invoices FOR SELECT
USING (user_has_permission('can_view_financials'));

-- Only admins can modify invoices (they're synced from Xero)
CREATE POLICY "Admins can modify invoices"
ON xero_invoices FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ============================================================================
-- PROJECT FILES POLICIES
-- ============================================================================

-- Users can view files for projects they have access to
CREATE POLICY "Users can view project files"
ON project_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_files.project_id
    AND (
      EXISTS (
        SELECT 1 FROM timesheets t
        WHERE t.project_id = p.id
        AND t.user_id = auth.uid()
      )
      OR is_admin_or_manager()
    )
  )
);

-- Users with can_edit_projects can upload files
CREATE POLICY "Users with permission can upload files"
ON project_files FOR INSERT
WITH CHECK (user_has_permission('can_edit_projects'));

-- Users with can_edit_projects can delete files
CREATE POLICY "Users with permission can delete files"
ON project_files FOR DELETE
USING (user_has_permission('can_edit_projects'));

-- ============================================================================
-- SETTINGS POLICIES
-- ============================================================================

-- Users can view their own settings
CREATE POLICY "Users can view own settings"
ON settings FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can manage their own settings
CREATE POLICY "Users can manage own settings"
ON settings FOR ALL
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Admins can view all settings
CREATE POLICY "Admins can view all settings"
ON settings FOR SELECT
USING (is_admin());

-- ============================================================================
-- ACTIVITY LOGS POLICIES
-- ============================================================================

-- Users can view their own activity logs
CREATE POLICY "Users can view own activity logs"
ON activity_logs FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all activity logs
CREATE POLICY "Admins can view all activity logs"
ON activity_logs FOR SELECT
USING (is_admin());

-- System can insert activity logs (via service role)
-- Note: This will be handled by backend with service role key

-- ============================================================================
-- PERMISSIONS POLICIES
-- ============================================================================

-- All authenticated users can view permissions
CREATE POLICY "Authenticated users can view permissions"
ON permissions FOR SELECT
USING (auth.role() = 'authenticated');

-- Only admins can manage permissions
CREATE POLICY "Admins can manage permissions"
ON permissions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ============================================================================
-- USER PERMISSIONS POLICIES
-- ============================================================================

-- Users can view their own permissions
CREATE POLICY "Users can view own permissions"
ON user_permissions FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all user permissions
CREATE POLICY "Admins can view all user permissions"
ON user_permissions FOR SELECT
USING (is_admin());

-- Only admins can manage user permissions
CREATE POLICY "Admins can manage user permissions"
ON user_permissions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ============================================================================
-- XERO TABLES POLICIES (Similar pattern for other Xero tables)
-- ============================================================================

-- Xero Quotes - same as invoices
CREATE POLICY "Users with can_view_financials can view quotes"
ON xero_quotes FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify quotes"
ON xero_quotes FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Xero Purchase Orders
CREATE POLICY "Users with can_view_financials can view purchase orders"
ON xero_purchase_orders FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify purchase orders"
ON xero_purchase_orders FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Xero Bills
CREATE POLICY "Users with can_view_financials can view bills"
ON xero_bills FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify bills"
ON xero_bills FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Xero Expenses
CREATE POLICY "Users with can_view_financials can view expenses"
ON xero_expenses FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify expenses"
ON xero_expenses FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Xero Payments
CREATE POLICY "Users with can_view_financials can view payments"
ON xero_payments FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify payments"
ON xero_payments FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Bank Transactions
CREATE POLICY "Users with can_view_financials can view bank transactions"
ON bank_transactions FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify bank transactions"
ON bank_transactions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Xero Credit Notes
CREATE POLICY "Users with can_view_financials can view credit notes"
ON xero_credit_notes FOR SELECT
USING (user_has_permission('can_view_financials'));

CREATE POLICY "Admins can modify credit notes"
ON xero_credit_notes FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Xero Tokens - only admins can view/modify
CREATE POLICY "Admins can manage xero tokens"
ON xero_tokens FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ============================================================================
-- SAFETY DOCUMENTS POLICIES
-- ============================================================================

-- Users can view safety documents for projects they have access to
CREATE POLICY "Users can view safety documents"
ON safety_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = safety_documents.project_id
    AND (
      EXISTS (
        SELECT 1 FROM timesheets t
        WHERE t.project_id = p.id
        AND t.user_id = auth.uid()
      )
      OR is_admin_or_manager()
    )
  )
);

-- Users with can_edit_projects can create safety documents
CREATE POLICY "Users with permission can create safety documents"
ON safety_documents FOR INSERT
WITH CHECK (user_has_permission('can_edit_projects'));

-- Users with can_edit_projects can update safety documents
CREATE POLICY "Users with permission can update safety documents"
ON safety_documents FOR UPDATE
USING (user_has_permission('can_edit_projects'))
WITH CHECK (user_has_permission('can_edit_projects'));

-- ============================================================================
-- BACKUPS POLICIES
-- ============================================================================

-- Users can view their own backups
CREATE POLICY "Users can view own backups"
ON backups FOR SELECT
USING (auth.uid() = created_by);

-- Admins can view all backups
CREATE POLICY "Admins can view all backups"
ON backups FOR SELECT
USING (is_admin());

-- Only admins can create backups
CREATE POLICY "Admins can create backups"
ON backups FOR INSERT
WITH CHECK (is_admin());
