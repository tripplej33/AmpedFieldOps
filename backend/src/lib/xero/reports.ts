import { query } from '../../db';

/**
 * Get Profit & Loss report from Xero
 */
export async function getProfitLossReport(
  tokenData: { accessToken: string; tenantId: string },
  dateFrom?: string,
  dateTo?: string
): Promise<any> {
  try {
    let url = 'https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss';
    const params = new URLSearchParams();
    
    if (dateFrom) {
      params.append('fromDate', dateFrom);
    }
    if (dateTo) {
      params.append('toDate', dateTo);
    }
    params.append('periods', '12'); // 12 months
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero P&L report fetch failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching P&L report:', error);
    return null;
  }
}

/**
 * Get Balance Sheet report from Xero
 */
export async function getBalanceSheetReport(
  tokenData: { accessToken: string; tenantId: string },
  date?: string
): Promise<any> {
  try {
    let url = 'https://api.xero.com/api.xro/2.0/Reports/BalanceSheet';
    const params = new URLSearchParams();
    
    if (date) {
      params.append('date', date);
    }
    params.append('periods', '12');
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero Balance Sheet report fetch failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Balance Sheet report:', error);
    return null;
  }
}

/**
 * Get Cash Flow report from Xero
 */
export async function getCashFlowReport(
  tokenData: { accessToken: string; tenantId: string },
  dateFrom?: string,
  dateTo?: string
): Promise<any> {
  try {
    let url = 'https://api.xero.com/api.xro/2.0/Reports/Cashflow';
    const params = new URLSearchParams();
    
    if (dateFrom) {
      params.append('fromDate', dateFrom);
    }
    if (dateTo) {
      params.append('toDate', dateTo);
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero Cash Flow report fetch failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Cash Flow report:', error);
    return null;
  }
}

/**
 * Get Aged Receivables report from Xero
 */
export async function getAgedReceivablesReport(
  tokenData: { accessToken: string; tenantId: string },
  date?: string
): Promise<any> {
  try {
    let url = 'https://api.xero.com/api.xro/2.0/Reports/AgedReceivables';
    const params = new URLSearchParams();
    
    if (date) {
      params.append('date', date);
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero Aged Receivables report fetch failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Aged Receivables report:', error);
    return null;
  }
}

/**
 * Get Aged Payables report from Xero
 */
export async function getAgedPayablesReport(
  tokenData: { accessToken: string; tenantId: string },
  date?: string
): Promise<any> {
  try {
    let url = 'https://api.xero.com/api.xro/2.0/Reports/AgedPayables';
    const params = new URLSearchParams();
    
    if (date) {
      params.append('date', date);
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Xero-Tenant-Id': tokenData.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Xero Aged Payables report fetch failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Aged Payables report:', error);
    return null;
  }
}

