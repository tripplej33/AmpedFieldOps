import { getDefaultPermissions } from '../permissions';

describe('getDefaultPermissions', () => {
  describe('admin role', () => {
    it('should return all permissions including admin-specific ones', () => {
      const permissions = getDefaultPermissions('admin');
      
      // Base permissions
      expect(permissions).toContain('can_create_timesheets');
      expect(permissions).toContain('can_view_own_timesheets');
      expect(permissions).toContain('can_edit_own_timesheets');
      expect(permissions).toContain('can_delete_own_timesheets');
      expect(permissions).toContain('can_view_projects');
      expect(permissions).toContain('can_view_clients');
      expect(permissions).toContain('can_view_dashboard');
      
      // Admin-specific permissions
      expect(permissions).toContain('can_view_financials');
      expect(permissions).toContain('can_edit_projects');
      expect(permissions).toContain('can_manage_users');
      expect(permissions).toContain('can_sync_xero');
      expect(permissions).toContain('can_view_all_timesheets');
      expect(permissions).toContain('can_edit_activity_types');
      expect(permissions).toContain('can_manage_clients');
      expect(permissions).toContain('can_manage_cost_centers');
      expect(permissions).toContain('can_view_reports');
      expect(permissions).toContain('can_export_data');
      expect(permissions).toContain('can_manage_settings');
    });

    it('should have exactly 18 permissions for admin', () => {
      const permissions = getDefaultPermissions('admin');
      expect(permissions.length).toBe(18);
    });
  });

  describe('manager role', () => {
    it('should return base permissions plus manager-specific ones', () => {
      const permissions = getDefaultPermissions('manager');
      
      // Base permissions
      expect(permissions).toContain('can_create_timesheets');
      expect(permissions).toContain('can_view_own_timesheets');
      expect(permissions).toContain('can_edit_own_timesheets');
      expect(permissions).toContain('can_delete_own_timesheets');
      expect(permissions).toContain('can_view_projects');
      expect(permissions).toContain('can_view_clients');
      expect(permissions).toContain('can_view_dashboard');
      
      // Manager-specific permissions
      expect(permissions).toContain('can_view_financials');
      expect(permissions).toContain('can_edit_projects');
      expect(permissions).toContain('can_view_all_timesheets');
      expect(permissions).toContain('can_manage_clients');
      expect(permissions).toContain('can_view_reports');
      expect(permissions).toContain('can_export_data');
      
      // Should NOT have admin-only permissions
      expect(permissions).not.toContain('can_manage_users');
      expect(permissions).not.toContain('can_sync_xero');
      expect(permissions).not.toContain('can_edit_activity_types');
      expect(permissions).not.toContain('can_manage_cost_centers');
      expect(permissions).not.toContain('can_manage_settings');
    });

    it('should have exactly 13 permissions for manager', () => {
      const permissions = getDefaultPermissions('manager');
      expect(permissions.length).toBe(13);
    });
  });

  describe('user role', () => {
    it('should return only base permissions', () => {
      const permissions = getDefaultPermissions('user');
      
      // Base permissions
      expect(permissions).toContain('can_create_timesheets');
      expect(permissions).toContain('can_view_own_timesheets');
      expect(permissions).toContain('can_edit_own_timesheets');
      expect(permissions).toContain('can_delete_own_timesheets');
      expect(permissions).toContain('can_view_projects');
      expect(permissions).toContain('can_view_clients');
      expect(permissions).toContain('can_view_dashboard');
      
      // Should NOT have manager/admin permissions
      expect(permissions).not.toContain('can_view_financials');
      expect(permissions).not.toContain('can_edit_projects');
      expect(permissions).not.toContain('can_manage_users');
      expect(permissions).not.toContain('can_sync_xero');
      expect(permissions).not.toContain('can_view_all_timesheets');
    });

    it('should have exactly 7 permissions for user', () => {
      const permissions = getDefaultPermissions('user');
      expect(permissions.length).toBe(7);
    });
  });

  describe('invalid role', () => {
    it('should return base permissions for unknown role', () => {
      const permissions = getDefaultPermissions('invalid-role');
      
      expect(permissions).toContain('can_create_timesheets');
      expect(permissions).toContain('can_view_own_timesheets');
      expect(permissions.length).toBe(7);
    });

    it('should return base permissions for empty string', () => {
      const permissions = getDefaultPermissions('');
      
      expect(permissions.length).toBe(7);
    });
  });

  describe('permission uniqueness', () => {
    it('should not have duplicate permissions for admin', () => {
      const permissions = getDefaultPermissions('admin');
      const uniquePermissions = new Set(permissions);
      expect(permissions.length).toBe(uniquePermissions.size);
    });

    it('should not have duplicate permissions for manager', () => {
      const permissions = getDefaultPermissions('manager');
      const uniquePermissions = new Set(permissions);
      expect(permissions.length).toBe(uniquePermissions.size);
    });

    it('should not have duplicate permissions for user', () => {
      const permissions = getDefaultPermissions('user');
      const uniquePermissions = new Set(permissions);
      expect(permissions.length).toBe(uniquePermissions.size);
    });
  });
});
