/**
 * Supabase Query Helpers
 * 
 * This module provides helper functions for common Supabase query patterns
 * including pagination, filtering, and complex queries.
 */

import { supabase } from './supabase';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SortParams {
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Apply pagination to a Supabase query
 */
export async function paginateQuery<T>(
  query: PostgrestFilterBuilder<any, T, any>,
  params: PaginationParams = {}
): Promise<PaginatedResponse<T>> {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  // Get total count
  const { count, error: countError } = await query.select('*', { count: 'exact', head: true });
  
  if (countError) {
    throw new Error(`Failed to get count: ${countError.message}`);
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  // Get paginated data
  const { data, error } = await query
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch data: ${error.message}`);
  }

  return {
    data: data || [],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Apply sorting to a query
 */
export function applySort<T>(
  query: PostgrestFilterBuilder<any, T, any>,
  params: SortParams,
  defaultSort: string = 'created_at',
  defaultOrder: 'asc' | 'desc' = 'desc'
) {
  const sort = params.sort || defaultSort;
  const order = params.order || defaultOrder;
  return query.order(sort, { ascending: order === 'asc' });
}

/**
 * Apply text search filter
 */
export function applyTextSearch(
  query: PostgrestFilterBuilder<any, any, any>,
  search: string,
  columns: string[]
) {
  if (!search) return query;

  // Use Supabase full-text search or ILIKE pattern
  // For now, use OR conditions with ILIKE
  const conditions = columns.map(col => `${col}.ilike.%${search}%`).join(',');
  return query.or(conditions);
}

/**
 * Projects Queries
 */
export const projectsQueries = {
  async getAll(params?: {
    status?: string;
    client_id?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    let query = supabase
      .from('projects')
      .select(`
        *,
        clients:client_id (
          id,
          name
        )
      `);

    // Apply filters
    if (params?.status) {
      query = query.eq('status', params.status);
    }

    if (params?.client_id) {
      query = query.eq('client_id', params.client_id);
    }

    // Apply text search
    if (params?.search) {
      query = query.or(`name.ilike.%${params.search}%,code.ilike.%${params.search}%,description.ilike.%${params.search}%`);
    }

    // Apply sorting
    query = applySort(query, {
      sort: params?.sort || 'created_at',
      order: params?.order || 'desc',
    });

    // Apply pagination
    return paginateQuery(query, {
      page: params?.page,
      limit: params?.limit,
    });
  },

  async getById(id: string) {
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients:client_id (
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch project: ${error.message}`);
    }

    // Get cost centers
    const { data: costCenters } = await supabase
      .from('project_cost_centers')
      .select(`
        cost_centers:cost_center_id (
          *
        )
      `)
      .eq('project_id', id);

    // Get recent timesheets (limit 10)
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select(`
        *,
        user_profiles:user_id (
          name
        ),
        activity_types:activity_type_id (
          name
        )
      `)
      .eq('project_id', id)
      .order('date', { ascending: false })
      .limit(10);

    return {
      ...project,
      cost_centers: costCenters?.map(cc => cc.cost_centers).filter(Boolean) || [],
      timesheets: timesheets || [],
    };
  },

  async create(data: {
    name: string;
    client_id?: string;
    code?: string;
    status?: string;
    budget?: number;
    description?: string;
    start_date?: string;
    end_date?: string;
    cost_center_ids?: string[];
  }) {
    // Generate project code if not provided
    let code = data.code;
    if (!code) {
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .like('code', `PROJ-${year}-%`);
      
      const countNum = (count || 0) + 1;
      code = `PROJ-${year}-${String(countNum).padStart(4, '0')}`;
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        name: data.name,
        client_id: data.client_id,
        code,
        status: data.status || 'quoted',
        budget: data.budget || 0,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }

    // Add cost centers if provided
    if (data.cost_center_ids && data.cost_center_ids.length > 0) {
      const costCenterInserts = data.cost_center_ids.map(ccId => ({
        project_id: project.id,
        cost_center_id: ccId,
      }));

      await supabase
        .from('project_cost_centers')
        .insert(costCenterInserts);
    }

    return project;
  },

  async update(id: string, data: Partial<{
    name: string;
    client_id: string;
    status: string;
    budget: number;
    actual_cost: number;
    description: string;
    start_date: string;
    end_date: string;
    cost_center_ids: string[];
  }>) {
    const { cost_center_ids, ...updateData } = data;

    const { data: project, error } = await supabase
      .from('projects')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }

    if (!project) {
      throw new Error('Project not found');
    }

    // Update cost centers if provided
    if (cost_center_ids !== undefined) {
      // Delete existing associations
      await supabase
        .from('project_cost_centers')
        .delete()
        .eq('project_id', id);

      // Insert new associations
      if (cost_center_ids.length > 0) {
        const costCenterInserts = cost_center_ids.map(ccId => ({
          project_id: id,
          cost_center_id: ccId,
        }));

        await supabase
          .from('project_cost_centers')
          .insert(costCenterInserts);
      }
    }

    return project;
  },

  async delete(id: string) {
    // Check for related timesheets
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('id')
      .eq('project_id', id)
      .limit(1);

    if (timesheets && timesheets.length > 0) {
      throw new Error('Cannot delete project with existing timesheets. Deactivate instead.');
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }

    return { message: 'Project deleted' };
  },
};

