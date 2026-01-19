# AmpedFieldOps Architecture Diagrams

This document contains comprehensive visual diagrams showing the data relationships, page hierarchy, and input flows for the AmpedFieldOps application.

---

## 1. High-Level System Architecture

This diagram shows the overall system structure and data flow between components.

```mermaid
graph TB
    subgraph Frontend["Frontend (React + TypeScript)"]
        Pages[Pages Components]
        Modals[Modal Components]
        Forms[Form Components]
        API_Client[API Client]
    end
    
    subgraph Network["Network Layer"]
        Nginx[Nginx Proxy]
    end
    
    subgraph Backend["Backend (Node.js + Express)"]
        Routes[API Routes]
        Middleware[Auth & Permissions Middleware]
        BusinessLogic[Business Logic Layer]
        XeroLib[Xero Integration Library]
    end
    
    subgraph Database["Database (PostgreSQL)"]
        CoreTables[Core Tables<br/>users, clients, projects, timesheets]
        XeroTables[Xero Tables<br/>invoices, quotes, purchase_orders, bills]
        SupportTables[Support Tables<br/>settings, permissions, files]
    end
    
    subgraph External["External Services"]
        XeroAPI[Xero API]
        GoogleDrive[Google Drive API]
        EmailService[Email Service]
    end
    
    subgraph Storage["File Storage"]
        LocalStorage[Local Uploads Directory]
        GoogleDriveStorage[Google Drive Storage]
    end
    
    Pages --> API_Client
    Modals --> API_Client
    Forms --> API_Client
    API_Client -->|HTTP Requests| Nginx
    Nginx -->|Proxy /api| Routes
    Routes --> Middleware
    Middleware --> BusinessLogic
    BusinessLogic --> CoreTables
    BusinessLogic --> XeroTables
    BusinessLogic --> SupportTables
    BusinessLogic --> XeroLib
    XeroLib -->|OAuth 2.0| XeroAPI
    BusinessLogic --> GoogleDrive
    BusinessLogic --> EmailService
    BusinessLogic --> LocalStorage
    BusinessLogic --> GoogleDriveStorage
    GoogleDrive --> GoogleDriveStorage
    
    style Frontend fill:#e1f5ff
    style Backend fill:#fff4e1
    style Database fill:#e8f5e9
    style External fill:#fce4ec
    style Storage fill:#f3e5f5
```

**Key Components:**
- **Frontend**: React components (pages, modals, forms) communicate through a centralized API client
- **Network**: Nginx acts as a reverse proxy routing `/api` requests to the backend
- **Backend**: Express routes with middleware for authentication and permissions
- **Database**: PostgreSQL with core business tables, Xero sync tables, and supporting tables
- **External**: Xero API for accounting, Google Drive for backups, email service for notifications

---

## 2. Database Entity Relationship Diagram

This diagram shows all database tables and their relationships.

