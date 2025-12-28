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
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        const error = new Error(errorData.error || errorData.message || 'Request failed');
        this.logApiError(endpoint, error, 'api');
        throw error;
      }

      return response.json();
    } catch (error: any) {
      // Network errors (fetch throws)
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error('Network error - please check your connection');
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
    return this.request<{ company_name: string; company_logo: string | null }>('/api/setup/branding');
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
      formData.append('date', data.date);
      formData.append('hours', data.hours.toString());
      if (data.notes) formData.append('notes', data.notes);
      if (data.user_id) formData.append('user_id', data.user_id);
      
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

  async getActivityLogs(params?: { user_id?: string; action?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams(params as Record<string, string>);
    return this.request<{ logs: any[]; total: number }>(`/api/settings/logs/activity?${searchParams}`);
  }

  // Xero
  async getXeroAuthUrl() {
    return this.request<{ url: string; configured: boolean }>('/api/xero/auth/url');
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
}

export const api = new ApiClient();
export default api;
