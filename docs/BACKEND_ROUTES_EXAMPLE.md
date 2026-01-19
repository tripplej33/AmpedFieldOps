# Backend Routes Example: Users Route Refactored

This document shows a complete refactored example of the users route using Supabase client instead of pg.

## File: `src/routes/users.ts` (Refactored Version)

```typescript
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { supabase } from '../db/supabase';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getDefaultPermissions } from '../lib/permissions';
import { log } from '../lib/logger';

const router = Router();

// Get all users (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id, 
        email, 
        name, 
        role, 
        avatar, 
        is_active, 
        created_at, 
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (error) {
      log('error', 'Failed to fetch users', { error: error.message });
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Get permissions for each user
    const usersWithPermissions = await Promise.all(
      users.map(async (user) => {
        const { data: userPerms, error: permError } = await supabase
          .from('user_permissions')
          .select('permission_id')
          .eq('user_id', user.id);

        if (permError) {
          log('warn', 'Failed to load permissions for user', { 
            userId: user.id, 
            error: permError.message 
          });
        }

        // Map permission IDs to names
        let permissions = [];
        if (userPerms && userPerms.length > 0) {
          const { data: permNames } = await supabase
            .from('permissions')
            .select('id, name')
            .in('id', userPerms.map((p) => p.permission_id));

          if (permNames) {
            permissions = permNames.map((p) => p.name);
          }
        }

        return {
          ...user,
          permissions
        };
      })
    );

    res.json(usersWithPermissions);
  } catch (error) {
    log('error', 'Unexpected error fetching users', { error });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin or manager can view others, users can view themselves)
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Authorization: admin/manager can view anyone, users can only view themselves
    if (req.user!.role === 'user' && req.user!.id !== req.params.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, avatar, is_active, created_at, updated_at')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {  // not found
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    // Get permissions
    const { data: userPerms } = await supabase
      .from('user_permissions')
      .select('permission_id')
      .eq('user_id', user.id);

    let permissions = [];
    if (userPerms && userPerms.length > 0) {
      const { data: permNames } = await supabase
        .from('permissions')
        .select('id, name')
        .in('id', userPerms.map((p) => p.permission_id));

      if (permNames) {
        permissions = permNames.map((p) => p.name);
      }
    }

    res.json({
      ...user,
      permissions
    });
  } catch (error) {
    log('error', 'Failed to fetch user', { error });
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (admin only)
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  body('role').isIn(['admin', 'manager', 'user']),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role } = req.body;

    try {
      // Check if email exists
      const { data: existing, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email,
          password_hash: passwordHash,
          name,
          role
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // Set default permissions based on role
      const defaultPermissions = getDefaultPermissions(role);
      
      // Get permission IDs for the role
      const { data: perms } = await supabase
        .from('permissions')
        .select('id, name')
        .in('name', defaultPermissions);

      if (perms) {
        const permEntries = perms.map((p) => ({
          user_id: newUser.id,
          permission_id: p.id
        }));

        const { error: permError } = await supabase
          .from('user_permissions')
          .insert(permEntries);

        if (permError) {
          log('warn', 'Failed to set default permissions', { error: permError });
        }
      }

      // Log activity
      // Note: activity_logs table needs to be migrated to Supabase
      // For now, we'll skip this, or you can keep using pg for legacy tables
      
      log('info', 'User created', { 
        userId: newUser.id, 
        email, 
        createdBy: req.user!.id 
      });

      res.status(201).json(newUser);
    } catch (error) {
      log('error', 'Failed to create user', { error });
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user (admin only)
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  body('name').optional().trim().notEmpty(),
  body('role').optional().isIn(['admin', 'manager', 'user']),
  body('is_active').optional().isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, role, is_active } = req.body;

    try {
      // Build update payload
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString()
      };

      if (name !== undefined) {
        updateData.name = name;
      }
      if (role !== undefined) {
        updateData.role = role;
      }
      if (is_active !== undefined) {
        updateData.is_active = is_active;
      }

      // Update user
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'User not found' });
        }
        throw error;
      }

      // If role changed, update permissions
      if (role !== undefined) {
        // Delete old permissions
        await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', req.params.id);

        // Add new permissions based on role
        const defaultPermissions = getDefaultPermissions(role);
        const { data: perms } = await supabase
          .from('permissions')
          .select('id, name')
          .in('name', defaultPermissions);

        if (perms) {
          const permEntries = perms.map((p) => ({
            user_id: req.params.id,
            permission_id: p.id
          }));

          await supabase
            .from('user_permissions')
            .insert(permEntries);
        }
      }

      log('info', 'User updated', { 
        userId: req.params.id, 
        updatedBy: req.user!.id,
        changes: Object.keys(updateData)
      });

      res.json(updatedUser);
    } catch (error) {
      log('error', 'Failed to update user', { error });
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Delete user (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own user account' });
    }

    // Delete user (cascades to user_permissions via FK)
    const { data: deletedUser, error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    log('info', 'User deleted', { 
      userId: req.params.id, 
      deletedBy: req.user!.id 
    });

    res.json({ message: 'User deleted', user: deletedUser });
  } catch (error) {
    log('error', 'Failed to delete user', { error });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update own profile (all authenticated users)
router.put('/profile/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, avatar } = req.body;

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) {
      updateData.name = name;
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json(user);
  } catch (error) {
    log('error', 'Failed to update profile', { error });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
```

---

## Key Changes from pg to Supabase

### 1. **Import Change**
```typescript
// Before
import { query } from '../db';

// After
import { supabase } from '../db/supabase';
```

### 2. **Query Style**
- No more raw SQL strings
- Use method chaining: `.select().eq().order()`
- Better type inference and error handling

### 3. **Error Handling**
- Always destructure `{ data, error }`
- Check `error` before using `data`
- Use error codes for specific handling (e.g., 'PGRST116' for not found)

### 4. **Nested Queries**
- Use dot notation for relations: `users(id, email)`
- Automatic JOIN expansion
- Cleaner than manual SQL JOINs

### 5. **Permissions Handling**
- Still load permissions separately (could optimize with nested select)
- Map permission IDs to names for response

---

## Migration Checklist

- [ ] Replace all `import { query }` with `import { supabase }`
- [ ] Convert SELECT queries to `.select().eq().single()`
- [ ] Convert INSERT to `.insert().select().single()`
- [ ] Convert UPDATE to `.update().eq().select().single()`
- [ ] Convert DELETE to `.delete().eq().select().single()`
- [ ] Update error handling for Supabase error format
- [ ] Update error codes (PGRST116 for not found)
- [ ] Test with frontend JWT tokens
- [ ] Verify RLS policies are respected
- [ ] Update integration tests

---

## Testing

```bash
# Get JWT from frontend localStorage
JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test GET /api/users
curl -H "Authorization: Bearer $JWT" \
  http://localhost:3001/api/users

# Test POST /api/users
curl -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User","role":"user"}' \
  http://localhost:3001/api/users

# Test PUT /api/users/:id
curl -X PUT -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}' \
  http://localhost:3001/api/users/123

# Test DELETE /api/users/:id
curl -X DELETE -H "Authorization: Bearer $JWT" \
  http://localhost:3001/api/users/123
```
