import { query } from '../../db';

export interface CreatePurchaseOrderData {
  supplier_id: string;
  project_id: string; // REQUIRED
  date: string;
  delivery_date?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_amount: number;
    account_code?: string;
    cost_center_id?: string;
    item_id?: string;
  }>;
  notes?: string;
  currency?: string;
}

export interface XeroPurchaseOrderRequest {
  Contact: { ContactID: string };
  Date: string;
  DeliveryDate?: string;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
    ItemCode?: string;
    Tracking?: Array<{ Name: string; Option: string }>;
  }>;
  Reference?: string;
}

/**
 * Create a purchase order in Xero
 */
export async function createPurchaseOrderInXero(
  tokenData: { accessToken: string; tenantId: string },
  poData: CreatePurchaseOrderData,
  supplierXeroId: string,
  trackingCategories?: Array<{ name: string; option: string }>
): Promise<{ PurchaseOrderID: string; Date: string; Total: number } | null> {
  try {
    const xeroPO: XeroPurchaseOrderRequest = {
      Contact: { ContactID: supplierXeroId },
      Date: poData.date,
      DeliveryDate: poData.delivery_date,
      LineItems: poData.line_items.map(item => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unit_amount,
        AccountCode: item.account_code,
        ItemCode: item.item_id,
        Tracking: trackingCategories?.map(tc => ({ Name: tc.name, Option: tc.option })),
      })),
      Reference: poData.notes,
    };

    const response = await fetch('https://api.xero.com/api.xro/2.0/PurchaseOrders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ PurchaseOrders: [xeroPO] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero purchase order creation failed:', errorText);
      return null;
    }

    const result = await response.json() as { PurchaseOrders: Array<{ PurchaseOrderID: string; Date: string; Total: number }> };
    return result.PurchaseOrders?.[0] || null;
  } catch (error) {
    console.error('Error creating purchase order in Xero:', error);
    return null;
  }
}

/**
 * Store purchase order in local database
 */
export async function storePurchaseOrder(
  poData: CreatePurchaseOrderData & { xero_po_id?: string; po_number?: string }
): Promise<string> {
  const totalAmount = poData.line_items.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);

  const result = await query(
    `INSERT INTO xero_purchase_orders (
      xero_po_id, po_number, supplier_id, project_id, date, delivery_date,
      total_amount, currency, line_items, notes, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [
      poData.xero_po_id || null,
      poData.po_number || null,
      poData.supplier_id,
      poData.project_id,
      poData.date,
      poData.delivery_date || null,
      totalAmount,
      poData.currency || 'USD',
      JSON.stringify(poData.line_items),
      poData.notes || null,
      poData.xero_po_id ? new Date() : null,
    ]
  );

  const poId = result.rows[0].id;

  // Store line items separately for detailed tracking
  for (const item of poData.line_items) {
    await query(
      `INSERT INTO xero_purchase_order_line_items (
        po_id, description, quantity, unit_amount, account_code, cost_center_id, item_id, line_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        poId,
        item.description,
        item.quantity,
        item.unit_amount,
        item.account_code || null,
        item.cost_center_id || null,
        item.item_id || null,
        item.quantity * item.unit_amount,
      ]
    );
  }

  // Update project PO commitments
  await query(
    `UPDATE projects 
     SET po_commitments = COALESCE(po_commitments, 0) + $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [totalAmount, poData.project_id]
  );

  return poId;
}

/**
 * Get purchase orders with filters
 */
export async function getPurchaseOrders(filters: {
  project_id?: string;
  supplier_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<any[]> {
  let sql = `
    SELECT po.*,
      c.name as supplier_name,
      p.code as project_code,
      p.name as project_name
    FROM xero_purchase_orders po
    LEFT JOIN clients c ON po.supplier_id = c.id
    LEFT JOIN projects p ON po.project_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.project_id) {
    sql += ` AND po.project_id = $${paramCount++}`;
    params.push(filters.project_id);
  }

  if (filters.supplier_id) {
    sql += ` AND po.supplier_id = $${paramCount++}`;
    params.push(filters.supplier_id);
  }

  if (filters.status) {
    sql += ` AND po.status = $${paramCount++}`;
    params.push(filters.status);
  }

  if (filters.date_from) {
    sql += ` AND po.date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND po.date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  sql += ' ORDER BY po.date DESC, po.created_at DESC';

  try {
    const result = await query(sql, params);
    return result.rows;
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to fetch purchase orders';
    const isTableError = errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01';
    if (isTableError) {
      // Return empty array instead of error - tables will be created when migrations run
      console.warn('[Xero] xero_purchase_orders table not found. Returning empty array. Run migrations to create tables.');
      return [];
    }
    throw error;
  }
}

/**
 * Get purchase order with line items
 */
export async function getPurchaseOrderById(poId: string): Promise<any | null> {
  const poResult = await query(
    `SELECT po.*,
      c.name as supplier_name,
      p.code as project_code,
      p.name as project_name
    FROM xero_purchase_orders po
    LEFT JOIN clients c ON po.supplier_id = c.id
    LEFT JOIN projects p ON po.project_id = p.id
    WHERE po.id = $1`,
    [poId]
  );

  if (poResult.rows.length === 0) {
    return null;
  }

  const po = poResult.rows[0];

  // Get line items
  const lineItemsResult = await query(
    `SELECT li.*, cc.code as cost_center_code, cc.name as cost_center_name
     FROM xero_purchase_order_line_items li
     LEFT JOIN cost_centers cc ON li.cost_center_id = cc.id
     WHERE li.po_id = $1
     ORDER BY li.created_at`,
    [poId]
  );

  po.line_items_detail = lineItemsResult.rows;
  return po;
}

/**
 * Update purchase order status
 */
export async function updatePurchaseOrderStatus(poId: string, status: string): Promise<void> {
  await query(
    `UPDATE xero_purchase_orders 
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [status, poId]
  );
}