```mermaid
erDiagram
    users ||--o{ user_permissions : "has"
    users ||--o{ timesheets : "creates"
    users ||--o{ activity_logs : "generates"
    users ||--o{ settings : "has"
    
    clients ||--o{ projects : "has"
    clients ||--o{ timesheets : "linked_to"
    clients ||--o{ xero_invoices : "billed_to"
    clients ||--o{ xero_quotes : "quoted_to"
    clients ||--o{ xero_purchase_orders : "supplier"
    clients ||--o{ xero_bills : "supplier"
    clients ||--o{ bank_transactions : "contact"
    
    projects ||--o{ timesheets : "tracks"
    projects ||--o{ xero_invoices : "billed_for"
    projects ||--o{ xero_quotes : "quoted_for"
    projects ||--o{ xero_purchase_orders : "has"
    projects ||--o{ xero_bills : "has"
    projects ||--o{ xero_expenses : "has"
    projects ||--o{ project_cost_centers : "uses"
    projects ||--o{ project_files : "has"
    projects ||--o{ safety_documents : "has"
    
    cost_centers ||--o{ timesheets : "allocated_to"
    cost_centers ||--o{ xero_expenses : "allocated_to"
    cost_centers ||--o{ xero_po_line_items : "allocated_to"
    cost_centers ||--o{ project_cost_centers : "used_in"
    cost_centers ||--o{ project_files : "linked_to"
    cost_centers ||--o{ safety_documents : "linked_to"
    
    activity_types ||--o{ timesheets : "categorized_by"
    
    projects ||--o{ project_cost_centers : "has"
    cost_centers ||--o{ project_cost_centers : "used_in"
    
    xero_invoices ||--o{ timesheets : "billed_in"
    xero_invoices ||--o{ xero_payments : "paid_by"
    xero_invoices ||--o{ xero_credit_notes : "credited_by"
    
    xero_purchase_orders ||--o{ xero_po_line_items : "contains"
    xero_purchase_orders ||--o{ xero_bills : "converted_to"
    
    xero_payments ||--o{ bank_transactions : "reconciled_with"
    
    permissions ||--o{ user_permissions : "granted_to"
    
    users {
        uuid id PK
        string email UK
        string password_hash
        string name
        string role
        string avatar
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    clients {
        uuid id PK
        string name
        string contact_name
        string email
        string phone
        text address
        string location
        text billing_address
        string billing_email
        string xero_contact_id
        string status
        text notes
        timestamp created_at
        timestamp updated_at
    }
    
    projects {
        uuid id PK
        string code UK
        string name
        uuid client_id FK
        string status
        decimal budget
        decimal actual_cost
        text description
        date start_date
        date end_date
        string xero_project_id
        text_array files
        timestamp created_at
        timestamp updated_at
    }
    
    timesheets {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        uuid client_id FK
        uuid activity_type_id FK
        uuid cost_center_id FK
        date date
        decimal hours
        text notes
        text_array image_urls
        string location
        boolean synced
        string xero_timesheet_id
        string billing_status
        uuid invoice_id FK
        timestamp created_at
        timestamp updated_at
    }
    
    cost_centers {
        uuid id PK
        string code UK
        string name
        text description
        decimal budget
        string xero_tracking_category_id
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    activity_types {
        uuid id PK
        string name
        string icon
        string color
        decimal hourly_rate
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    xero_invoices {
        uuid id PK
        string xero_invoice_id UK
        string invoice_number
        uuid client_id FK
        uuid project_id FK
        string status
        decimal amount_due
        decimal amount_paid
        decimal total
        string currency
        date issue_date
        date due_date
        jsonb line_items
        date paid_date
        date last_payment_date
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    xero_quotes {
        uuid id PK
        string xero_quote_id UK
        string quote_number
        uuid client_id FK
        uuid project_id FK
        string status
        decimal total
        string currency
        date issue_date
        date expiry_date
        jsonb line_items
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    xero_purchase_orders {
        uuid id PK
        string xero_po_id UK
        string po_number
        uuid supplier_id FK
        uuid project_id FK
        string status
        date date
        date delivery_date
        decimal total_amount
        string currency
        jsonb line_items
        uuid bill_id
        text notes
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    xero_po_line_items {
        uuid id PK
        uuid po_id FK
        text description
        decimal quantity
        decimal unit_amount
        string account_code
        uuid cost_center_id FK
        uuid item_id
        decimal line_amount
        timestamp created_at
        timestamp updated_at
    }
    
    xero_bills {
        uuid id PK
        string xero_bill_id UK
        string bill_number
        uuid supplier_id FK
        uuid purchase_order_id FK
        uuid project_id FK
        decimal amount
        decimal amount_paid
        decimal amount_due
        string currency
        date date
        date due_date
        string status
        date paid_date
        jsonb line_items
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    xero_expenses {
        uuid id PK
        string xero_expense_id UK
        uuid project_id FK
        uuid cost_center_id FK
        decimal amount
        date date
        text description
        text receipt_url
        string status
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    xero_payments {
        uuid id PK
        string xero_payment_id UK
        uuid invoice_id FK
        decimal amount
        date payment_date
        string payment_method
        string reference
        uuid bank_transaction_id
        string account_code
        string currency
        decimal exchange_rate
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    bank_transactions {
        uuid id PK
        string xero_bank_transaction_id UK
        string bank_account_code
        string bank_account_name
        date date
        decimal amount
        string type
        text description
        string reference
        uuid contact_id FK
        boolean reconciled
        uuid payment_id FK
        date reconciled_date
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    xero_credit_notes {
        uuid id PK
        string xero_credit_note_id UK
        string credit_note_number
        uuid invoice_id FK
        decimal amount
        date date
        text reason
        string status
        timestamp synced_at
        timestamp created_at
        timestamp updated_at
    }
    
    project_cost_centers {
        uuid project_id FK
        uuid cost_center_id FK
    }
    
    permissions {
        uuid id PK
        string key UK
        string label
        text description
        boolean is_system
        boolean is_custom
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    user_permissions {
        uuid id PK
        uuid user_id FK
        string permission
        boolean granted
        timestamp created_at
    }
    
    settings {
        uuid id PK
        string key
        text value
        uuid user_id FK
        timestamp created_at
        timestamp updated_at
    }
    
    activity_logs {
        uuid id PK
        uuid user_id FK
        string action
        string entity_type
        uuid entity_id
        jsonb details
        string ip_address
        timestamp created_at
    }
```

**Key Relationships:**
- **Users** manage the system and create timesheets
- **Clients** have multiple projects and can be suppliers for purchase orders/bills
- **Projects** are the central entity linking clients, timesheets, cost centers, and financial documents
- **Cost Centers** track budgets and are linked to projects via junction table
- **Xero Entities** sync with Xero API and link back to local clients/projects
- **Financial Flow**: Purchase Orders → Bills → Payments → Bank Transactions (reconciliation)

---

## 3. Backend API Routes Structure

This diagram shows the backend API route organization and HTTP methods.

