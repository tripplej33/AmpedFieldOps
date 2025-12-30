import { query } from './index';

/**
 * Ensures all Xero-related tables exist
 * Creates them if they don't exist
 */
export async function ensureXeroTables(): Promise<void> {
  const tables = [
    'xero_invoices',
    'xero_quotes',
    'xero_purchase_orders',
    'xero_purchase_order_line_items',
    'xero_bills',
    'xero_expenses',
    'xero_payments',
    'bank_transactions',
    'xero_credit_notes'
  ];

  for (const tableName of tables) {
    try {
      // Check if table exists
      const result = await query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [tableName]
      );

      if (!result.rows[0].exists) {
        console.log(`[Migration] Creating missing table: ${tableName}`);
        await createTable(tableName);
      }
    } catch (error: any) {
      console.error(`[Migration] Error checking/creating table ${tableName}:`, error.message);
    }
  }
}

async function createTable(tableName: string): Promise<void> {
  const tableDefinitions: Record<string, string | string[]> = {
    'xero_invoices': [
      `CREATE TABLE IF NOT EXISTS xero_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_invoice_id VARCHAR(100) UNIQUE NOT NULL,
        invoice_number VARCHAR(50),
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        status VARCHAR(50),
        amount_due DECIMAL(15,2),
        amount_paid DECIMAL(15,2),
        total DECIMAL(15,2),
        currency VARCHAR(10) DEFAULT 'USD',
        issue_date DATE,
        due_date DATE,
        line_items JSONB,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `ALTER TABLE xero_invoices ADD COLUMN IF NOT EXISTS paid_date DATE`,
      `ALTER TABLE xero_invoices ADD COLUMN IF NOT EXISTS last_payment_date DATE`
    ],
    'xero_quotes': `
      CREATE TABLE IF NOT EXISTS xero_quotes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_quote_id VARCHAR(100) UNIQUE NOT NULL,
        quote_number VARCHAR(50),
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        status VARCHAR(50),
        total DECIMAL(15,2),
        currency VARCHAR(10) DEFAULT 'USD',
        issue_date DATE,
        expiry_date DATE,
        line_items JSONB,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'xero_purchase_orders': `
      CREATE TABLE IF NOT EXISTS xero_purchase_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_po_id VARCHAR(100) UNIQUE,
        po_number VARCHAR(50),
        supplier_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'BILLED', 'CANCELLED')),
        date DATE NOT NULL,
        delivery_date DATE,
        total_amount DECIMAL(15,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'USD',
        line_items JSONB,
        bill_id UUID,
        notes TEXT,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'xero_purchase_order_line_items': `
      CREATE TABLE IF NOT EXISTS xero_purchase_order_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        po_id UUID NOT NULL REFERENCES xero_purchase_orders(id) ON DELETE CASCADE,
        description TEXT,
        quantity DECIMAL(10,2),
        unit_amount DECIMAL(15,2),
        account_code VARCHAR(50),
        cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
        item_id UUID,
        line_amount DECIMAL(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'xero_bills': `
      CREATE TABLE IF NOT EXISTS xero_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_bill_id VARCHAR(100) UNIQUE,
        bill_number VARCHAR(50),
        supplier_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        purchase_order_id UUID REFERENCES xero_purchase_orders(id) ON DELETE SET NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        amount DECIMAL(15,2) NOT NULL,
        amount_paid DECIMAL(15,2) DEFAULT 0,
        amount_due DECIMAL(15,2),
        currency VARCHAR(10) DEFAULT 'USD',
        date DATE NOT NULL,
        due_date DATE,
        status VARCHAR(50) DEFAULT 'AUTHORISED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED')),
        paid_date DATE,
        line_items JSONB,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'xero_expenses': `
      CREATE TABLE IF NOT EXISTS xero_expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_expense_id VARCHAR(100) UNIQUE,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
        amount DECIMAL(15,2) NOT NULL,
        date DATE NOT NULL,
        description TEXT,
        receipt_url TEXT,
        status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID')),
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'xero_payments': `
      CREATE TABLE IF NOT EXISTS xero_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_payment_id VARCHAR(100) UNIQUE,
        invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL,
        amount DECIMAL(15,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        reference VARCHAR(255),
        bank_transaction_id UUID,
        account_code VARCHAR(50),
        currency VARCHAR(10) DEFAULT 'USD',
        exchange_rate DECIMAL(10,4) DEFAULT 1,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'bank_transactions': `
      CREATE TABLE IF NOT EXISTS bank_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_bank_transaction_id VARCHAR(100) UNIQUE,
        bank_account_code VARCHAR(50),
        bank_account_name VARCHAR(255),
        date DATE NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('RECEIVE', 'SPEND')),
        description TEXT,
        reference VARCHAR(255),
        contact_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        reconciled BOOLEAN DEFAULT false,
        payment_id UUID REFERENCES xero_payments(id) ON DELETE SET NULL,
        reconciled_date DATE,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'xero_credit_notes': `
      CREATE TABLE IF NOT EXISTS xero_credit_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        xero_credit_note_id VARCHAR(100) UNIQUE,
        credit_note_number VARCHAR(50),
        invoice_id UUID REFERENCES xero_invoices(id) ON DELETE SET NULL,
        amount DECIMAL(15,2) NOT NULL,
        date DATE NOT NULL,
        reason TEXT,
        status VARCHAR(50) DEFAULT 'AUTHORISED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'VOIDED')),
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  };

  const sql = tableDefinitions[tableName];
  if (!sql) {
    throw new Error(`No table definition found for ${tableName}`);
  }

  // Handle both single SQL string and array of SQL statements
  if (Array.isArray(sql)) {
    for (const statement of sql) {
      await query(statement);
    }
  } else {
    await query(sql);
  }
}

