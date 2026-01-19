/**
 * Direct Supabase Query Helpers
 * These replace API calls with direct RLS-protected queries
 * Frontend queries Supabase directly using user's session token
 */

import { supabase } from './supabase';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not authenticated');
  }
  return data.user.id;
}

// ========== CLIENTS ==========

export async function getClients(options?: QueryOptions & { client_id?: string }) {
  let query = supabase.from('clients').select('*');

  if (options?.client_id) {
    query = query.eq('id', options.client_id);
  }

  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? true });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, (options.offset + (options.limit || 10)) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return data || [];
}

export async function createClient(client: Record<string, any>) {
  // Map UI fields to actual schema columns
  // NOTE: clients table does NOT have client_type column - removed from payload
  const payload: Record<string, any> = {
    name: client.name,
    contact_name: client.contact_name,
    email: client.email,
    phone: client.phone,
    address: client.address ?? client.location ?? '', // UI uses `location`, default to empty string
    description: client.description ?? client.notes ?? '', // UI uses `notes`
    is_active: client.is_active ?? true,
    created_by: await currentUserId(),
    company_name: client.company_name || 'Default', // Required column
  };

  console.log('[createClient] Inserting payload:', payload);

  const { data, error } = await supabase
    .from('clients')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[createClient] Error:', error);
    throw new Error(`Failed to create client: ${error.message}`);
  }

  console.log('[createClient] Success, returned data:', data);
  return data;
}

export async function updateClient(
  id: string,
  updates: Record<string, any>
) {
  const payload: Record<string, any> = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.contact_name !== undefined ? { contact_name: updates.contact_name } : {}),
    ...(updates.email !== undefined ? { email: updates.email } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
    ...(updates.address !== undefined || updates.location !== undefined
      ? { address: updates.address ?? updates.location }
      : {}),
    ...(updates.description !== undefined || updates.notes !== undefined
      ? { description: updates.description ?? updates.notes }
      : {}),
    ...(updates.is_active !== undefined ? { is_active: updates.is_active } : {}),
  };
  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update client: ${error.message}`);
  return data;
}

export async function deleteClient(id: string) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete client: ${error.message}`);
}

// ========== PROJECTS ==========

export async function getProjects(options?: QueryOptions & { client_id?: string }) {
  let query = supabase.from('projects').select('*');

  if (options?.client_id) {
    query = query.eq('client_id', options.client_id);
  }

  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? true });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, (options.offset + (options.limit || 10)) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return data || [];
}

export async function createProject(project: Record<string, any>) {
  const payload: Record<string, any> = {
    name: project.name,
    client_id: project.client_id,
    description: project.description ?? '',
    budget: project.budget ? parseFloat(project.budget) : 0, // Ensure numeric type
    status: project.status ?? 'active',
    start_date: project.start_date ?? null,
    end_date: project.end_date ?? null,
    hourly_rate: project.hourly_rate ? parseFloat(project.hourly_rate) : 0,
    is_active: project.is_active ?? true,
    created_by: await currentUserId(),
    company_name: project.company_name || 'Default', // Required column
  };

  console.log('[createProject] Inserting payload:', payload);

  const { data, error } = await supabase
    .from('projects')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[createProject] Error:', error);
    throw new Error(`Failed to create project: ${error.message}`);
  }

  console.log('[createProject] Success, returned data:', data);
  return data;
}

export async function updateProject(
  id: string,
  updates: Record<string, any>
) {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update project: ${error.message}`);
  return data;
}

export async function deleteProject(id: string) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete project: ${error.message}`);
}

// ========== TIMESHEETS ==========