```mermaid
graph TB
    subgraph Auth["/api/auth"]
        AuthLogin[POST /login]
        AuthRegister[POST /register]
        AuthMe[GET /me]
        AuthRefresh[POST /refresh]
        AuthLogout[POST /logout]
        AuthForgotPassword[POST /forgot-password]
        AuthResetPassword[POST /reset-password]
        AuthProfile[PUT /profile]
        AuthChangePassword[PUT /change-password]
    end
    
    subgraph Users["/api/users"]
        UsersList[GET /]
        UsersGet[GET /:id]
        UsersCreate[POST /]
        UsersUpdate[PUT /:id]
        UsersDelete[DELETE /:id]
        UsersPermissions[PUT /:id/permissions]
    end
    
    subgraph Clients["/api/clients"]
        ClientsList[GET /]
        ClientsGet[GET /:id]
        ClientsCreate[POST /]
        ClientsUpdate[PUT /:id]
        ClientsDelete[DELETE /:id]
    end
    
    subgraph Projects["/api/projects"]
        ProjectsList[GET /]
        ProjectsGet[GET /:id]
        ProjectsCreate[POST /]
        ProjectsUpdate[PUT /:id]
        ProjectsDelete[DELETE /:id]
        ProjectsFinancials[GET /:id/financials]
    end
    
    subgraph Timesheets["/api/timesheets"]
        TimesheetsList[GET /]
        TimesheetsGet[GET /:id]
        TimesheetsCreate[POST /]
        TimesheetsUpdate[PUT /:id]
        TimesheetsDelete[DELETE /:id]
        TimesheetsImages[POST /:id/images]
        TimesheetsDeleteImage[DELETE /:id/images/:index]
    end
    
    subgraph CostCenters["/api/cost-centers"]
        CostCentersList[GET /]
        CostCentersGet[GET /:id]
        CostCentersCreate[POST /]
        CostCentersUpdate[PUT /:id]
        CostCentersDelete[DELETE /:id]
    end
    
    subgraph ActivityTypes["/api/activity-types"]
        ActivityTypesList[GET /]
        ActivityTypesGet[GET /:id]
        ActivityTypesCreate[POST /]
        ActivityTypesUpdate[PUT /:id]
        ActivityTypesDelete[DELETE /:id]
    end
    
    subgraph Xero["/api/xero"]
        XeroAuth[GET /auth/url]
        XeroCallback[GET /auth/callback]
        XeroStatus[GET /status]
        XeroDisconnect[DELETE /disconnect]
        XeroSync[POST /sync]
        
        XeroContactsPull[POST /contacts/pull]
        XeroContactsPush[POST /contacts/push/:id]
        XeroContactsPushAll[POST /contacts/push-all]
        
        XeroInvoices[GET /invoices]
        XeroInvoicesCreate[POST /invoices]
        XeroInvoicesFromTimesheets[POST /invoices/from-timesheets]
        XeroInvoicesPaid[PUT /invoices/:id/paid]
        XeroInvoicesMarkPaid[PUT /invoices/:id/mark-paid]
        
        XeroQuotes[GET /quotes]
        XeroQuotesCreate[POST /quotes]
        XeroQuotesConvert[POST /quotes/:id/convert]
        
        XeroPayments[GET /payments]
        XeroPaymentsCreate[POST /payments]
        
        XeroPurchaseOrders[GET /purchase-orders]
        XeroPurchaseOrdersGet[GET /purchase-orders/:id]
        XeroPurchaseOrdersByProject[GET /purchase-orders/project/:id]
        XeroPurchaseOrdersCreate[POST /purchase-orders]
        XeroPurchaseOrdersUpdate[PUT /purchase-orders/:id]
        XeroPurchaseOrdersConvert[POST /purchase-orders/:id/convert-to-bill]
        
        XeroBills[GET /bills]
        XeroBillsCreate[POST /bills]
        XeroBillsPay[POST /bills/:id/pay]
        
        XeroExpenses[GET /expenses]
        XeroExpensesCreate[POST /expenses]
        
        XeroCreditNotes[GET /credit-notes]
        XeroCreditNotesCreate[POST /credit-notes]
        XeroCreditNotesApply[POST /credit-notes/:id/apply]
        
        XeroItems[GET /items]
        XeroItemsGet[GET /items/:id]
        XeroItemsSync[POST /items/sync]
        XeroItemsStock[PUT /items/:id/stock]
        
        XeroBankTransactions[GET /bank-transactions]
        XeroBankTransactionsImport[POST /bank-transactions]
        XeroReconcile[POST /reconcile]
        
        XeroReportsProfitLoss[GET /reports/profit-loss]
        XeroReportsBalanceSheet[GET /reports/balance-sheet]
        XeroReportsCashFlow[GET /reports/cash-flow]
        XeroReportsAgedReceivables[GET /reports/aged-receivables]
        XeroReportsAgedPayables[GET /reports/aged-payables]
        
        XeroRemindersSchedule[GET /reminders/schedule]
        XeroRemindersScheduleUpdate[PUT /reminders/schedule]
        XeroRemindersSend[POST /reminders/send]
        XeroRemindersProcess[POST /reminders/process]
        XeroRemindersHistory[GET /reminders/history]
        
        XeroWebhooksStatus[GET /webhooks/status]
        XeroWebhooksEvents[GET /webhooks/events]
        
        XeroSummary[GET /summary]
    end
    
    subgraph Settings["/api/settings"]
        SettingsList[GET /]
        SettingsGet[GET /:key]
        SettingsUpdate[PUT /:key]
        SettingsBulkUpdate[PUT /]
        SettingsLogo[POST /logo]
        SettingsFavicon[POST /favicon]
        SettingsEmailTest[POST /email/test]
        SettingsActivityLogs[GET /logs/activity]
    end
    
    subgraph Dashboard["/api/dashboard"]
        DashboardMetrics[GET /metrics]
        DashboardRecentTimesheets[GET /recent-timesheets]
        DashboardActiveProjects[GET /active-projects]
        DashboardQuickStats[GET /quick-stats]
    end
    
    subgraph Search["/api/search"]
        SearchQuery[GET /]
        SearchRecent[GET /recent]
        SearchClear[DELETE /recent]
    end
    
    subgraph Files["/api/files"]
        FilesList[GET /]
        FilesGet[GET /:id]
        FilesCreate[POST /]
        FilesDelete[DELETE /:id]
        FilesDownload[GET /:id/download]
        FilesByProject[GET /projects/:id]
        FilesByCostCenter[GET /cost-centers/:id]
        FilesTimesheetImages[GET /timesheet-images]
        FilesTimesheetImagesByProject[GET /timesheet-images/:id]
        FilesLogos[GET /logos]
        FilesDeleteLogo[DELETE /logos/:filename]
    end
    
    subgraph SafetyDocuments["/api/safety-documents"]
        SafetyDocsList[GET /]
        SafetyDocsGet[GET /:id]
        SafetyDocsCreate[POST /]
        SafetyDocsUpdate[PUT /:id]
        SafetyDocsDelete[DELETE /:id]
        SafetyDocsGeneratePDF[POST /:id/generate-pdf]
        SafetyDocsDownloadPDF[GET /:id/pdf]
    end
    
    subgraph Backups["/api/backups"]
        BackupsList[GET /]
        BackupsGet[GET /:id]
        BackupsCreate[POST /]
        BackupsDownload[GET /:id/download]
        BackupsDelete[DELETE /:id]
        BackupsRestore[POST /:id/restore]
        BackupsGoogleDriveAuth[GET /google-drive/auth]
        BackupsGoogleDriveStatus[GET /google-drive/status]
        BackupsSchedule[GET /schedule]
        BackupsScheduleUpdate[POST /schedule]
        BackupsCleanup[POST /cleanup]
    end
    
    subgraph Setup["/api/setup"]
        SetupStatus[GET /status]
        SetupAdmin[POST /admin]
        SetupLogo[POST /logo]
        SetupCompany[POST /company]
        SetupComplete[POST /complete]
        SetupBranding[GET /branding]
    end
    
    subgraph Permissions["/api/permissions"]
        PermissionsList[GET /]
        PermissionsGet[GET /:id]
        PermissionsCreate[POST /]
        PermissionsUpdate[PUT /:id]
        PermissionsDelete[DELETE /:id]
    end
    
    subgraph RolePermissions["/api/role-permissions"]
        RolePermissionsGet[GET /]
        RolePermissionsUpdate[PUT /]
    end
    
    subgraph Troubleshooter["/api/troubleshooter"]
        TroubleshooterRun[POST /run]
        TroubleshooterRoutes[GET /routes]
        TroubleshooterSuites[GET /suites]
    end
    
    subgraph Health["/api/health"]
        HealthCheck[GET /]
    end
    
    style Auth fill:#e3f2fd
    style Users fill:#fff3e0
    style Clients fill:#f3e5f5
    style Projects fill:#e8f5e9
    style Timesheets fill:#fff9c4
    style Xero fill:#ffebee
    style Settings fill:#eceff1
    style Dashboard fill:#e0f2f1
```