/**
 * Clients Queries
 */
export const clientsQueries = {
  async getAll(params?: {
    status?: string;
    client_type?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    let query = supabase.from('clients').select('*');

    // Apply filters
    if (params?.status) {
      query = query.eq('status', params.status);
    }

    if (params?.client_type) {
      if (params.client_type === 'customer') {
        query = query.in('client_type', ['customer', 'both']);
      } else if (params.client_type === 'supplier') {
        query = query.in('client_type', ['supplier', 'both']);
      }
    }

    // Apply text search
    if (params?.search) {
      query = query.or(`name.ilike.%${params.search}%,contact_name.ilike.%${params.search}%,address.ilike.%${params.search}%`);
    }

    // Apply sorting
    query = applySort(query, {
      sort: params?.sort || 'name',
      order: params?.order || 'asc',
    });

    // Apply pagination
    return paginateQuery(query, {
      page: params?.page,
      limit: params?.limit,
    });
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch client: ${error.message}`);
    }

    // Get related projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, code, name, status, budget, actual_cost')
      .eq('client_id', id)
      .order('created_at', { ascending: false });

    return {
      ...data,
      projects: projects || [],
    };
  },

  async create(data: {
    name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    location?: string;
    billing_address?: string;
    billing_email?: string;
    client_type?: 'customer' | 'supplier' | 'both';
    notes?: string;
  }) {
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        ...data,
        client_type: data.client_type || 'customer',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create client: ${error.message}`);
    }

    return client;
  },

  async update(id: string, data: Partial<{
    name: string;
    contact_name: string;
    email: string;
    phone: string;
    address: string;
    location: string;
    billing_address: string;
    billing_email: string;
    client_type: 'customer' | 'supplier' | 'both';
    status: string;
    notes: string;
    xero_contact_id: string;
  }>) {
    const { data: client, error } = await supabase
      .from('clients')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update client: ${error.message}`);
    }

    if (!client) {
      throw new Error('Client not found');
    }

    return client;
  },

  async delete(id: string) {
    // Check for related projects first
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .eq('client_id', id)
      .limit(1);

    if (projectsError) {
      throw new Error(`Failed to check related projects: ${projectsError.message}`);
    }

    if (projects && projects.length > 0) {
      throw new Error('Cannot delete client with existing projects. Deactivate instead.');
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete client: ${error.message}`);
    }

    return { message: 'Client deleted' };
  },
};

/**
 * Timesheets Queries
 * Note: RLS policies will automatically filter based on user permissions
 */
export const timesheetsQueries = {
  async getAll(params?: {
    user_id?: string;
    project_id?: string;
    client_id?: string;
    date_from?: string;
    date_to?: string;
    cost_center_id?: string;
    billing_status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<any>> {
    let query = supabase
      .from('timesheets')
      .select(`
        *,
        user_profiles:user_id (
          id,
          name
        ),
        projects:project_id (
          id,
          name,
          code
        ),
        clients:client_id (
          id,
          name
        ),
        activity_types:activity_type_id (
          id,
          name,
          icon,
          color
        ),
        cost_centers:cost_center_id (
          id,
          code,
          name
        )
      `);

    // Apply filters
    if (params?.user_id) {
      query = query.eq('user_id', params.user_id);
    }

    if (params?.project_id) {
      query = query.eq('project_id', params.project_id);
    }

    if (params?.client_id) {
      query = query.eq('client_id', params.client_id);
    }

    if (params?.cost_center_id) {
      query = query.eq('cost_center_id', params.cost_center_id);
    }

    if (params?.date_from) {
      query = query.gte('date', params.date_from);
    }

    if (params?.date_to) {
      query = query.lte('date', params.date_to);
    }

    if (params?.billing_status) {
      query = query.eq('billing_status', params.billing_status);
    }

    // Apply sorting (default: date DESC)
    query = query.order('date', { ascending: false });
    query = query.order('created_at', { ascending: false });

    // Apply pagination
    return paginateQuery(query, {
      page: params?.page,
      limit: params?.limit,
    });
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        user_profiles:user_id (
          id,
          name
        ),
        projects:project_id (
          id,
          name,
          code
        ),
        clients:client_id (
          id,
          name
        ),
        activity_types:activity_type_id (
          id,
          name,
          icon,
          color
        ),
        cost_centers:cost_center_id (
          id,
          code,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch timesheet: ${error.message}`);
    }

    return data;
  },

  async create(data: {
    user_id?: string;
    project_id: string;
    client_id?: string;
    activity_type_id: string;
    cost_center_id: string;
    date: string;
    hours: number;
    notes?: string;
    location?: string;
    image_urls?: string[];
  }) {
    // Get current user if user_id not provided
    let userId = data.user_id;
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      userId = user.id;
    }

    const { data: timesheet, error } = await supabase
      .from('timesheets')
      .insert({
        user_id: userId,
        project_id: data.project_id,
        client_id: data.client_id,
        activity_type_id: data.activity_type_id,
        cost_center_id: data.cost_center_id,
        date: data.date,
        hours: data.hours,
        notes: data.notes,
        location: data.location,
        image_urls: data.image_urls || [],
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create timesheet: ${error.message}`);
    }

    return timesheet;
  },

  async update(id: string, data: Partial<{
    project_id: string;
    client_id: string;
    activity_type_id: string;
    cost_center_id: string;
    date: string;
    hours: number;
    notes: string;
    location: string;
    image_urls: string[];
    billing_status: string;
  }>) {
    const { data: timesheet, error } = await supabase
      .from('timesheets')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update timesheet: ${error.message}`);
    }

    if (!timesheet) {
      throw new Error('Timesheet not found');
    }

    return timesheet;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('timesheets')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete timesheet: ${error.message}`);
    }

    return { message: 'Timesheet deleted' };
  },
};