export async function getTimesheets(options?: QueryOptions & {
  date_from?: string;
  date_to?: string;
  user_id?: string;
}) {
  let query = supabase.from('timesheets').select('*');

  if (options?.date_from) {
    query = query.gte('entry_date', options.date_from); // Use entry_date, not date
  }

  if (options?.date_to) {
    query = query.lte('entry_date', options.date_to); // Use entry_date, not date
  }

  if (options?.user_id) {
    query = query.eq('user_id', options.user_id);
  }

  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? true });
  } else {
    query = query.order('entry_date', { ascending: false }); // Use entry_date, not date
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, (options.offset + (options.limit || 100)) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch timesheets: ${error.message}`);
  return data || [];
}

export async function createTimesheet(timesheet: Record<string, any>) {
  const payload: Record<string, any> = {
    entry_date: timesheet.entry_date ?? timesheet.date, // UI uses `date`
    user_id: timesheet.user_id ?? await currentUserId(),
    project_id: timesheet.project_id,
    activity_type_id: timesheet.activity_type_id,
    cost_center_id: timesheet.cost_center_id,
    hours: timesheet.hours,
    description: timesheet.description ?? timesheet.notes,
    is_billable: timesheet.is_billable ?? true,
    is_submitted: timesheet.is_submitted ?? false,
    is_approved: timesheet.is_approved ?? false,
  };
  const { data, error } = await supabase
    .from('timesheets')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(`Failed to create timesheet: ${error.message}`);
  return data;
}

export async function updateTimesheet(
  id: string,
  updates: Record<string, any>
) {
  const payload: Record<string, any> = {
    ...(updates.entry_date !== undefined || updates.date !== undefined
      ? { entry_date: updates.entry_date ?? updates.date }
      : {}),
    ...(updates.user_id !== undefined ? { user_id: updates.user_id } : {}),
    ...(updates.project_id !== undefined ? { project_id: updates.project_id } : {}),
    ...(updates.activity_type_id !== undefined ? { activity_type_id: updates.activity_type_id } : {}),
    ...(updates.cost_center_id !== undefined ? { cost_center_id: updates.cost_center_id } : {}),
    ...(updates.hours !== undefined ? { hours: updates.hours } : {}),
    ...(updates.description !== undefined || updates.notes !== undefined
      ? { description: updates.description ?? updates.notes }
      : {}),
    ...(updates.is_billable !== undefined ? { is_billable: updates.is_billable } : {}),
  };
  const { data, error } = await supabase
    .from('timesheets')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update timesheet: ${error.message}`);
  return data;
}

export async function deleteTimesheet(id: string) {
  const { error } = await supabase
    .from('timesheets')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete timesheet: ${error.message}`);
}

// ========== ACTIVITY TYPES ==========

export async function getActivityTypes() {
  const { data, error } = await supabase
    .from('activity_types')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch activity types: ${error.message}`);
  return data || [];
}

export async function createActivityType(type: Record<string, any>) {
  const payload: Record<string, any> = {
    name: type.name,
    description: type.description, // optional
    hourly_rate: type.hourly_rate,
    company_name: type.company_name || 'Default', // Required column
    is_active: type.is_active ?? true,
    is_billable: type.is_billable ?? true,
  };
  const { data, error } = await supabase
    .from('activity_types')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(`Failed to create activity type: ${error.message}`);
  return data;
}

export async function updateActivityType(
  id: string,
  updates: Record<string, any>
) {
  const payload: Record<string, any> = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.hourly_rate !== undefined ? { hourly_rate: updates.hourly_rate } : {}),
    ...(updates.is_active !== undefined ? { is_active: updates.is_active } : {}),
    ...(updates.is_billable !== undefined ? { is_billable: updates.is_billable } : {}),
  };
  const { data, error } = await supabase
    .from('activity_types')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update activity type: ${error.message}`);
  return data;
}

export async function deleteActivityType(id: string) {
  const { error } = await supabase
    .from('activity_types')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete activity type: ${error.message}`);
}

// ========== COST CENTERS ==========

export async function getCostCenters(orgOnly?: boolean, projectId?: string) {
  let query = supabase.from('cost_centers').select('*');

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (!orgOnly) {
    query = query.or('organization_id.is.null,organization_id.not.is.null');
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch cost centers: ${error.message}`);
  return data || [];
}

export async function createCostCenter(center: {
  name: string;
  code?: string;
  project_id?: string;
  description?: string;
  is_active?: boolean;
}) {
  const payload: Record<string, any> = {
    name: center.name,
    code: center.code,
    description: center.description,
    is_active: center.is_active ?? true,
    company_name: 'Default', // Required column
    organization_id: center.organization_id ?? await currentUserId(),
  };
  const { data, error } = await supabase
    .from('cost_centers')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(`Failed to create cost center: ${error.message}`);
  return data;
}

export async function updateCostCenter(
  id: string,
  updates: Record<string, any>
) {
  const { data, error } = await supabase
    .from('cost_centers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update cost center: ${error.message}`);
  return data;
}

export async function deleteCostCenter(id: string) {
  const { error } = await supabase
    .from('cost_centers')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete cost center: ${error.message}`);
}

// ========== USERS ==========

export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch users: ${error.message}`);
  return data || [];
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Failed to get current user: ${error.message}`);
  return data.user;
}
