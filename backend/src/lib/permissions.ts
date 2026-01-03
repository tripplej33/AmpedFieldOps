/**
 * Get default permissions for a role
 * This function is shared across auth and user management routes
 */
export function getDefaultPermissions(role: string): string[] {
  const basePermissions = [
    'can_create_timesheets',
    'can_view_own_timesheets',
    'can_edit_own_timesheets',
    'can_delete_own_timesheets',
    'can_view_projects',
    'can_view_clients',
    'can_view_dashboard'
  ];
  
  if (role === 'admin') {
    return [
      ...basePermissions,
      'can_view_financials',
      'can_edit_projects',
      'can_manage_users',
      'can_sync_xero',
      'can_view_all_timesheets',
      'can_edit_activity_types',
      'can_manage_clients',
      'can_manage_cost_centers',
      'can_view_reports',
      'can_export_data',
      'can_manage_settings'
    ];
  }
  
  if (role === 'manager') {
    return [
      ...basePermissions,
      'can_view_financials',
      'can_edit_projects',
      'can_view_all_timesheets',
      'can_manage_clients',
      'can_view_reports',
      'can_export_data'
    ];
  }
  
  return basePermissions;
}
