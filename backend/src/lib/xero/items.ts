import { query } from '../../db';
import { fetchWithRateLimit } from './rateLimiter';
import { parseXeroError, getErrorMessage } from './errorHandler';

export interface XeroItem {
  ItemID: string;
  Code: string;
  Name: string;
  Description?: string;
  PurchaseDetails?: {
    UnitPrice?: number;
  };
  SalesDetails?: {
    UnitPrice?: number;
  };
  IsTrackedAsInventory?: boolean;
  InventoryAssetAccountCode?: string;
}

/**
 * Sync items from Xero
 */
export async function syncItemsFromXero(
  tokenData: { accessToken: string; tenantId: string }
): Promise<number> {
  try {
    const response = await fetchWithRateLimit('https://api.xero.com/api.xro/2.0/Items', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await parseXeroError(response);
      const errorMessage = getErrorMessage(error);
      console.error('Xero items fetch failed:', errorMessage, error);
      throw new Error(errorMessage);
    }

    interface XeroItemsResponse {
      Items: XeroItem[];
    }

    const data = await response.json() as XeroItemsResponse;
    const items = data.Items || [];
    let synced = 0;

    for (const item of items) {
      // Check if item already exists
      const existing = await query(
        'SELECT id FROM xero_items WHERE xero_item_id = $1',
        [item.ItemID]
      );

      const purchasePrice = item.PurchaseDetails?.UnitPrice || 0;
      const salePrice = item.SalesDetails?.UnitPrice || 0;
      const stockLevel = 0; // Xero doesn't provide stock levels via API directly, would need inventory endpoints

      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO xero_items (
            xero_item_id, code, name, description, purchase_price, sale_price, 
            stock_level, is_tracked, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
          [
            item.ItemID,
            item.Code,
            item.Name,
            item.Description || null,
            purchasePrice,
            salePrice,
            stockLevel,
            item.IsTrackedAsInventory || false,
          ]
        );
      } else {
        await query(
          `UPDATE xero_items 
           SET code = $1, name = $2, description = $3, purchase_price = $4, 
               sale_price = $5, is_tracked = $6, synced_at = CURRENT_TIMESTAMP
           WHERE xero_item_id = $7`,
          [
            item.Code,
            item.Name,
            item.Description || null,
            purchasePrice,
            salePrice,
            item.IsTrackedAsInventory || false,
            item.ItemID,
          ]
        );
      }
      synced++;
    }

    return synced;
  } catch (error) {
    console.error('Error syncing items from Xero:', error);
    return 0;
  }
}

/**
 * Get items with filters
 */
export async function getItems(filters: {
  search?: string;
  is_tracked?: boolean;
}): Promise<any[]> {
  let sql = `
    SELECT * FROM xero_items
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.search) {
    sql += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
    params.push(`%${filters.search}%`);
    paramCount++;
  }

  if (filters.is_tracked !== undefined) {
    sql += ` AND is_tracked = $${paramCount++}`;
    params.push(filters.is_tracked);
  }

  sql += ' ORDER BY name ASC';

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get item by ID
 */
export async function getItemById(itemId: string): Promise<any | null> {
  const result = await query('SELECT * FROM xero_items WHERE id = $1', [itemId]);
  return result.rows[0] || null;
}

/**
 * Update item stock level
 */
export async function updateItemStock(itemId: string, stockLevel: number): Promise<void> {
  await query(
    `UPDATE xero_items 
     SET stock_level = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [stockLevel, itemId]
  );
}

