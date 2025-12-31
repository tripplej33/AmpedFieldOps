// Use empty string as API_URL since endpoints already include /api prefix
// Nginx will proxy /api requests to backend
const API_URL = '';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

// Error logging callback type
type ErrorLogCallback = (error: {
  type: 'api' | 'client' | 'auth' | 'network' | 'unknown';
  message: string;
  details?: string;
  stack?: string;
  endpoint?: string;
  user_id?: string;
  user_name?: string;
}) => void;

// Global error logger reference (set by NotificationContext)
let errorLogCallback: ErrorLogCallback | null = null;

export function setErrorLogCallback(callback: ErrorLogCallback | null) {
  errorLogCallback = callback;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  private logApiError(endpoint: string, error: Error, type: 'api' | 'auth' | 'network' = 'api') {
    if (errorLogCallback) {
      const user = this.getCurrentUserFromStorage();
      errorLogCallback({
        type,
        message: error.message,
        details: `Endpoint: ${endpoint}`,
        stack: error.stack,
        endpoint,
        user_id: user?.id,
        user_name: user?.name,
      });
    }
  }

  private getCurrentUserFromStorage() {
    try {
      const stored = localStorage.getItem('current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    return this.token;
  }

  async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (this.token) {
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);

      if (response.status === 401) {
        this.setToken(null);
        const error = new Error('Unauthorized - session expired');
        this.logApiError(endpoint, error, 'auth');
        window.location.href = '/login';
        throw error;
      }

      if (!response.ok) {
        // Try to parse JSON error response
        let errorData: any;
        let errorMessage = 'Request failed';
        
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
            errorMessage = errorData.error || errorData.message || `Request failed (${response.status})`;
          } else {
            // Non-JSON response (could be HTML error page, CORS error, etc.)
            const text = await response.text();
            errorMessage = `Request failed (${response.status} ${response.statusText})`;
            if (text && text.length < 500) {
              errorMessage += `: ${text.substring(0, 200)}`;
            }
            errorData = { error: errorMessage, status: response.status, statusText: response.statusText };
          }
        } catch (e) {
          // Failed to parse response
          errorMessage = `Request failed (${response.status} ${response.statusText})`;
          errorData = { error: errorMessage, status: response.status };
        }
        
        const error = new Error(errorMessage);
        // Don't log "User not found" on auth/me endpoint - expected when session expires
        const isExpectedAuthError = endpoint.includes('/auth/me') && error.message.includes('not found');
        if (!isExpectedAuthError) {
          this.logApiError(endpoint, error, 'api');
        }
        throw error;
      }

      return response.json();
    } catch (error: any) {
      // Network errors (fetch throws) - could be CORS, connection refused, etc.
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        // Check if it's a CORS error
        if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
          const corsError = new Error('CORS error - backend may not be configured for this domain');
          this.logApiError(endpoint, corsError, 'network');
          throw corsError;
        }
        const networkError = new Error(`Network error: ${error.message}`);
        this.logApiError(endpoint, networkError, 'network');
        throw networkError;
      }
      // Re-throw already handled errors
      throw error;
    }
  }

  async uploadFile(endpoint: string, file: File, fieldName = 'file'): Promise<any> {
    const formData = new FormData();
    formData.append(fieldName, file);

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        const error = new Error(errorData.error || 'Upload failed');
        this.logApiError(endpoint, error, 'api');
        throw error;
      }

      return response.json();
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error('Network error during file upload');
        this.logApiError(endpoint, networkError, 'network');
        throw networkError;
      }
      throw error;
    }
  }

  // Auth
  async login(email: string, password: string) {
    const result = await this.request<{ user: any; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setToken(result.token);
    return result;
  }

  async register(email: string, password: string, name: string) {
    const result = await this.request<{ user: any; token: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, name },
    });
    this.setToken(result.token);
    return result;
  }

  async logout() {
    this.setToken(null);
  }

  async getCurrentUser() {
    return this.request<any>('/api/auth/me');
  }

  async refreshToken() {
    const result = await this.request<{ token: string }>('/api/auth/refresh', { method: 'POST' });
    this.setToken(result.token);
    return result;
  }

  async forgotPassword(email: string) {
    return this.request('/api/auth/forgot-password', { method: 'POST', body: { email } });
  }

  async resetPassword(token: string, password: string) {
    return this.request('/api/auth/reset-password', { method: 'POST', body: { token, password } });
  }

  async updateProfile(data: { name?: string; email?: string; avatar?: string }) {
    return this.request('/api/auth/profile', { method: 'PUT', body: data });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/api/auth/change-password', { 
      method: 'PUT', 
      body: { currentPassword, newPassword } 
    });
  }

  // Setup
  async getSetupStatus() {
    return this.request<{ completed: boolean; step: number | null }>('/api/setup/status');
  }

  async setupAdmin(data: { email: string; password: string; name: string; company_name?: string; timezone?: string }) {
    const result = await this.request<{ user: any; token: string; step: number }>('/api/setup/admin', {
      method: 'POST',
      body: data,
    });
    this.setToken(result.token);
    return result;
  }

  async deleteDefaultAdmin() {
    return this.request<{ message: string }>('/api/setup/default-admin', {
      method: 'DELETE'
    });
  }

  async checkDefaultAdminExists(): Promise<boolean> {
    try {
      const status = await this.request<{ hasDefaultAdmin: boolean }>('/api/setup/default-admin-status');
      return status.hasDefaultAdmin || false;
    } catch {
      return false;
    }
  }

  async uploadLogo(file: File) {
    return this.uploadFile('/api/setup/logo', file, 'logo');
  }

  async setupCompany(data: { company_name: string; timezone?: string }) {
    return this.request('/api/setup/company', { method: 'POST', body: data });
  }

  async completeSetup() {
    return this.request('/api/setup/complete', { method: 'POST' });
  }

  async getBranding() {
    return this.request<{ company_name: string; company_logo: string | null; company_favicon?: string | null }>('/api/setup/branding');
  }

  // Dashboard
  async getDashboardMetrics() {
    return this.request<any>('/api/dashboard/metrics');
  }

  async getRecentTimesheets(limit = 5) {
    return this.request<any[]>(`/api/dashboard/recent-timesheets?limit=${limit}`);
  }

  async getActiveProjects(limit = 5) {
    return this.request<any[]>(`/api/dashboard/active-projects?limit=${limit}`);
  }

  async getQuickStats() {
    return this.request<any>('/api/dashboard/quick-stats');
  }

  // Clients
  async getClients(params?: { status?: string; search?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/clients?${searchParams}`);
  }

  async getClient(id: string) {
    return this.request<any>(`/api/clients/${id}`);
  }

  async createClient(data: any) {
    return this.request('/api/clients', { method: 'POST', body: data });
  }

  async updateClient(id: string, data: any) {
    return this.request(`/api/clients/${id}`, { method: 'PUT', body: data });
  }

  async deleteClient(id: string) {
    return this.request(`/api/clients/${id}`, { method: 'DELETE' });
  }

  // Projects
  async getProjects(params?: { status?: string; client_id?: string; search?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/projects?${searchParams}`);
  }

  async getProject(id: string) {
    return this.request<any>(`/api/projects/${id}`);
  }

  async createProject(data: any) {
    return this.request('/api/projects', { method: 'POST', body: data });
  }

  async updateProject(id: string, data: any) {
    return this.request(`/api/projects/${id}`, { method: 'PUT', body: data });
  }

  async deleteProject(id: string) {
    return this.request(`/api/projects/${id}`, { method: 'DELETE' });
  }

  // Timesheets
  async getTimesheets(params?: { 
    user_id?: string; 
    project_id?: string; 
    client_id?: string;
    date_from?: string; 
    date_to?: string;
    cost_center_id?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, value);
        }
      });
    }
    return this.request<any[]>(`/api/timesheets?${searchParams}`);
  }

  async getTimesheet(id: string) {
    return this.request<any>(`/api/timesheets/${id}`);
  }

  async createTimesheet(data: any) {
    // If there are image files, use FormData
    if (data.image_files && data.image_files.length > 0) {
      const formData = new FormData();
      formData.append('project_id', data.project_id);
      formData.append('activity_type_id', data.activity_type_id);
      formData.append('cost_center_id', data.cost_center_id);
      if (data.user_id) {
        formData.append('user_id', data.user_id);
      }
      formData.append('date', data.date);
      formData.append('hours', data.hours.toString());
      if (data.notes) formData.append('notes', data.notes);
      
      data.image_files.forEach((file: File, index: number) => {
        formData.append(`images`, file);
      });

      return this.requestFormData('/api/timesheets', formData);
    }
    
    const { image_files, ...jsonData } = data;
    return this.request('/api/timesheets', { method: 'POST', body: jsonData });
  }

  async requestFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const config: RequestInit = {
      method: 'POST',
      body: formData,
    };

    if (this.token) {
      config.headers = {
        'Authorization': `Bearer ${this.token}`,
      };
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);

    if (response.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  }

  async updateTimesheet(id: string, data: any) {
    // If data is FormData, use requestFormData
    if (data instanceof FormData) {
      const config: RequestInit = {
        method: 'PUT',
        body: data,
      };

      if (this.token) {
        config.headers = {
          'Authorization': `Bearer ${this.token}`,
        };
      }

      const response = await fetch(`${API_URL}/api/timesheets/${id}`, config);

      if (response.status === 401) {
        this.setToken(null);
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || error.message || 'Request failed');
      }

      return response.json();
    }
    
    // Otherwise, use regular JSON request
    return this.request(`/api/timesheets/${id}`, { method: 'PUT', body: data });
  }

  async deleteTimesheet(id: string) {
    return this.request(`/api/timesheets/${id}`, { method: 'DELETE' });
  }

  async uploadTimesheetImages(id: string, files: File[]) {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    const response = await fetch(`${API_URL}/api/timesheets/${id}/images`, {
      method: 'POST',
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: formData,
    });

    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  }

  async deleteTimesheetImage(timesheetId: string, imageIndex: number) {
    return this.request(`/api/timesheets/${timesheetId}/images/${imageIndex}`, { method: 'DELETE' });
  }

  // Timesheet Images
  async getTimesheetImages(projectId?: string) {
    if (projectId) {
      return this.request<Array<{
        url: string;
        filename: string;
        timesheet_id: string;
        timesheet_date: string;
        upload_date: string;
        user_name: string;
        project_code: string;
        project_name: string;
        image_index: number;
      }>>(`/api/files/timesheet-images/${projectId}`);
    }
    return this.request<Array<{
      project_id: string;
      project_code: string;
      project_name: string;
      client_name: string;
      timesheets_with_images: number;
      total_images: number;
    }>>('/api/files/timesheet-images');
  }

  // Logos
  async getLogos() {
    return this.request<Array<{
      url: string;
      filename: string;
      upload_date: string;
      file_size: number;
    }>>('/api/files/logos');
  }

  async deleteLogo(filename: string) {
    return this.request<{ message: string }>(`/api/files/logos/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  }

  // Cost Centers
  async getCostCenters(activeOnly = false, projectId?: string) {
    const params = new URLSearchParams();
    if (activeOnly) params.append('active_only', 'true');
    if (projectId) params.append('project_id', projectId);
    return this.request<any[]>(`/api/cost-centers?${params}`);
  }

  async getCostCenter(id: string) {
    return this.request<any>(`/api/cost-centers/${id}`);
  }

  async createCostCenter(data: any) {
    return this.request('/api/cost-centers', { method: 'POST', body: data });
  }

  async updateCostCenter(id: string, data: any) {
    return this.request(`/api/cost-centers/${id}`, { method: 'PUT', body: data });
  }

  async deleteCostCenter(id: string) {
    return this.request(`/api/cost-centers/${id}`, { method: 'DELETE' });
  }

  // Activity Types
  async getActivityTypes(activeOnly = false) {
    return this.request<any[]>(`/api/activity-types?active_only=${activeOnly}`);
  }

  async getActivityType(id: string) {
    return this.request<any>(`/api/activity-types/${id}`);
  }

  async createActivityType(data: any) {
    return this.request('/api/activity-types', { method: 'POST', body: data });
  }

  async updateActivityType(id: string, data: any) {
    return this.request(`/api/activity-types/${id}`, { method: 'PUT', body: data });
  }

  async deleteActivityType(id: string) {
    return this.request(`/api/activity-types/${id}`, { method: 'DELETE' });
  }

  // Users
  async getUsers() {
    return this.request<any[]>('/api/users');
  }

  async getUser(id: string) {
    return this.request<any>(`/api/users/${id}`);
  }

  async createUser(data: any) {
    return this.request('/api/users', { method: 'POST', body: data });
  }

  async updateUser(id: string, data: any) {
    return this.request(`/api/users/${id}`, { method: 'PUT', body: data });
  }

  async updateUserPermissions(id: string, permissions: { permission: string; granted: boolean }[]) {
    return this.request(`/api/users/${id}/permissions`, { method: 'PUT', body: { permissions } });
  }

  async deleteUser(id: string) {
    return this.request(`/api/users/${id}`, { method: 'DELETE' });
  }

  // Search
  async search(query: string, type?: string) {
    return this.request<{ clients: any[]; projects: any[]; timesheets: any[] }>(
      `/api/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ''}`
    );
  }

  async getRecentSearches() {
    return this.request<any[]>('/api/search/recent');
  }

  async clearRecentSearches() {
    return this.request('/api/search/recent', { method: 'DELETE' });
  }

  // Settings
  async getSettings() {
    return this.request<Record<string, any>>('/api/settings');
  }

  async getSetting(key: string) {
    return this.request<{ key: string; value: any }>(`/api/settings/${key}`);
  }

  async updateSetting(key: string, value: any, global = false) {
    return this.request(`/api/settings/${key}`, { method: 'PUT', body: { value, global } });
  }

  async updateSettings(settings: { key: string; value: any }[], global = false) {
    return this.request('/api/settings', { method: 'PUT', body: { settings, global } });
  }

  async uploadCompanyLogo(file: File) {
    return this.uploadFile('/api/settings/logo', file, 'logo');
  }

  async uploadFavicon(file: File) {
    return this.uploadFile('/api/settings/favicon', file, 'favicon');
  }

  async sendTestEmail(email: string) {
    return this.request<{ message: string }>('/api/settings/email/test', {
      method: 'POST',
      body: { email },
    });
  }

  async getActivityLogs(params?: { user_id?: string; action?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<{ logs: any[]; total: number }>(`/api/settings/logs/activity?${searchParams}`);
  }

  // Permissions
  async getPermissions() {
    return this.request<any[]>('/api/permissions');
  }

  async getPermission(id: string) {
    return this.request<any>(`/api/permissions/${id}`);
  }

  async createPermission(data: { key: string; label: string; description?: string }) {
    return this.request<any>('/api/permissions', { method: 'POST', body: data });
  }

  async updatePermission(id: string, data: { label?: string; description?: string; is_active?: boolean }) {
    return this.request<any>(`/api/permissions/${id}`, { method: 'PUT', body: data });
  }

  async deletePermission(id: string) {
    return this.request(`/api/permissions/${id}`, { method: 'DELETE' });
  }

  // Role Permissions
  async getRolePermissions() {
    return this.request<{ permissions: Array<{ key: string; label: string; description: string }>; rolePermissions: Record<string, Record<string, boolean>> }>('/api/role-permissions');
  }

  async updateRolePermissions(rolePermissions: Record<string, Record<string, boolean>>) {
    return this.request('/api/role-permissions', {
      method: 'PUT',
      body: { rolePermissions }
    });
  }

  // Xero
  async getXeroAuthUrl() {
    return this.request<{ 
      url: string; 
      configured: boolean;
      redirectUri?: string;
      clientId?: string;
      clientIdPrefix?: string;
      verification?: {
        redirectUriMatch?: string;
        clientIdMatch?: string;
        xeroAppUrl?: string;
      };
    }>('/api/xero/auth/url');
  }

  async getHealthStatus() {
    return this.request('/api/health', { method: 'GET' });
  }

  async getXeroStatus() {
    return this.request<{
      connected: boolean;
      configured: boolean;
      tenant_name?: string;
      last_sync?: string;
    }>('/api/xero/status');
  }

  async disconnectXero() {
    return this.request('/api/xero/disconnect', { method: 'DELETE' });
  }

  async syncXero(type: 'contacts' | 'invoices' | 'tracking_categories' | 'all') {
    return this.request('/api/xero/sync', { method: 'POST', body: { type } });
  }

  // Pull contacts from Xero to local clients
  async pullXeroContacts() {
    return this.request<{
      success: boolean;
      synced_at: string;
      results: { total: number; created: number; updated: number; skipped: number };
    }>('/api/xero/contacts/pull', { method: 'POST' });
  }

  // Push a single client to Xero
  async pushClientToXero(clientId: string) {
    return this.request<{
      success: boolean;
      action: 'created' | 'updated';
      xero_contact_id: string;
    }>(`/api/xero/contacts/push/${clientId}`, { method: 'POST' });
  }

  // Push all local clients without xero_contact_id to Xero
  async pushAllClientsToXero() {
    return this.request<{
      success: boolean;
      synced_at: string;
      results: { total: number; created: number; failed: number };
    }>('/api/xero/contacts/push-all', { method: 'POST' });
  }

  async getXeroInvoices(params?: { status?: string; client_id?: string; date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/invoices?${searchParams}`);
  }

  async createXeroInvoice(data: any) {
    return this.request('/api/xero/invoices', { method: 'POST', body: data });
  }

  async createInvoiceFromTimesheets(data: { client_id: string; project_id?: string; date_from?: string; date_to?: string; period?: 'week' | 'month'; due_date?: string }) {
    const response = await fetch(`${API_URL}/api/xero/invoices/from-timesheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    
    // Handle 202 Accepted (async sync)
    if (response.status === 202) {
      return { ...result, sync_status: 'pending', async: true };
    }
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to create invoice from timesheets');
    }
    
    return result;
  }

  async getSyncLogs(entityType: string, entityId: string) {
    return this.request<any[]>(`/api/xero/sync-logs?entity_type=${entityType}&entity_id=${entityId}`);
  }

  async getInvoiceSyncStatus(invoiceId: string) {
    return this.request<{ sync_status: string; xero_sync_id?: string }>(`/api/xero/invoices/${invoiceId}/sync-status`);
  }

  async getPOSyncStatus(poId: string) {
    return this.request<{ sync_status: string; xero_sync_id?: string }>(`/api/xero/purchase-orders/${poId}/sync-status`);
  }

  async markInvoiceAsPaid(invoiceId: string) {
    return this.request(`/api/xero/invoices/${invoiceId}/paid`, { method: 'PUT' });
  }

  async getXeroQuotes() {
    return this.request<any[]>('/api/xero/quotes');
  }

  async createXeroQuote(data: any) {
    return this.request('/api/xero/quotes', { method: 'POST', body: data });
  }

  async convertQuoteToInvoice(quoteId: string) {
    return this.request(`/api/xero/quotes/${quoteId}/convert`, { method: 'POST' });
  }

  async getXeroFinancialSummary() {
    return this.request<any>('/api/xero/summary');
  }

  // Payments
  async getPayments(params?: { invoice_id?: string; date_from?: string; date_to?: string; payment_method?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/payments?${searchParams}`);
  }

  async createPayment(data: { invoice_id: string; amount: number; payment_date: string; payment_method: string; reference?: string; account_code?: string; currency?: string }) {
    return this.request<any>('/api/xero/payments', { method: 'POST', body: data });
  }

  async markInvoiceAsPaidXero(invoiceId: string, data?: { amount?: number; payment_date?: string; payment_method?: string; reference?: string; account_code?: string }) {
    return this.request<any>(`/api/xero/invoices/${invoiceId}/mark-paid`, { method: 'PUT', body: data || {} });
  }

  // Bank Transactions
  async getBankTransactions(params?: { date_from?: string; date_to?: string; reconciled?: boolean; payment_id?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/bank-transactions?${searchParams}`);
  }

  async importBankTransactions(data?: { date_from?: string; date_to?: string }) {
    return this.request<{ success: boolean; imported: number; message: string }>('/api/xero/bank-transactions', { method: 'POST', body: data || {} });
  }

  async reconcileTransaction(data: { transaction_id: string; payment_id: string }) {
    return this.request<{ success: boolean; message: string }>('/api/xero/reconcile', { method: 'POST', body: data });
  }

  // Purchase Orders
  async getPurchaseOrders(params?: { project_id?: string; supplier_id?: string; status?: string; date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/purchase-orders?${searchParams}`);
  }

  async getPurchaseOrder(id: string) {
    return this.request<any>(`/api/xero/purchase-orders/${id}`);
  }

  async getPurchaseOrdersByProject(projectId: string) {
    return this.request<any[]>(`/api/xero/purchase-orders/project/${projectId}`);
  }

  async createPurchaseOrder(data: { supplier_id: string; project_id: string; date: string; delivery_date?: string; line_items: Array<{ description: string; quantity: number; unit_amount: number; account_code?: string; cost_center_id?: string; item_id?: string }>; notes?: string; currency?: string }) {
    const response = await fetch(`${API_URL}/api/xero/purchase-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    
    // Handle 202 Accepted (async sync)
    if (response.status === 202) {
      return { ...result, sync_status: 'pending', async: true };
    }
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to create purchase order');
    }
    
    return result;
  }

  async updatePurchaseOrder(id: string, data: { status?: string }) {
    return this.request<any>(`/api/xero/purchase-orders/${id}`, { method: 'PUT', body: data });
  }

  async convertPurchaseOrderToBill(poId: string) {
    return this.request<any>(`/api/xero/purchase-orders/${poId}/convert-to-bill`, { method: 'POST' });
  }

  // Bills
  async getBills(params?: { supplier_id?: string; project_id?: string; purchase_order_id?: string; status?: string; date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/bills?${searchParams}`);
  }

  async createBill(data: { supplier_id: string; purchase_order_id?: string; project_id?: string; date: string; due_date?: string; line_items: Array<{ description: string; quantity: number; unit_amount: number; account_code?: string }>; reference?: string; currency?: string }) {
    return this.request<any>('/api/xero/bills', { method: 'POST', body: data });
  }

  async markBillAsPaid(billId: string, data?: { amount?: number }) {
    return this.request<any>(`/api/xero/bills/${billId}/pay`, { method: 'POST', body: data || {} });
  }

  // Expenses
  async getExpenses(params?: { project_id?: string; cost_center_id?: string; status?: string; date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/expenses?${searchParams}`);
  }

  async createExpense(data: { project_id?: string; cost_center_id?: string; amount: number; date: string; description: string; receipt_url?: string; currency?: string }) {
    return this.request<any>('/api/xero/expenses', { method: 'POST', body: data });
  }

  // Credit Notes
  async getCreditNotes(params?: { invoice_id?: string; date_from?: string; date_to?: string; status?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/credit-notes?${searchParams}`);
  }

  async createCreditNote(data: { invoice_id: string; amount: number; date: string; reason?: string; description?: string; currency?: string }) {
    return this.request<any>('/api/xero/credit-notes', { method: 'POST', body: data });
  }

  async applyCreditNote(creditNoteId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/xero/credit-notes/${creditNoteId}/apply`, { method: 'POST' });
  }

  // Items/Inventory
  async getItems(params?: { search?: string; is_tracked?: boolean }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/items?${searchParams}`);
  }

  async getItem(id: string) {
    return this.request<any>(`/api/xero/items/${id}`);
  }

  async syncItems() {
    return this.request<{ success: boolean; synced: number; message: string }>('/api/xero/items/sync', { method: 'POST' });
  }

  async updateItemStock(itemId: string, stockLevel: number) {
    return this.request<any>(`/api/xero/items/${itemId}/stock`, { method: 'PUT', body: { stock_level: stockLevel } });
  }

  // Payment Reminders
  async getReminderSchedule() {
    return this.request<any>('/api/xero/reminders/schedule');
  }

  async updateReminderSchedule(schedule: { days_after_due: number[]; email_template?: string; enabled: boolean }) {
    return this.request<any>('/api/xero/reminders/schedule', { method: 'PUT', body: schedule });
  }

  async sendPaymentReminder(data: { invoice_id: string; reminder_type?: string }) {
    return this.request<{ success: boolean; message: string }>('/api/xero/reminders/send', { method: 'POST', body: data });
  }

  async processPaymentReminders() {
    return this.request<{ success: boolean; sent: number; failed: number }>('/api/xero/reminders/process', { method: 'POST' });
  }

  async getReminderHistory(params?: { invoice_id?: string; date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/reminders/history?${searchParams}`);
  }

  // Financial Reports
  async getProfitLossReport(params?: { date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any>(`/api/xero/reports/profit-loss?${searchParams}`);
  }

  async getBalanceSheetReport(params?: { date?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any>(`/api/xero/reports/balance-sheet?${searchParams}`);
  }

  async getCashFlowReport(params?: { date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any>(`/api/xero/reports/cash-flow?${searchParams}`);
  }

  async getAgedReceivablesReport(params?: { date?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any>(`/api/xero/reports/aged-receivables?${searchParams}`);
  }

  async getAgedPayablesReport(params?: { date?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any>(`/api/xero/reports/aged-payables?${searchParams}`);
  }

  // Webhooks
  async getWebhookStatus() {
    return this.request<any>('/api/xero/webhooks/status');
  }

  async getWebhookEvents(params?: { event_type?: string; processed?: boolean; date_from?: string; date_to?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<any[]>(`/api/xero/webhooks/events?${searchParams}`);
  }

  // Project Financials
  async getProjectFinancials(projectId: string) {
    return this.request<any>(`/api/projects/${projectId}/financials`);
  }

  // Troubleshooter
  async runTroubleshooter(category?: string) {
    return this.request<{
      success: boolean;
      totalTests: number;
      passed: number;
      failed: number;
      skipped: number;
      duration: number;
      results: Array<{
        id: string;
        name: string;
        category: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
        message: string;
        error?: {
          message: string;
          stack?: string;
          details?: any;
        };
        timestamp: string;
      }>;
      timestamp: string;
    }>('/api/troubleshooter/run', {
      method: 'POST',
      body: category ? { category } : {},
    });
  }

  async getTroubleshooterRoutes() {
    return this.request<Array<{
      method: string;
      path: string;
      file: string;
      middleware: string[];
    }>>('/api/troubleshooter/routes');
  }

  async getTroubleshooterSuites() {
    return this.request<Array<{
      name: string;
      category: string;
    }>>('/api/troubleshooter/suites');
  }

  // File Management
  async getFiles(params?: { project_id?: string; cost_center_id?: string; file_type?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<import('../types').ProjectFile[]>(`/api/files?${searchParams}`);
  }

  async getFile(id: string) {
    return this.request<import('../types').ProjectFile>(`/api/files/${id}`);
  }


  async uploadProjectFile(file: File, projectId: string, costCenterId?: string): Promise<import('../types').ProjectFile> {
    // Create FormData manually to include additional fields
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    if (costCenterId) {
      formData.append('cost_center_id', costCenterId);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_URL}/api/files`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        const error = new Error(errorData.error || 'Upload failed');
        this.logApiError('/api/files', error, 'api');
        throw error;
      }

      return response.json();
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error('Network error during file upload');
        this.logApiError('/api/files', networkError, 'network');
        throw networkError;
      }
      throw error;
    }
  }

  async deleteFile(id: string) {
    return this.request<{ message: string }>(`/api/files/${id}`, { method: 'DELETE' });
  }

  async downloadFile(id: string): Promise<Blob> {
    const response = await fetch(`/api/files/${id}/download`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download file');
    }
    return response.blob();
  }

  async getProjectFiles(projectId: string) {
    return this.request<import('../types').ProjectFile[]>(`/api/files/projects/${projectId}`);
  }

  async getCostCenterFiles(costCenterId: string) {
    return this.request<import('../types').ProjectFile[]>(`/api/files/cost-centers/${costCenterId}`);
  }

  // Safety Documents
  async getSafetyDocuments(params?: { project_id?: string; cost_center_id?: string; document_type?: string; status?: string }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<import('../types').SafetyDocument[]>(`/api/safety-documents?${searchParams}`);
  }

  async getSafetyDocument(id: string) {
    return this.request<import('../types').SafetyDocument>(`/api/safety-documents/${id}`);
  }

  async createSafetyDocument(data: {
    project_id: string;
    cost_center_id?: string;
    document_type: 'jsa' | 'electrical_compliance' | 'electrical_safety_certificate';
    title: string;
    data: import('../types').JSAData | import('../types').ComplianceData | import('../types').SafetyCertificateData;
    status?: 'draft' | 'completed' | 'approved';
  }) {
    return this.request<import('../types').SafetyDocument>('/api/safety-documents', { method: 'POST', body: data });
  }

  async updateSafetyDocument(id: string, data: {
    title?: string;
    data?: import('../types').JSAData | import('../types').ComplianceData | import('../types').SafetyCertificateData;
    status?: 'draft' | 'completed' | 'approved';
  }) {
    return this.request<import('../types').SafetyDocument>(`/api/safety-documents/${id}`, { method: 'PUT', body: data });
  }

  async deleteSafetyDocument(id: string) {
    return this.request<{ message: string }>(`/api/safety-documents/${id}`, { method: 'DELETE' });
  }

  async generateSafetyDocumentPDF(id: string) {
    return this.request<{ message: string; file_path: string }>(`/api/safety-documents/${id}/generate-pdf`, { method: 'POST' });
  }

  async downloadSafetyDocumentPDF(id: string): Promise<Blob> {
    const response = await fetch(`/api/safety-documents/${id}/pdf`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }
    return response.blob();
  }

  // Backups
  async getBackups() {
    return this.request<any[]>('/api/backups');
  }

  async getBackup(id: string) {
    return this.request<any>(`/api/backups/${id}`);
  }

  async createBackup(data: { type: 'full' | 'database' | 'files'; storage_type?: 'local' | 'google_drive' }) {
    return this.request<any>('/api/backups', { method: 'POST', body: data });
  }

  async downloadBackup(id: string): Promise<Blob> {
    const response = await fetch(`/api/backups/${id}/download`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download backup');
    }
    return response.blob();
  }

  async deleteBackup(id: string) {
    return this.request<{ message: string }>(`/api/backups/${id}`, { method: 'DELETE' });
  }

  async restoreBackup(id: string, confirm: boolean = true) {
    return this.request<{ message: string }>(`/api/backups/${id}/restore`, { 
      method: 'POST', 
      body: { confirm } 
    });
  }

  async getGoogleDriveAuthUrl() {
    return this.request<{ url: string }>('/api/backups/google-drive/auth');
  }

  async getGoogleDriveStatus() {
    return this.request<{ connected: boolean }>('/api/backups/google-drive/status');
  }

  async getBackupSchedule() {
    return this.request<{
      enabled: boolean;
      frequency: string;
      retention_days: number;
      backup_type: 'full' | 'database' | 'files';
      storage_type: 'local' | 'google_drive';
    }>('/api/backups/schedule');
  }

  async updateBackupSchedule(schedule: {
    enabled: boolean;
    frequency: string;
    retention_days: number;
    backup_type: 'full' | 'database' | 'files';
    storage_type: 'local' | 'google_drive';
  }) {
    return this.request<{ message: string; schedule: any }>('/api/backups/schedule', {
      method: 'POST',
      body: schedule
    });
  }

  async cleanupBackups(retention_days: number = 30) {
    return this.request<{ message: string }>('/api/backups/cleanup', {
      method: 'POST',
      body: { retention_days }
    });
  }

  async testS3Connection(config: { accessKeyId: string; secretAccessKey: string; region: string; bucket: string }) {
    return this.request<{ message: string }>('/api/settings/test-s3', {
      method: 'POST',
      body: config
    });
  }
}

export const api = new ApiClient();
export default api;
