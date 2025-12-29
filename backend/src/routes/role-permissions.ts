import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Define all available permissions with descriptions
const ALL_PERMISSIONS = [
  { key: 'can_view_financials', label: 'View Financials', description: 'Access invoices and quotes' },
  { key: 'can_edit_projects', label: 'Manage Projects', description: 'Create/edit projects' },
  { key: 'can_manage_users', label: 'User Administration', description: 'User administration' },
  { key: 'can_sync_xero', label: 'Xero Integration', description: 'Xero integration control' },
  { key: 'can_view_all_timesheets', label: 'View All Timesheets', description: 'See all team timesheets' },
  { key: 'can_edit_activity_types', label: 'Configure Activity Types', description: 'Configure activity types' },
  { key: 'can_manage_clients', label: 'Client Administration', description: 'Client administration' },
  { key: 'can_manage_cost_centers', label: 'Cost Center Setup', description: 'Cost center setup' },
  { key: 'can_view_reports', label: 'View Reports', description: 'Access reports section' },
  { key: 'can_export_data', label: 'Export Data', description: 'Export data to CSV/Excel' },
  { key: 'can_create_timesheets', label: 'Create Timesheets', description: 'Create new timesheet entries' },
  { key: 'can_view_own_timesheets', label: 'View Own Timesheets', description: 'View own timesheet entries' },
  { key: 'can_edit_own_timesheets', label: 'Edit Own Timesheets', description: 'Edit own timesheet entries' },
  { key: 'can_delete_own_timesheets', label: 'Delete Own Timesheets', description: 'Delete own timesheet entries' },
  { key: 'can_view_projects', label: 'View Projects', description: 'View project details' },
  { key: 'can_view_clients', label: 'View Clients', description: 'View client information' },
  { key: 'can_manage_settings', label: 'Manage Settings', description: 'Access system settings' },
  { key: 'can_view_dashboard', label: 'View Dashboard', description: 'Access dashboard' },
];

// Get role-based permissions (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Get all permissions from database
    const permResult = await query('SELECT key, label, description FROM permissions WHERE is_active = true ORDER BY key');
    const dbPermissions = permResult.rows;
    
    // Merge with predefined permissions (database takes precedence)
    const permissions = ALL_PERMISSIONS.map(perm => {
      const dbPerm = dbPermissions.find(p => p.key === perm.key);
      return dbPerm || perm;
    });

    // Get default permissions for each role
    const roles = ['admin', 'manager', 'user'];
    const rolePermissions: Record<string, Record<string, boolean>> = {};

    for (const role of roles) {
      // Get all users with this role
      const usersResult = await query(
        'SELECT id FROM users WHERE role = $1 LIMIT 1',
        [role]
      );

      if (usersResult.rows.length > 0) {
        // Get permissions for a user with this role (as a sample)
        const userId = usersResult.rows[0].id;
        const userPermsResult = await query(
          'SELECT permission, granted FROM user_permissions WHERE user_id = $1',
          [userId]
        );

        // Build permission map
        const permMap: Record<string, boolean> = {};
        userPermsResult.rows.forEach((row: any) => {
          permMap[row.permission] = row.granted;
        });

        // Set defaults based on role
        permissions.forEach(perm => {
          if (!permMap.hasOwnProperty(perm.key)) {
            // Use default permissions based on role
            if (role === 'admin') {
              permMap[perm.key] = true; // Admins have all permissions
            } else if (role === 'manager') {
              permMap[perm.key] = [
                'can_view_financials',
                'can_edit_projects',
                'can_view_all_timesheets',
                'can_manage_clients',
                'can_view_reports',
                'can_create_timesheets',
                'can_view_own_timesheets',
                'can_edit_own_timesheets',
                'can_view_projects',
                'can_view_clients',
                'can_view_dashboard'
              ].includes(perm.key);
            } else {
              permMap[perm.key] = [
                'can_create_timesheets',
                'can_view_own_timesheets',
                'can_edit_own_timesheets',
                'can_view_projects',
                'can_view_clients',
                'can_view_dashboard'
              ].includes(perm.key);
            }
          }
        });

        rolePermissions[role] = permMap;
      } else {
        // No users with this role, use defaults
        const permMap: Record<string, boolean> = {};
        permissions.forEach(perm => {
          if (role === 'admin') {
            permMap[perm.key] = true;
          } else if (role === 'manager') {
            permMap[perm.key] = [
              'can_view_financials',
              'can_edit_projects',
              'can_view_all_timesheets',
              'can_manage_clients',
              'can_view_reports',
              'can_create_timesheets',
              'can_view_own_timesheets',
              'can_edit_own_timesheets',
              'can_view_projects',
              'can_view_clients',
              'can_view_dashboard'
            ].includes(perm.key);
          } else {
            permMap[perm.key] = [
              'can_create_timesheets',
              'can_view_own_timesheets',
              'can_edit_own_timesheets',
              'can_view_projects',
              'can_view_clients',
              'can_view_dashboard'
            ].includes(perm.key);
          }
        });
        rolePermissions[role] = permMap;
      }
    }

    res.json({
      permissions,
      rolePermissions
    });
  } catch (error) {
    console.error('Failed to fetch role permissions:', error);
    res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
});

// Update role-based permissions (admin only)
router.put('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { rolePermissions } = req.body;

    if (!rolePermissions || typeof rolePermissions !== 'object') {
      return res.status(400).json({ error: 'Invalid role permissions data' });
    }

    // Update permissions for all users with each role
    for (const [role, permissions] of Object.entries(rolePermissions)) {
      if (!['admin', 'manager', 'user'].includes(role)) {
        continue;
      }

      // Get all users with this role
      const usersResult = await query('SELECT id FROM users WHERE role = $1', [role]);

      for (const user of usersResult.rows) {
        // Delete existing permissions
        await query('DELETE FROM user_permissions WHERE user_id = $1', [user.id]);

        // Insert new permissions
        const permMap = permissions as Record<string, boolean>;
        for (const [permission, granted] of Object.entries(permMap)) {
          if (granted) {
            await query(
              'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, true)',
              [user.id, permission]
            );
          }
        }
      }
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, details) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'update_role_permissions', 'role', JSON.stringify({ rolePermissions })]
    );

    res.json({ message: 'Role permissions updated successfully' });
  } catch (error) {
    console.error('Failed to update role permissions:', error);
    res.status(500).json({ error: 'Failed to update role permissions' });
  }
});

export default router;