**Route Organization:**
- **Auth Routes**: Authentication and user session management
- **CRUD Routes**: Standard REST operations for users, clients, projects, timesheets, etc.
- **Xero Routes**: Extensive integration with Xero API (contacts, invoices, purchase orders, bills, expenses, payments, reports)
- **File Management**: Upload, download, and organization of project files and timesheet images
- **Settings & Configuration**: System settings, permissions, role management
- **Dashboard & Reports**: Aggregated data and analytics
- **Safety Documents**: JSA, compliance certificates, safety documents with PDF generation

---

## 4. Frontend Page Hierarchy

This diagram shows the frontend page structure, routing, and component relationships.

```mermaid
graph TB
    subgraph PublicRoutes["Public Routes"]
        Login[Login Page]
        ForgotPassword[Forgot Password Page]
    end
    
    subgraph ProtectedRoutes["Protected Routes (DashboardLayout)"]
        Dashboard[Dashboard Page]
        
        subgraph CorePages["Core Pages"]
            Projects[Projects Page]
            Clients[Clients Page]
            Timesheets[Timesheets Page]
            Reports[Reports Page]
        end
        
        subgraph FinancialPages["Financial Pages<br/>(can_view_financials)"]
            Financials[Financials Page]
            FinancialsInvoices[Invoices Tab]
            FinancialsQuotes[Quotes Tab]
            FinancialsPayments[Payments Tab]
            FinancialsPurchaseOrders[Purchase Orders Tab]
            FinancialsBills[Bills Tab]
            FinancialsExpenses[Expenses Tab]
            FinancialsCreditNotes[Credit Notes Tab]
            FinancialsReports[Financial Reports Tab]
        end
        
        subgraph AdminPages["Admin Pages<br/>(can_manage_users)"]
            Users[Users Page]
            Troubleshooter[Troubleshooter Page]
            Backups[Backups Page]
        end
        
        subgraph ConfigPages["Configuration Pages"]
            ActivityTypes[Activity Types Page<br/>(can_edit_activity_types)]
            Settings[Settings Page]
            UserSettings[User Settings Page]
        end
        
        subgraph FilePages["File Pages<br/>(can_view_financials)"]
            Files[Files Page]
            SafetyDocuments[Safety Documents Page]
        end
    end
    
    subgraph Modals["Modal Components"]
        ProjectDetailModal[Project Detail Modal]
        ClientDetailModal[Client Detail Modal]
        PaymentModal[Payment Modal]
        PurchaseOrderModal[Purchase Order Modal]
        BillModal[Bill Modal]
        ExpenseModal[Expense Modal]
        MobileTimesheetModal[Mobile Timesheet Modal]
        ImageViewer[Image Viewer Modal]
        NotificationsPanel[Notifications Panel]
        ErrorLogPanel[Error Log Panel]
    end
    
    subgraph SharedComponents["Shared Components"]
        Header[Header Component]
        Sidebar[Sidebar Component]
        DashboardLayout[Dashboard Layout]
    end
    
    Login -->|Authenticate| Dashboard
    ForgotPassword -->|Reset| Login
    
    DashboardLayout --> Header
    DashboardLayout --> Sidebar
    DashboardLayout --> Dashboard
    DashboardLayout --> CorePages
    DashboardLayout --> FinancialPages
    DashboardLayout --> AdminPages
    DashboardLayout --> ConfigPages
    DashboardLayout --> FilePages
    
    Projects --> ProjectDetailModal
    Clients --> ClientDetailModal
    Financials --> FinancialsInvoices
    Financials --> FinancialsQuotes
    Financials --> FinancialsPayments
    Financials --> FinancialsPurchaseOrders
    Financials --> FinancialsBills
    Financials --> FinancialsExpenses
    Financials --> FinancialsCreditNotes
    Financials --> FinancialsReports
    Financials --> PaymentModal
    Financials --> PurchaseOrderModal
    Financials --> BillModal
    Financials --> ExpenseModal
    Timesheets --> MobileTimesheetModal
    Timesheets --> ImageViewer
    Header --> NotificationsPanel
    Header --> ErrorLogPanel
    
    style PublicRoutes fill:#ffebee
    style ProtectedRoutes fill:#e8f5e9
    style CorePages fill:#e3f2fd
    style FinancialPages fill:#fff3e0
    style AdminPages fill:#f3e5f5
    style ConfigPages fill:#eceff1
    style FilePages fill:#fff9c4
    style Modals fill:#fce4ec
    style SharedComponents fill:#e0f2f1
```

