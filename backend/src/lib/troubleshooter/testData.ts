import bcrypt from 'bcryptjs';
import { query } from '../../db';
import { env } from '../../config/env';
import jwt from 'jsonwebtoken';

const TEST_PREFIX = 'TEST_';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  role: 'admin' | 'manager' | 'user';
}

/**
 * Create test users for different roles
 */
export async function createTestUsers(): Promise<TestUser[]> {
  const users: TestUser[] = [];
  const roles: Array<'admin' | 'manager' | 'user'> = ['admin', 'manager', 'user'];

  for (const role of roles) {
    const email = `${TEST_PREFIX}${role}@test.com`;
    const password = 'TestPassword123!';
    const name = `Test ${role}`;

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      // Delete existing test user
      await query('DELETE FROM users WHERE email = $1', [email]);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, name, role`,
      [email, passwordHash, name, role]
    );

    const user = result.rows[0];

    // Set default permissions based on role
    const defaultPermissions = getDefaultPermissions(role);
    for (const permission of defaultPermissions) {
      await query(
        'INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, true) ON CONFLICT DO NOTHING',
        [user.id, permission]
      );
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    users.push({
      id: user.id,
      email: user.email,
      password,
      token,
      role,
    });
  }

  return users;
}

/**
 * Clean up test users
 */
export async function cleanupTestUsers(): Promise<void> {
  await query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_PREFIX}%`]);
}

/**
 * Clean up test data by prefix
 */
export async function cleanupTestData(): Promise<void> {
  // Clean up in reverse order of dependencies
  await query(`DELETE FROM timesheets WHERE notes LIKE $1`, [`%${TEST_PREFIX}%`]);
  await query(`DELETE FROM projects WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM clients WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM activity_types WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${TEST_PREFIX}%`]);
  await cleanupTestUsers();
}

/**
 * Get default permissions for a role
 */
function getDefaultPermissions(role: string): string[] {
  const permissions: Record<string, string[]> = {
    admin: [
      'can_view_financials',
      'can_edit_projects',
      'can_manage_users',
      'can_sync_xero',
      'can_view_all_timesheets',
      'can_edit_activity_types',
      'can_manage_clients',
      'can_manage_cost_centers',
    ],
    manager: [
      'can_view_financials',
      'can_edit_projects',
      'can_view_all_timesheets',
      'can_manage_clients',
    ],
    user: [],
  };

  return permissions[role] || [];
}

/**
 * Create a test client
 */
export async function createTestClient(name?: string): Promise<string> {
  const clientName = name || `${TEST_PREFIX}Client ${Date.now()}`;
  const result = await query(
    `INSERT INTO clients (name, contact_name, email, phone, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [clientName, 'Test Contact', 'test@example.com', '1234567890', 'active']
  );
  return result.rows[0].id;
}

/**
 * Create a test project
 */
export async function createTestProject(clientId: string, name?: string): Promise<string> {
  const projectName = name || `${TEST_PREFIX}Project ${Date.now()}`;
  const projectCode = `${TEST_PREFIX}PROJ${Date.now()}`;
  const result = await query(
    `INSERT INTO projects (code, name, client_id, status, budget)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [projectCode, projectName, clientId, 'in-progress', 10000]
  );
  return result.rows[0].id;
}

/**
 * Create a test activity type
 */
export async function createTestActivityType(name?: string): Promise<string> {
  const activityName = name || `${TEST_PREFIX}Activity ${Date.now()}`;
  const result = await query(
    `INSERT INTO activity_types (name, icon, color, hourly_rate, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [activityName, 'Wrench', 'bg-electric/20 border-electric text-electric', 50, true]
  );
  return result.rows[0].id;
}

/**
 * Create a test cost center
 */
export async function createTestCostCenter(code?: string, name?: string): Promise<string> {
  const costCenterCode = code || `${TEST_PREFIX}CC${Date.now()}`;
  const costCenterName = name || `${TEST_PREFIX}Cost Center ${Date.now()}`;
  const result = await query(
    `INSERT INTO cost_centers (code, name, budget, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [costCenterCode, costCenterName, 50000, true]
  );
  return result.rows[0].id;
}

