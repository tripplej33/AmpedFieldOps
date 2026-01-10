-- Indexes and Constraints Migration
-- Performance indexes and full-text search indexes

-- Core tables indexes
CREATE INDEX IF NOT EXISTS idx_timesheets_user_id ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_project_id ON timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(date);
CREATE INDEX IF NOT EXISTS idx_timesheets_billing_status ON timesheets(billing_status);
CREATE INDEX IF NOT EXISTS idx_timesheets_invoice_id ON timesheets(invoice_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Xero tables indexes
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_project_id ON xero_purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_supplier_id ON xero_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_status ON xero_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_xero_purchase_orders_date ON xero_purchase_orders(date);
CREATE INDEX IF NOT EXISTS idx_xero_po_line_items_po_id ON xero_purchase_order_line_items(po_id);
CREATE INDEX IF NOT EXISTS idx_xero_po_line_items_cost_center_id ON xero_purchase_order_line_items(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_supplier_id ON xero_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_purchase_order_id ON xero_bills(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_project_id ON xero_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_xero_bills_status ON xero_bills(status);
CREATE INDEX IF NOT EXISTS idx_xero_expenses_project_id ON xero_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_xero_expenses_cost_center_id ON xero_expenses(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_xero_expenses_date ON xero_expenses(date);
CREATE INDEX IF NOT EXISTS idx_xero_payments_invoice_id ON xero_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_xero_payments_payment_date ON xero_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_xero_payments_xero_payment_id ON xero_payments(xero_payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(reconciled);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_payment_id ON bank_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_xero_bank_transaction_id ON bank_transactions(xero_bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_invoice_id ON xero_credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_date ON xero_credit_notes(date);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_status ON xero_credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_xero_credit_notes_xero_credit_note_id ON xero_credit_notes(xero_credit_note_id);

-- File management indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_cost_center_id ON project_files(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_project_files_file_type ON project_files(file_type);
CREATE INDEX IF NOT EXISTS idx_safety_documents_project_id ON safety_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_safety_documents_cost_center_id ON safety_documents(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_safety_documents_type ON safety_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_safety_documents_status ON safety_documents(status);
CREATE INDEX IF NOT EXISTS idx_document_scans_file_id ON document_scans(file_id);
CREATE INDEX IF NOT EXISTS idx_document_scans_user_id ON document_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_document_scans_status ON document_scans(status);
CREATE INDEX IF NOT EXISTS idx_document_scans_document_type ON document_scans(document_type);
CREATE INDEX IF NOT EXISTS idx_document_scans_created_at ON document_scans(created_at);
CREATE INDEX IF NOT EXISTS idx_document_matches_scan_id ON document_matches(scan_id);
CREATE INDEX IF NOT EXISTS idx_document_matches_entity ON document_matches(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_document_matches_confirmed ON document_matches(confirmed);
CREATE INDEX IF NOT EXISTS idx_file_migrations_file_id ON file_migrations(file_id);
CREATE INDEX IF NOT EXISTS idx_file_migrations_status ON file_migrations(status);
CREATE INDEX IF NOT EXISTS idx_file_migrations_entity ON file_migrations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_migrations_source_path ON file_migrations(source_path);
CREATE INDEX IF NOT EXISTS idx_file_migrations_destination_path ON file_migrations(destination_path);
CREATE INDEX IF NOT EXISTS idx_backups_created_by ON backups(created_by);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_backups_storage_type ON backups(storage_type);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_clients_search ON clients USING gin(to_tsvector('english', name || ' ' || COALESCE(contact_name, '') || ' ' || COALESCE(address, '')));
CREATE INDEX IF NOT EXISTS idx_projects_search ON projects USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_timesheets_search ON timesheets USING gin(to_tsvector('english', COALESCE(notes, '')));