**Page Structure:**
- **Public Routes**: Login and password recovery (no authentication required)
- **Protected Routes**: All main application pages require authentication
- **Permission-Based Access**: Financial pages, admin pages, and configuration pages require specific permissions
- **Modal Components**: Reusable modals for detailed views and forms
- **Shared Layout**: DashboardLayout provides consistent header and sidebar navigation

---

## 5. Form Inputs and Data Mapping

This section shows how user inputs in forms map to API endpoints and database tables.

### 5.1 Project Creation Form

```mermaid
flowchart LR
    subgraph ProjectForm["Project Form Inputs"]
        ProjectCode[Code Input]
        ProjectName[Name Input]
        ProjectClient[Client Select]
        ProjectStatus[Status Select]
        ProjectBudget[Budget Input]
        ProjectDescription[Description Textarea]
        ProjectStartDate[Start Date Picker]
        ProjectEndDate[End Date Picker]
        ProjectCostCenters[Cost Centers Multi-Select]
    end
    
    subgraph APIEndpoint["API Endpoint"]
        POSTProjects[POST /api/projects]
    end
    
    subgraph Database["Database Tables"]
        ProjectsTable[projects table]
        ProjectCostCentersTable[project_cost_centers<br/>junction table]
    end
    
    ProjectCode --> POSTProjects
    ProjectName --> POSTProjects
    ProjectClient --> POSTProjects
    ProjectStatus --> POSTProjects
    ProjectBudget --> POSTProjects
    ProjectDescription --> POSTProjects
    ProjectStartDate --> POSTProjects
    ProjectEndDate --> POSTProjects
    ProjectCostCenters --> POSTProjects
    
    POSTProjects --> ProjectsTable
    POSTProjects --> ProjectCostCentersTable
    
    style ProjectForm fill:#e3f2fd
    style APIEndpoint fill:#fff3e0
    style Database fill:#e8f5e9
```

**Project Form Mapping:**
- **Code**: Unique project identifier → `projects.code` (VARCHAR(50) UNIQUE)
- **Name**: Project name → `projects.name` (VARCHAR(255))
- **Client**: Selected client → `projects.client_id` (UUID FK to clients)
- **Status**: Project status → `projects.status` (ENUM: quoted, in-progress, completed, invoiced)
- **Budget**: Budget amount → `projects.budget` (DECIMAL(15,2))
- **Description**: Project description → `projects.description` (TEXT)
- **Dates**: Start/end dates → `projects.start_date`, `projects.end_date` (DATE)
- **Cost Centers**: Multiple selection → `project_cost_centers` junction table

### 5.2 Client Creation Form

```mermaid
flowchart LR
    subgraph ClientForm["Client Form Inputs"]
        ClientName[Name Input]
        ClientContact[Contact Name Input]
        ClientEmail[Email Input]
        ClientPhone[Phone Input]
        ClientAddress[Address Textarea]
        ClientLocation[Location Input]
        ClientBillingAddress[Billing Address Textarea]
        ClientBillingEmail[Billing Email Input]
        ClientNotes[Notes Textarea]
    end
    
    subgraph APIEndpoint["API Endpoint"]
        POSTClients[POST /api/clients]
    end
    
    subgraph Database["Database Table"]
        ClientsTable[clients table]
    end
    
    ClientName --> POSTClients
    ClientContact --> POSTClients
    ClientEmail --> POSTClients
    ClientPhone --> POSTClients
    ClientAddress --> POSTClients
    ClientLocation --> POSTClients
    ClientBillingAddress --> POSTClients
    ClientBillingEmail --> POSTClients
    ClientNotes --> POSTClients
    
    POSTClients --> ClientsTable
    
    style ClientForm fill:#e3f2fd
    style APIEndpoint fill:#fff3e0
    style Database fill:#e8f5e9
```

**Client Form Mapping:**
- **Name**: Client name → `clients.name` (VARCHAR(255))
- **Contact**: Contact person → `clients.contact_name` (VARCHAR(255))
- **Email**: Primary email → `clients.email` (VARCHAR(255))
- **Phone**: Phone number → `clients.phone` (VARCHAR(50))
- **Address**: Physical address → `clients.address` (TEXT)
- **Location**: Location string → `clients.location` (VARCHAR(255))
- **Billing**: Billing address/email → `clients.billing_address`, `clients.billing_email`
- **Notes**: Additional notes → `clients.notes` (TEXT)

### 5.3 Timesheet Entry Form

