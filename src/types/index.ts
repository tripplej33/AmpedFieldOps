export type ProjectStatus = 'quoted' | 'in-progress' | 'completed' | 'invoiced';
export type UserRole = 'admin' | 'manager' | 'user';

export interface Client {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  location: string;
  billing_address?: string;
  billing_email?: string;
  xero_contact_id?: string;
  status: 'active' | 'inactive';
  notes?: string;
  created_at: string;
  updated_at: string;
  // Computed fields
  active_projects?: number;
  total_hours?: number;
  last_contact?: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string;
  budget: number;
  project_id?: string; // Job-specific cost center
  project_name?: string;
  xero_tracking_category_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed fields
  project_count?: number;
  total_hours?: number;
  total_cost?: number;
  actual_cost?: number;
  remaining_budget?: number;
}

export interface ActivityType {
  id: string;
  name: string;
  icon: string;
  color: string;
  hourly_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count?: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client_id: string;
  client_name?: string;
  status: ProjectStatus;
  budget: number;
  actual_cost: number;
  description: string;
  start_date: string;
  end_date?: string;
  xero_project_id?: string;
  files: string[];
  created_at: string;
  updated_at: string;
  // Computed and related fields
  hours_logged?: number;
  cost_centers?: CostCenter[];
  cost_center_ids?: string[];
  cost_center_codes?: string[];
}

export interface TimesheetEntry {
  id: string;
  user_id: string;
  project_id: string;
  client_id: string;
  activity_type_id: string;
  cost_center_id: string;
  date: string;
  hours: number;
  notes: string;
  image_urls: string[];
  location?: string;
  synced: boolean;
  xero_timesheet_id?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  project_name?: string;
  project_code?: string;
  client_name?: string;
  activity_type_name?: string;
  activity_type_icon?: string;
  activity_type_color?: string;
  cost_center_code?: string;
  cost_center_name?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  is_active: boolean;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface Permission {
  permission: string;
  granted: boolean;
}

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  totalHours: number;
  totalRevenue: number;
  projectsTrend: number;
  hoursTrend: number;
  revenueTrend: number;
  activeTeam: number;
  recentActivity: Array<{
    date: string;
    hours: number;
  }>;
}

export interface QuickStats {
  budgetUtilization: number;
  projectsOnTrack: number;
  overdueProjects: number;
}

export interface XeroInvoice {
  id: string;
  xero_invoice_id: string;
  invoice_number: string;
  client_id: string;
  client_name?: string;
  project_id?: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  total: number;
  currency: string;
  issue_date: string;
  due_date: string;
  line_items: any[];
  synced_at: string;
}

export interface XeroQuote {
  id: string;
  xero_quote_id: string;
  quote_number: string;
  client_id: string;
  client_name?: string;
  project_id?: string;
  status: string;
  total: number;
  currency: string;
  issue_date: string;
  expiry_date: string;
  line_items: any[];
  synced_at: string;
}

export interface Setting {
  key: string;
  value: any;
  user_id?: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details: any;
  ip_address?: string;
  created_at: string;
}
