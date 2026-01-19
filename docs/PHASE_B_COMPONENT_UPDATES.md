# Phase B Implementation Guide: Component Updates

This document provides the exact replacements needed for each component to use direct Supabase queries instead of the API client.

## Import Changes

**Before:**
```tsx
import { api } from '@/lib/api';
```

**After:**
```tsx
import { 
  getClients, 
  createClient,
  updateClient,
  deleteClient,
  // ... other query functions as needed
} from '@/lib/supabaseQueries';
import { getCurrentUser } from '@/lib/supabaseQueries';
import { supabase } from '@/lib/supabase';
```

---

## Component-by-Component Changes

### 1. Clients.tsx

**Changes to `loadClients` function:**

Before:
```tsx
const response = await api.getClients(params);
```

After:
```tsx
const user = await getCurrentUser();
const clients = await getClients({
  limit: limit,
  offset: (page - 1) * limit,
});
// Manual pagination handling (Supabase doesn't return total count)
setClients(clients);
setPagination({
  page,
  limit,
  total: clients.length > 0 ? clients.length * 2 : 0, // Approximation
  totalPages: Math.ceil(clients.length / limit),
  hasNext: clients.length === limit,
  hasPrev: page > 1,
});
```

**Changes to `handleDelete` function:**

Before:
```tsx
await api.deleteClient(client.id);
```

After:
```tsx
await deleteClient(client.id);
```

**Changes to create/update modals:**

Before:
```tsx
const response = await api.createClient(formData);
```

After:
```tsx
const user = await getCurrentUser();
const response = await createClient({
  ...formData,
  organization_id: user.id,
});
```

---

### 2. Projects.tsx

**Changes to `loadProjects` function:**

Before:
```tsx
const response = await api.getProjects({ limit: 100 });
const clientsResponse = await api.getClients({ limit: 100 });
```

After:
```tsx
const user = await getCurrentUser();
const projects = await getProjects({ limit: 100 });
const clients = await getClients({ limit: 100 });
```

**Changes to delete:**

Before:
```tsx
await api.deleteProject(project.id);
```

After:
```tsx
await deleteProject(project.id);
```

---

### 3. Timesheets.tsx

**Changes to `loadTimesheets` function:**

Before:
```tsx
const response = await api.getTimesheets(params);
const usersResponse = await api.getUsers();
```

After:
```tsx
const user = await getCurrentUser();
const timesheets = await getTimesheets({
  date_from: params.date_from,
  date_to: params.date_to,
  limit: params.limit,
});
const users = await getUsers();
```

**Changes to dependent data loads:**

Before:
```tsx
const projectsResponse = await api.getProjects({ client_id: clientId, limit: 100 });
const costCenterData = await api.getCostCenters(true, projectId);
const activityTypesResponse = await api.getActivityTypes(true);
```

After:
```tsx
const projects = await getProjects({ client_id: clientId, limit: 100 });
const costCenters = await getCostCenters(true, projectId);
const activityTypes = await getActivityTypes(true);
```

**Changes to delete:**

Before:
```tsx
await api.deleteTimesheet(entry.id);
await api.deleteTimesheetImage(viewingEntryId, index);
```

After:
```tsx
await deleteTimesheet(entry.id);
// Image deletion handled via Supabase Storage directly
```

---

### 4. ActivityTypes.tsx (Settings Tab)

This is NEW functionality - create a settings component that manages activity types directly.

```tsx
import { getActivityTypes, createActivityType, updateActivityType, deleteActivityType } from '@/lib/supabaseQueries';
import { getCurrentUser } from '@/lib/supabaseQueries';

export default function ActivityTypesSettings() {
  const [types, setTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', hourly_rate: 0 });

  useEffect(() => {
    loadActivityTypes();
  }, []);

  const loadActivityTypes = async () => {
    try {
      const activityTypes = await getActivityTypes(true); // org-specific only
      setTypes(activityTypes);
    } catch (error) {
      toast.error('Failed to load activity types');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const user = await getCurrentUser();
    try {
      if (editing) {
        await updateActivityType(editing.id, formData);
        toast.success('Activity type updated');
      } else {
        await createActivityType({
          ...formData,
          organization_id: user.id,
        });
        toast.success('Activity type created');
      }
      setFormData({ name: '', hourly_rate: 0 });
      setShowForm(false);
      setEditing(null);
      loadActivityTypes();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this activity type?')) return;
    try {
      await deleteActivityType(id);
      toast.success('Activity type deleted');
      loadActivityTypes();
    } catch (error) {
      toast.error(error.message);
    }
  };

  // JSX: Table showing activity types with Edit/Delete buttons
  // Form modal for create/edit
}
```

---

## Error Handling Patterns

All Supabase query functions throw errors. Wrap them consistently:

```tsx
try {
  const data = await getClients();
  setClients(data);
} catch (error: any) {
  console.error('Failed to load:', error);
  toast.error(error.message || 'Failed to load data');
} finally {
  setIsLoading(false);
}
```

---

## Pagination Notes

Supabase RLS queries don't return total counts by default. Options:

1. **Client-side pagination:** Load all data, paginate in JavaScript (fine for <1000 records)
2. **Manual count query:** Separate query to count records
3. **Approximate pagination:** Assume unlimited if results fill page

For now, use Option 1 - load all and paginate client-side.

```tsx
const allData = await getClients({ limit: 1000 });
const pageData = allData.slice((page - 1) * limit, page * limit);
const totalPages = Math.ceil(allData.length / limit);
```

---

## Testing Checklist

After updating each component:

- [ ] Load data without errors
- [ ] Create new record
- [ ] Edit existing record  
- [ ] Delete record
- [ ] Pagination works (if applicable)
- [ ] Search works (if applicable)
- [ ] Role-based access controls (RLS) enforced
  - Log in as different users, verify data isolation

---

## Remaining API Routes to Keep

These DO NOT need changes - they call backend APIs for complex operations:

- `/api/xero/*` - OAuth, token management (backend handles)
- `/api/ocr/*` - Document processing (backend handles)
- `/api/backups/*` - Backup scheduling (backend handles)
- `/api/settings` - Org settings with credentials (backend handles)

CRUD operations for clients/projects/timesheets/activity types should ALL move to direct Supabase.

---

## Migration Path (Low Risk)

1. Add new Supabase query functions (done: `supabaseQueries.ts`)
2. Keep old API client routes running as-is
3. Update components one at a time
4. Test after each component
5. Once all verified, deprecate API routes
6. Eventually delete old routes in backend cleanup phase

This allows rollback if issues arise.