```mermaid
flowchart LR
    subgraph TimesheetForm["Timesheet Form Inputs"]
        TimesheetProject[Project Select]
        TimesheetActivity[Activity Type Select]
        TimesheetCostCenter[Cost Center Select]
        TimesheetDate[Date Picker]
        TimesheetHours[Hours Input]
        TimesheetNotes[Notes Textarea]
        TimesheetLocation[Location Input]
        TimesheetImages[Image Files Upload]
    end
    
    subgraph APIEndpoint["API Endpoint"]
        POSTTimesheets[POST /api/timesheets<br/>FormData if images]
    end
    
    subgraph Database["Database Tables"]
        TimesheetsTable[timesheets table]
        ImageStorage[File System<br/>uploads/timesheets/]
    end
    
    TimesheetProject --> POSTTimesheets
    TimesheetActivity --> POSTTimesheets
    TimesheetCostCenter --> POSTTimesheets
    TimesheetDate --> POSTTimesheets
    TimesheetHours --> POSTTimesheets
    TimesheetNotes --> POSTTimesheets
    TimesheetLocation --> POSTTimesheets
    TimesheetImages --> POSTTimesheets
    
    POSTTimesheets --> TimesheetsTable
    POSTTimesheets --> ImageStorage
    
    style TimesheetForm fill:#e3f2fd
    style APIEndpoint fill:#fff3e0
    style Database fill:#e8f5e9
```

**Timesheet Form Mapping:**
- **Project**: Selected project → `timesheets.project_id` (UUID FK)
- **Activity Type**: Work type → `timesheets.activity_type_id` (UUID FK)
- **Cost Center**: Budget allocation → `timesheets.cost_center_id` (UUID FK)
- **Date**: Work date → `timesheets.date` (DATE)
- **Hours**: Hours worked → `timesheets.hours` (DECIMAL(5,2))
- **Notes**: Work description → `timesheets.notes` (TEXT)
- **Location**: Work location → `timesheets.location` (VARCHAR(255))
- **Images**: Photo uploads → `timesheets.image_urls` (TEXT[]) + file storage

### 5.4 Purchase Order Creation Form

```mermaid
flowchart LR
    subgraph POForm["Purchase Order Form Inputs"]
        POSupplier[Supplier Select]
        POProject[Project Select]
        PODate[Date Picker]
        PODeliveryDate[Delivery Date Picker]
        POLineItems[Line Items Array<br/>- Description<br/>- Quantity<br/>- Unit Amount<br/>- Account Code<br/>- Cost Center<br/>- Item]
        PONotes[Notes Textarea]
        POCurrency[Currency Select]
    end
    
    subgraph APIEndpoint["API Endpoint"]
        POSTPurchaseOrders[POST /api/xero/purchase-orders]
    end
    
    subgraph Database["Database Tables"]
        POTable[xero_purchase_orders table]
        POLineItemsTable[xero_purchase_order_line_items table]
    end
    
    POSupplier --> POSTPurchaseOrders
    POProject --> POSTPurchaseOrders
    PODate --> POSTPurchaseOrders
    PODeliveryDate --> POSTPurchaseOrders
    POLineItems --> POSTPurchaseOrders
    PONotes --> POSTPurchaseOrders
    POCurrency --> POSTPurchaseOrders
    
    POSTPurchaseOrders --> POTable
    POSTPurchaseOrders --> POLineItemsTable
    
    style POForm fill:#e3f2fd
    style APIEndpoint fill:#fff3e0
    style Database fill:#e8f5e9
```

**Purchase Order Form Mapping:**
- **Supplier**: Client as supplier → `xero_purchase_orders.supplier_id` (UUID FK to clients)
- **Project**: Linked project → `xero_purchase_orders.project_id` (UUID FK, nullable)
- **Dates**: PO date and delivery → `xero_purchase_orders.date`, `delivery_date` (DATE)
- **Line Items**: Array of items → `xero_purchase_order_line_items` table with:
  - Description, quantity, unit_amount, line_amount
  - Account code, cost_center_id, item_id
- **Notes**: Additional notes → `xero_purchase_orders.notes` (TEXT)
- **Currency**: Currency code → `xero_purchase_orders.currency` (VARCHAR(10))

### 5.5 Bill Creation Form

```mermaid
flowchart LR
    subgraph BillForm["Bill Form Inputs"]
        BillSupplier[Supplier Select]
        BillPurchaseOrder[Purchase Order Select<br/>Optional]
        BillProject[Project Select]
        BillDate[Date Picker]
        BillDueDate[Due Date Picker]
        BillLineItems[Line Items Array<br/>- Description<br/>- Quantity<br/>- Unit Amount<br/>- Account Code]
        BillReference[Reference Input]
        BillCurrency[Currency Select]
    end
    
    subgraph APIEndpoint["API Endpoint"]
        POSTBills[POST /api/xero/bills]
    end
    
    subgraph Database["Database Table"]
        BillsTable[xero_bills table]
    end
    
    BillSupplier --> POSTBills
    BillPurchaseOrder --> POSTBills
    BillProject --> POSTBills
    BillDate --> POSTBills
    BillDueDate --> POSTBills
    BillLineItems --> POSTBills
    BillReference --> POSTBills
    BillCurrency --> POSTBills
    
    POSTBills --> BillsTable
    
    style BillForm fill:#e3f2fd
    style APIEndpoint fill:#fff3e0
    style Database fill:#e8f5e9
```

**Bill Form Mapping:**
- **Supplier**: Bill supplier → `xero_bills.supplier_id` (UUID FK)
- **Purchase Order**: Optional linked PO → `xero_bills.purchase_order_id` (UUID FK, nullable)
- **Project**: Linked project → `xero_bills.project_id` (UUID FK, nullable)
- **Dates**: Bill date and due date → `xero_bills.date`, `due_date` (DATE)
- **Line Items**: Bill items → `xero_bills.line_items` (JSONB)
- **Reference**: Reference number → Stored in line_items or separate field
- **Currency**: Currency code → `xero_bills.currency` (VARCHAR(10))

### 5.6 Expense Creation Form