/**
 * Cost Centers Queries
 */
export const costCentersQueries = {
  async getAll(params?: {
    active_only?: boolean;
    project_id?: string;
  }) {
    let query = supabase.from('cost_centers').select('*');

    if (params?.active_only) {
      query = query.eq('is_active', true);
    }

    if (params?.project_id) {
      // Get cost centers for a specific project
      const { data: projectCostCenters } = await supabase
        .from('project_cost_centers')
        .select('cost_center_id')
        .eq('project_id', params.project_id);

      if (projectCostCenters && projectCostCenters.length > 0) {
        const costCenterIds = projectCostCenters.map(pcc => pcc.cost_center_id);
        query = query.in('id', costCenterIds);
      } else {
        // Return empty array if no cost centers for project
        return [];
      }
    }

    query = query.order('code', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch cost centers: ${error.message}`);
    }

    return data || [];
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('cost_centers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch cost center: ${error.message}`);
    }

    return data;
  },

  async create(data: {
    code: string;
    name: string;
    description?: string;
    budget?: number;
    xero_tracking_category_id?: string;
    client_po_number?: string;
    is_active?: boolean;
  }) {
    const { data: costCenter, error } = await supabase
      .from('cost_centers')
      .insert({
        ...data,
        is_active: data.is_active !== undefined ? data.is_active : true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create cost center: ${error.message}`);
    }

    return costCenter;
  },

  async update(id: string, data: Partial<{
    code: string;
    name: string;
    description: string;
    budget: number;
    xero_tracking_category_id: string;
    client_po_number: string;
    is_active: boolean;
  }>) {
    const { data: costCenter, error } = await supabase
      .from('cost_centers')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update cost center: ${error.message}`);
    }

    if (!costCenter) {
      throw new Error('Cost center not found');
    }

    return costCenter;
  },

  async delete(id: string) {
    // Check for related timesheets or projects
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('id')
      .eq('cost_center_id', id)
      .limit(1);

    if (timesheets && timesheets.length > 0) {
      throw new Error('Cannot delete cost center with existing timesheets. Deactivate instead.');
    }

    const { error } = await supabase
      .from('cost_centers')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete cost center: ${error.message}`);
    }

    return { message: 'Cost center deleted' };
  },
};

/**
 * Activity Types Queries
 */
export const activityTypesQueries = {
  async getAll(params?: {
    active_only?: boolean;
  }) {
    let query = supabase.from('activity_types').select('*');

    if (params?.active_only) {
      query = query.eq('is_active', true);
    }

    query = query.order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch activity types: ${error.message}`);
    }

    return data || [];
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('activity_types')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch activity type: ${error.message}`);
    }

    return data;
  },

  async create(data: {
    name: string;
    icon?: string;
    color?: string;
    hourly_rate?: number;
    is_active?: boolean;
  }) {
    const { data: activityType, error } = await supabase
      .from('activity_types')
      .insert({
        ...data,
        icon: data.icon || 'Wrench',
        color: data.color || 'bg-electric/20 border-electric text-electric',
        hourly_rate: data.hourly_rate || 0,
        is_active: data.is_active !== undefined ? data.is_active : true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create activity type: ${error.message}`);
    }

    return activityType;
  },

  async update(id: string, data: Partial<{
    name: string;
    icon: string;
    color: string;
    hourly_rate: number;
    is_active: boolean;
  }>) {
    const { data: activityType, error } = await supabase
      .from('activity_types')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update activity type: ${error.message}`);
    }

    if (!activityType) {
      throw new Error('Activity type not found');
    }

    return activityType;
  },

  async delete(id: string) {
    // Check for related timesheets
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('id')
      .eq('activity_type_id', id)
      .limit(1);

    if (timesheets && timesheets.length > 0) {
      throw new Error('Cannot delete activity type with existing timesheets. Deactivate instead.');
    }

    const { error } = await supabase
      .from('activity_types')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete activity type: ${error.message}`);
    }

    return { message: 'Activity type deleted' };
  },
};
