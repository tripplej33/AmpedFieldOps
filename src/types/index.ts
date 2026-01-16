export type ProjectStatus = 'quoted' | 'in-progress' | 'completed' | 'invoiced' | 'paid';
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
  client_type?: 'customer' | 'supplier' | 'both';
  status: 'active' | 'inactive';
  notes?: string;
  created_at: string;
  updated_at: string;
  // Computed fields
  active_projects?: number;
  total_hours?: number;
  last_contact?: string;
  last_activity?: string;
  // Supplier-specific computed fields
  total_purchase_orders?: number;
  total_bills?: number;
  total_spent?: number;
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
  client_po_number?: string; // Client-supplied purchase order number
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
  cloud_image_urls?: string[]; // Cloud storage URLs for images
  location?: string;
  synced: boolean;
  xero_timesheet_id?: string;
  billing_status?: 'unbilled' | 'billed' | 'paid';
  invoice_id?: string;
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

export interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  line_amount: number;
  account_code?: string;
  cost_center_id?: string;
  cost_center_code?: string;
  cost_center_name?: string;
  item_code?: string;
  tax_type?: string;
  tax_amount?: number;
}

export interface DocumentScan {
  id: string;
  file_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  document_type?: 'receipt' | 'invoice' | 'purchase_order' | 'bill' | 'expense' | 'unknown';
  extracted_data?: {
    document_number?: string;
    date?: string;
    amount?: number;
    total_amount?: number;
    tax_amount?: number;
    vendor_name?: string;
    vendor_address?: string;
    line_items?: LineItem[];
    raw_text?: string;
  };
  confidence?: number;
  error_message?: string;
  xero_attachment_id?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  file_name?: string;
  file_path?: string;
  mime_type?: string;
  user_name?: string;
  project_code?: string;
  project_name?: string;
}

export interface DocumentMatch {
  id: string;
  scan_id: string;
  entity_type: 'purchase_order' | 'invoice' | 'bill' | 'expense';
  entity_id: string;
  confidence_score: number;
  match_reasons: string[];
  confirmed: boolean;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
  entity_name?: string;
  entity_amount?: number;
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
  line_items: LineItem[];
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
  line_items: LineItem[];
  synced_at: string;
}