```mermaid
flowchart LR
    subgraph ExpenseForm["Expense Form Inputs"]
        ExpenseProject[Project Select<br/>Optional]
        ExpenseCostCenter[Cost Center Select<br/>Optional]
        ExpenseAmount[Amount Input]
        ExpenseDate[Date Picker]
        ExpenseDescription[Description Textarea]
        ExpenseReceipt[Receipt File Upload<br/>Optional]
        ExpenseCurrency[Currency Select]
    end
    
    subgraph APIEndpoint["API Endpoint"]
        POSTExpenses[POST /api/xero/expenses]
    end
    
    subgraph Database["Database Table"]
        ExpensesTable[xero_expenses table]
    end
    
    ExpenseProject --> POSTExpenses
    ExpenseCostCenter --> POSTExpenses
    ExpenseAmount --> POSTExpenses
    ExpenseDate --> POSTExpenses
    ExpenseDescription --> POSTExpenses
    ExpenseReceipt --> POSTExpenses
    ExpenseCurrency --> POSTExpenses
    
    POSTExpenses --> ExpensesTable
    
    style ExpenseForm fill:#e3f2fd
    style APIEndpoint fill:#fff3e0
    style Database fill:#e8f5e9
```

**Expense Form Mapping:**
- **Project**: Optional project link → `xero_expenses.project_id` (UUID FK, nullable)
- **Cost Center**: Optional cost center → `xero_expenses.cost_center_id` (UUID FK, nullable)
- **Amount**: Expense amount → `xero_expenses.amount` (DECIMAL(15,2))
- **Date**: Expense date → `xero_expenses.date` (DATE)
- **Description**: Expense description → `xero_expenses.description` (TEXT)
- **Receipt**: Receipt image URL → `xero_expenses.receipt_url` (TEXT)
- **Currency**: Currency code → Defaults to USD

---

## 6. User Journey Flows

This section shows key user workflows through the application.

### 6.1 Project Creation to Invoice Generation Flow

```mermaid
sequenceDiagram
    participant User
    participant ProjectsPage
    participant ClientsPage
    participant TimesheetsPage
    participant FinancialsPage
    participant API
    participant Database
    participant XeroAPI
    
    User->>ClientsPage: Create New Client
    ClientsPage->>API: POST /api/clients
    API->>Database: INSERT INTO clients
    Database-->>API: Client created
    API-->>ClientsPage: Client data
    ClientsPage-->>User: Client created
    
    User->>ProjectsPage: Create New Project
    ProjectsPage->>API: POST /api/projects<br/>{client_id, code, name, budget}
    API->>Database: INSERT INTO projects<br/>INSERT INTO project_cost_centers
    Database-->>API: Project created
    API-->>ProjectsPage: Project data
    ProjectsPage-->>User: Project created
    
    User->>TimesheetsPage: Log Time Entry
    TimesheetsPage->>API: POST /api/timesheets<br/>{project_id, hours, date, images}
    API->>Database: INSERT INTO timesheets<br/>Store images
    Database-->>API: Timesheet created
    API-->>TimesheetsPage: Timesheet data
    TimesheetsPage-->>User: Time logged
    
    Note over User,Database: Multiple timesheet entries accumulate
    
    User->>FinancialsPage: Generate Invoice from Timesheets
    FinancialsPage->>API: POST /api/xero/invoices/from-timesheets<br/>{client_id, project_id, date_from, date_to}
    API->>Database: SELECT timesheets WHERE criteria
    Database-->>API: Timesheet data
    API->>XeroAPI: POST /Invoices<br/>(Create invoice in Xero)
    XeroAPI-->>API: Invoice created
    API->>Database: INSERT INTO xero_invoices<br/>UPDATE timesheets SET invoice_id
    Database-->>API: Invoice synced
    API-->>FinancialsPage: Invoice data
    FinancialsPage-->>User: Invoice generated
```

**Key Steps:**
1. Create client (if new)
2. Create project linked to client
3. Log multiple timesheet entries for the project
4. Generate invoice from accumulated timesheets
5. Invoice synced to Xero and linked back to timesheets

### 6.2 Purchase Order to Bill to Payment Flow

```mermaid
sequenceDiagram
    participant User
    participant FinancialsPage
    participant API
    participant Database
    participant XeroAPI
    
    User->>FinancialsPage: Create Purchase Order
    FinancialsPage->>API: POST /api/xero/purchase-orders<br/>{supplier_id, project_id, line_items}
    API->>XeroAPI: POST /PurchaseOrders
    XeroAPI-->>API: PO created
    API->>Database: INSERT INTO xero_purchase_orders<br/>INSERT INTO xero_purchase_order_line_items
    Database-->>API: PO saved
    API-->>FinancialsPage: PO data
    FinancialsPage-->>User: Purchase Order created
    
    Note over User,XeroAPI: PO status: DRAFT → SUBMITTED → AUTHORISED
    
    User->>FinancialsPage: Convert PO to Bill
    FinancialsPage->>API: POST /api/xero/purchase-orders/:id/convert-to-bill
    API->>XeroAPI: POST /Invoices (Type: ACCPAY)
    XeroAPI-->>API: Bill created
    API->>Database: INSERT INTO xero_bills<br/>UPDATE xero_purchase_orders SET bill_id
    Database-->>API: Bill saved
    API-->>FinancialsPage: Bill data
    FinancialsPage-->>User: Bill created from PO
    
    User->>FinancialsPage: Record Payment
    FinancialsPage->>API: POST /api/xero/bills/:id/pay<br/>{amount, payment_date}
    API->>XeroAPI: POST /Payments
    XeroAPI-->>API: Payment created
    API->>Database: INSERT INTO xero_payments<br/>UPDATE xero_bills SET amount_paid
    Database-->>API: Payment saved
    API-->>FinancialsPage: Payment data
    FinancialsPage-->>User: Payment recorded
```

