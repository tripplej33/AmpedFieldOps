# Backend Routes Refactor Guide (Item #3)

## Overview
This document guides the refactoring of backend routes from using the `pg` Node.js client to the Supabase JavaScript client. This enables better integration with Supabase's RLS policies and provides a unified API.

## Current State
- **Auth Middleware**: ✅ Complete (Item #2)
  - Verifies Supabase JWT tokens
  - Loads user profile and permissions from database
  - Falls back to legacy JWT for backward compatibility

- **Routes**: ⏳ In Progress (Item #3)
  - Currently use `pg` client with raw SQL queries
  - No support for Supabase RLS policies
  - Need to migrate to `@supabase/supabase-js` client

---

## Key Differences: pg vs Supabase Client

### Using pg client (OLD)
```typescript
import { query } from '../db';

// Raw SQL query
const result = await query(
  'SELECT id, email, name FROM users WHERE id = $1',
  [userId]
);

const user = result.rows[0];
```

### Using Supabase client (NEW)
```typescript
import { supabase } from '../db/supabase';

// Type-safe query with RLS
const { data, error } = await supabase
  .from('users')
  .select('id, email, name')
  .eq('id', userId)
  .single();

if (error) throw error;
const user = data;
```

---

## Benefits of Supabase Client

1. **RLS Enforcement**: Supabase client respects Row Level Security policies
2. **Type Safety**: Better error handling and response structures
3. **Real-time Support**: Built-in subscription support for real-time updates
4. **Consistency**: Uses same API as frontend, easier to understand
5. **Better Errors**: Clearer error messages and error codes

---

## Migration Patterns

### Pattern 1: SELECT Queries

#### Before (pg)
```typescript
const result = await query(
  'SELECT id, email, name, role FROM users WHERE id = $1 AND active = true',
  [userId]
);
const user = result.rows[0];
if (!user) {
  throw new Error('User not found');
}
```

#### After (Supabase)
```typescript
const { data: user, error } = await supabase
  .from('users')
  .select('id, email, name, role')
  .eq('id', userId)
  .eq('active', true)
  .single();

if (error) {
  throw new Error(`User not found: ${error.message}`);
}
```

---

### Pattern 2: INSERT Queries

#### Before (pg)
```typescript
const result = await query(
  'INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING *',
  [email, name, role]
);
const newUser = result.rows[0];
```

#### After (Supabase)
```typescript
const { data: newUser, error } = await supabase
  .from('users')
  .insert({ email, name, role })
  .select()
  .single();

if (error) {
  throw new Error(`Failed to create user: ${error.message}`);
}
```

---

### Pattern 3: UPDATE Queries

#### Before (pg)
```typescript
const result = await query(
  'UPDATE users SET name = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
  [name, role, userId]
);
const updatedUser = result.rows[0];
```

#### After (Supabase)
```typescript
const { data: updatedUser, error } = await supabase
  .from('users')
  .update({ name, role, updated_at: new Date().toISOString() })
  .eq('id', userId)
  .select()
  .single();

if (error) {
  throw new Error(`Failed to update user: ${error.message}`);
}
```

---

### Pattern 4: DELETE Queries

#### Before (pg)
```typescript
const result = await query(
  'DELETE FROM users WHERE id = $1 RETURNING *',
  [userId]
);
const deletedUser = result.rows[0];
```

#### After (Supabase)
```typescript
const { data: deletedUser, error } = await supabase
  .from('users')
  .delete()
  .eq('id', userId)
  .select()
  .single();

if (error) {
  throw new Error(`Failed to delete user: ${error.message}`);
}
```

---

### Pattern 5: JOIN Queries

#### Before (pg)
```typescript
const result = await query(`
  SELECT u.id, u.email, u.name, STRING_AGG(p.name, ',') as permissions
  FROM users u
  LEFT JOIN user_permissions up ON u.id = up.user_id
  LEFT JOIN permissions p ON up.permission_id = p.id
  WHERE u.id = $1
  GROUP BY u.id
`, [userId]);
```

#### After (Supabase)
```typescript
const { data: user, error } = await supabase
  .from('users')
  .select(`
    id, 
    email, 
    name,
    user_permissions(
      permissions(name)
    )
  `)
  .eq('id', userId)
  .single();

if (error) throw error;

// Transform nested permissions
const permissions = user.user_permissions
  .map((up: any) => up.permissions?.name)
  .filter(Boolean);
```

---

## Important Considerations

### RLS Policies
- **Authenticated vs Service Role**: The backend uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS
- This allows admin operations without RLS restrictions
- User-facing operations should still respect RLS on frontend
- Frontend uses ANON_KEY which respects RLS policies

### Backward Compatibility
- Keep `pg` client available during transition period
- Auth middleware supports both JWT types
- Can gradually migrate routes one at a time
- No need to migrate all routes at once

### Error Handling
- Supabase client returns `(data, error)` tuple
- Always check `error` before accessing `data`
- Error messages are more descriptive than raw SQL errors
- Use `error.code` for specific error types (e.g., 'PGRST102' for not found)

---

## Route Migration Priority

**High Priority** (Critical business logic):
1. Users management (`/api/users`)
2. Projects (`/api/projects`)
3. Timesheets (`/api/timesheets`)
4. Clients (`/api/clients`)

**Medium Priority** (Admin features):
5. Settings (`/api/settings`)
6. Permissions (`/api/permissions`)
7. Activity Types (`/api/activity-types`)

**Low Priority** (Integration/utility):
8. Xero (`/api/xero`)
9. Health (`/api/health`)
10. Search (`/api/search`)

---

## Testing the Refactored Routes

### Prerequisites
1. Ensure Supabase stack is running: `supabase start`
2. Verify auth middleware works with Supabase JWT
3. Test with frontend-generated tokens

### Test Procedure
1. Frontend signup → generates Supabase JWT
2. Copy JWT from browser localStorage
3. Test backend route with JWT:
   ```bash
   curl -H "Authorization: Bearer <JWT>" \
     http://localhost:3001/api/users
   ```
4. Verify user context loads correctly
5. Verify RLS policies are applied (if applicable)

---

## Migration Example: Users Route

See `BACKEND_ROUTES_EXAMPLE.md` for a complete refactored example of the users route.

---

## Next Steps

1. **Start with users.ts**: Most comprehensive example with CRUD operations
2. **Migrate one route at a time**: Test thoroughly before moving to next
3. **Update tests**: Ensure test suite covers new implementation
4. **Monitor performance**: Compare query performance before/after
5. **Remove pg dependency**: Once all routes migrated (optional, keep for backward compat)

---

## Resources

- [Supabase JavaScript Client Docs](https://supabase.com/docs/reference/javascript/select)
- [PostgreSQL RLS Concepts](https://supabase.com/docs/guides/auth/row-level-security)
- [Error Handling Patterns](https://supabase.com/docs/reference/javascript/error-handling)
- Backend auth middleware: `src/middleware/auth.ts`
- Supabase utilities: `src/db/supabase.ts`