export interface XeroPayment {
  id: string;
  xero_payment_id?: string;
  invoice_id: string;
  invoice_number?: string;
  client_name?: string;
  amount: number;
  payment_date: string;
  payment_method: 'CASH' | 'CHECK' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'ONLINE';
  reference?: string;
  account_code?: string;
  currency: string;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  xero_bank_transaction_id?: string;
  bank_account_code?: string;
  bank_account_name?: string;
  date: string;
  amount: number;
  type: 'RECEIVE' | 'SPEND';
  description?: string;
  reference?: string;
  contact_name?: string;
  reconciled: boolean;
  payment_id?: string;
  reconciled_date?: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  xero_po_id?: string;
  po_number: string;
  supplier_id: string;
  supplier_name?: string;
  project_id: string;
  project_code?: string;
  project_name?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'CANCELLED';
  date: string;
  delivery_date?: string;
  total_amount: number;
  currency: string;
  line_items: LineItem[];
  line_items_detail?: PurchaseOrderLineItem[];
  bill_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLineItem {
  id: string;
  po_id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  account_code?: string;
  cost_center_id?: string;
  cost_center_code?: string;
  cost_center_name?: string;
  item_id?: string;
  line_amount: number;
}

export interface Bill {
  id: string;
  xero_bill_id?: string;
  bill_number: string;
  supplier_id: string;
  supplier_name?: string;
  purchase_order_id?: string;
  po_number?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  date: string;
  due_date?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  paid_date?: string;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  xero_expense_id?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  cost_center_id?: string;
  cost_center_code?: string;
  cost_center_name?: string;
  amount: number;
  date: string;
  description: string;
  receipt_url?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID';
  created_at: string;
  updated_at: string;
}

export interface CreditNote {
  id: string;
  xero_credit_note_id?: string;
  credit_note_number: string;
  invoice_id: string;
  invoice_number?: string;
  client_name?: string;
  amount: number;
  date: string;
  reason?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'VOIDED';
  created_at: string;
  updated_at: string;
}

export interface XeroItem {
  id: string;
  xero_item_id: string;
  code?: string;
  name: string;
  description?: string;
  purchase_price: number;
  sale_price: number;
  stock_level: number;
  is_tracked: boolean;
  synced_at?: string;
}

export interface PaymentReminder {
  id: string;
  invoice_id: string;
  invoice_number?: string;
  client_name?: string;
  sent_date: string;
  reminder_type: string;
  sent_to: string;
  created_at: string;
}

export interface ProjectFinancials {
  project: {
    id: string;
    code: string;
    name: string;
  };
  financials: {
    budget: number;
    po_commitments: number;
    actual_cost: number;
    available_budget: number;
  };
  purchase_orders: {
    total_count: number;
    total_committed: number;
    draft_count: number;
    authorised_count: number;
    billed_count: number;
  };
  bills: {
    total_count: number;
    total_amount: number;
    total_paid: number;
    total_due: number;
  };
  expenses: {
    total_count: number;
    total_amount: number;
  };
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

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  read: boolean;
  created_at: string;
}

export interface ErrorLogEntry {
  id: string;
  type: 'api' | 'client' | 'auth' | 'network' | 'unknown';
  message: string;
  details?: string;
  stack?: string;
  endpoint?: string;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  cost_center_id?: string;
  file_name: string;
  file_path: string;
  file_type: 'image' | 'pdf' | 'document';
  file_size: number;
  mime_type?: string;
  uploaded_by?: string;
  uploaded_by_name?: string;
  project_code?: string;
  project_name?: string;
  client_name?: string;
  cost_center_code?: string;
  cost_center_name?: string;
  created_at: string;
  updated_at: string;
}

export interface SafetyDocument {
  id: string;
  project_id: string;
  cost_center_id?: string;
  document_type: 'jsa' | 'electrical_compliance' | 'electrical_safety_certificate';
  title: string;
  data: JSAData | ComplianceData | SafetyCertificateData;
  file_path?: string;
  status: 'draft' | 'completed' | 'approved';
  created_by?: string;
  created_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  project_code?: string;
  project_name?: string;
  client_name?: string;
  cost_center_code?: string;
  cost_center_name?: string;
  created_at: string;
  updated_at: string;
}

export interface JSAData {
  job_description: string;
  location: string;
  date: string;
  prepared_by?: string;
  prepared_by_name?: string;
  prepared_by_date?: string;
  approved_by_name?: string;
  approved_by_date?: string;
  hazards?: Array<{
    description: string;
    risk_level: string;
    control_measures: string;
  }>;
  notes?: string;
}

export interface ComplianceData {
  certificate_number: string;
  issue_date: string;
  location: string;
  description: string;
  installation_date?: string;
  testing_results?: string | Array<{
    test: string;
    result: string;
  }>;
  compliance_standards?: string[];
  inspector_name?: string;
  inspector_license?: string;
  inspection_date?: string;
  inspector_signature_date?: string;
}

export interface SafetyCertificateData {
  certificate_number: string;
  issue_date: string;
  expiry_date?: string;
  location: string;
  description: string;
  safety_checks?: Array<{
    check: string;
    status: string;
    notes?: string;
  }>;
  inspector_name?: string;
  inspector_license?: string;
  inspection_date?: string;
  inspector_signature_date?: string;
}

export interface Backup {
  id: string;
  backup_type: 'full' | 'database' | 'files';
  storage_type: 'local' | 'google_drive';
  file_path?: string;
  file_size?: number;
  google_drive_file_id?: string;
  status: 'pending' | 'completed' | 'failed';
  error_message?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  expires_at?: string;
}