**Key Steps:**
1. Create purchase order with line items
2. Authorize purchase order
3. Convert authorized PO to bill
4. Record payment against bill
5. Bill status updates to PAID

### 6.3 Client Sync with Xero Flow

```mermaid
sequenceDiagram
    participant User
    participant ClientsPage
    participant API
    participant Database
    participant XeroAPI
    
    User->>ClientsPage: View Clients
    ClientsPage->>API: GET /api/clients
    API->>Database: SELECT FROM clients
    Database-->>API: Client list
    API-->>ClientsPage: Client data
    ClientsPage-->>User: Display clients
    
    User->>ClientsPage: Push Client to Xero
    ClientsPage->>API: POST /api/xero/contacts/push/:id
    API->>Database: SELECT client WHERE id
    Database-->>API: Client data
    API->>XeroAPI: POST /Contacts<br/>(Create/Update contact)
    XeroAPI-->>API: Contact created/updated<br/>{ContactID}
    API->>Database: UPDATE clients SET xero_contact_id
    Database-->>API: Client updated
    API-->>ClientsPage: Sync result
    ClientsPage-->>User: Client synced to Xero
    
    Note over User,XeroAPI: Or pull all contacts from Xero
    
    User->>ClientsPage: Pull Contacts from Xero
    ClientsPage->>API: POST /api/xero/contacts/pull
    API->>XeroAPI: GET /Contacts
    XeroAPI-->>API: Contact list
    API->>Database: INSERT/UPDATE clients<br/>(Match by email or create new)
    Database-->>API: Clients synced
    API-->>ClientsPage: Sync results<br/>{created, updated, skipped}
    ClientsPage-->>User: Contacts synced from Xero
```

**Key Steps:**
1. View local clients
2. Push single client to Xero (creates/updates Xero contact)
3. Store Xero contact ID in local client record
4. Or pull all contacts from Xero (bidirectional sync)

### 6.4 Timesheet Entry with Image Upload Flow

```mermaid
sequenceDiagram
    participant User
    participant TimesheetsPage
    participant API
    participant Database
    participant FileSystem
    
    User->>TimesheetsPage: Fill Timesheet Form<br/>{project, activity, hours, date, notes}
    User->>TimesheetsPage: Select Images<br/>(Multiple files)
    User->>TimesheetsPage: Submit Form
    
    TimesheetsPage->>API: POST /api/timesheets<br/>(FormData with images)
    API->>FileSystem: Save images to<br/>uploads/timesheets/:project_id/
    FileSystem-->>API: Image paths
    API->>Database: INSERT INTO timesheets<br/>{project_id, hours, date, image_urls[]}
    Database-->>API: Timesheet created
    API-->>TimesheetsPage: Timesheet data with image URLs
    TimesheetsPage-->>User: Timesheet saved
    
    User->>TimesheetsPage: View Timesheet
    TimesheetsPage->>API: GET /api/timesheets/:id
    API->>Database: SELECT timesheet with joins
    Database-->>API: Timesheet with image_urls
    API-->>TimesheetsPage: Timesheet data
    TimesheetsPage->>FileSystem: Load images from URLs
    FileSystem-->>TimesheetsPage: Image files
    TimesheetsPage-->>User: Display timesheet with images
```

**Key Steps:**
1. User fills timesheet form and selects images
2. Form submitted as FormData (multipart)
3. Backend saves images to file system
4. Image paths stored in `timesheets.image_urls` array
5. Images served via static file route `/uploads/timesheets/...`

### 6.5 Financial Report Generation Flow

```mermaid
sequenceDiagram
    participant User
    participant FinancialsPage
    participant FinancialReportsTab
    participant API
    participant Database
    participant XeroAPI
    
    User->>FinancialsPage: Navigate to Financial Reports Tab
    FinancialsPage->>FinancialReportsTab: Render Reports Tab
    
    User->>FinancialReportsTab: Select Report Type<br/>(Profit & Loss)
    User->>FinancialReportsTab: Set Date Range
    User->>FinancialReportsTab: Generate Report
    
    FinancialReportsTab->>API: GET /api/xero/reports/profit-loss<br/>?date_from=...&date_to=...
    API->>XeroAPI: GET /Reports/ProfitAndLoss<br/>{fromDate, toDate}
    XeroAPI-->>API: Report data<br/>{Rows, Columns, Values}
    API->>Database: Cache report data<br/>(Optional)
    Database-->>API: Report cached
    API-->>FinancialReportsTab: Formatted report data
    FinancialReportsTab-->>User: Display report<br/>(Charts, Tables)
    
    Note over User,XeroAPI: Similar flow for:<br/>Balance Sheet, Cash Flow,<br/>Aged Receivables, Aged Payables
```

**Key Steps:**
1. User navigates to Financial Reports tab
2. Selects report type and date range
3. API calls Xero Reports endpoint
4. Xero returns formatted report data
5. Frontend displays report with charts/tables

---

## Summary

This document provides comprehensive visual documentation of:

1. **System Architecture**: Overall structure showing frontend, backend, database, and external services
2. **Database Schema**: Complete entity relationship diagram with all tables and foreign keys
3. **API Routes**: Organized backend routes grouped by domain with HTTP methods
4. **Frontend Structure**: Page hierarchy, routing, and component relationships
5. **Form Mappings**: Detailed input-to-database mappings for major forms
6. **User Journeys**: Sequence diagrams showing key workflows through the system

These diagrams serve as:
- **Onboarding documentation** for new developers
- **Reference guide** for understanding data flows
- **Architecture documentation** for system design decisions
- **Troubleshooting aid** for tracing data through the system
