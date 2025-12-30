import { query } from '../../db';
import { sendEmail } from '../email';

export interface ReminderSchedule {
  days_after_due: number[];
  email_template?: string;
  enabled: boolean;
}

/**
 * Get reminder schedule settings
 */
export async function getReminderSchedule(): Promise<ReminderSchedule> {
  const result = await query(
    `SELECT value FROM settings WHERE key = 'payment_reminder_schedule' AND user_id IS NULL`
  );

  if (result.rows.length > 0 && result.rows[0].value) {
    try {
      return JSON.parse(result.rows[0].value);
    } catch (e) {
      // Invalid JSON, return default
    }
  }

  // Default schedule: 7, 14, 30 days after due date
  return {
    days_after_due: [7, 14, 30],
    enabled: true,
  };
}

/**
 * Update reminder schedule settings
 */
export async function updateReminderSchedule(schedule: ReminderSchedule): Promise<void> {
  await query(
    `INSERT INTO settings (key, value, user_id, updated_at)
     VALUES ('payment_reminder_schedule', $1, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (key, user_id) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(schedule)]
  );
}

/**
 * Send payment reminder for an invoice
 */
export async function sendPaymentReminder(
  invoiceId: string,
  reminderType: string,
  userEmail?: string
): Promise<boolean> {
  try {
    // Get invoice details with client information
    const invoiceResult = await query(
      `SELECT xi.*, c.name as client_name, c.email as client_email, c.billing_email
       FROM xero_invoices xi
       LEFT JOIN clients c ON xi.client_id = c.id
       WHERE xi.id = $1`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      return false;
    }

    const invoice = invoiceResult.rows[0];
    const recipientEmail = invoice.billing_email || invoice.client_email || userEmail;

    if (!recipientEmail) {
      return false;
    }

    // Send reminder email
    const subject = `Payment Reminder: Invoice ${invoice.invoice_number}`;
    const body = `
      Dear ${invoice.client_name || 'Valued Customer'},

      This is a friendly reminder that payment is due for Invoice ${invoice.invoice_number}.

      Invoice Details:
      - Invoice Number: ${invoice.invoice_number}
      - Amount Due: $${parseFloat(invoice.amount_due || invoice.total).toFixed(2)}
      ${invoice.due_date ? `- Due Date: ${new Date(invoice.due_date).toLocaleDateString()}` : ''}

      Please arrange payment at your earliest convenience.

      Thank you for your business.
    `;

    await sendEmail({
      to: recipientEmail,
      subject,
      text: body,
    });

    // Record reminder in database
    await query(
      `INSERT INTO payment_reminders (invoice_id, sent_date, reminder_type, sent_to)
       VALUES ($1, CURRENT_DATE, $2, $3)`,
      [invoiceId, reminderType, recipientEmail]
    );

    return true;
  } catch (error) {
    console.error('Error sending payment reminder:', error);
    return false;
  }
}

/**
 * Get overdue invoices that need reminders
 */
export async function getOverdueInvoicesForReminders(): Promise<any[]> {
  const schedule = await getReminderSchedule();
  
  if (!schedule.enabled) {
    return [];
  }

  const result = await query(
    `SELECT xi.*, c.name as client_name, c.email as client_email, c.billing_email
     FROM xero_invoices xi
     LEFT JOIN clients c ON xi.client_id = c.id
     WHERE xi.status IN ('AUTHORISED', 'SUBMITTED')
       AND xi.amount_due > 0
       AND xi.due_date < CURRENT_DATE
       AND xi.due_date IS NOT NULL
     ORDER BY xi.due_date ASC`
  );

  return result.rows;
}

/**
 * Check and send reminders for overdue invoices
 */
export async function processPaymentReminders(): Promise<{ sent: number; failed: number }> {
  const schedule = await getReminderSchedule();
  
  if (!schedule.enabled) {
    return { sent: 0, failed: 0 };
  }

  const overdueInvoices = await getOverdueInvoicesForReminders();
  let sent = 0;
  let failed = 0;

  for (const invoice of overdueInvoices) {
    const daysOverdue = Math.floor((new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24));

    // Check if we should send a reminder for this number of days overdue
    const shouldSend = schedule.days_after_due.some(days => daysOverdue >= days);

    if (shouldSend) {
      // Check if we've already sent a reminder for this invoice and days overdue
      const existingReminder = await query(
        `SELECT id FROM payment_reminders 
         WHERE invoice_id = $1 
           AND reminder_type = $2
           AND sent_date >= CURRENT_DATE - INTERVAL '1 day'`,
        [invoice.id, `days_${daysOverdue}`]
      );

      if (existingReminder.rows.length === 0) {
        const success = await sendPaymentReminder(invoice.id, `days_${daysOverdue}`);
        if (success) {
          sent++;
        } else {
          failed++;
        }
      }
    }
  }

  return { sent, failed };
}

/**
 * Get reminder history
 */
export async function getReminderHistory(filters: {
  invoice_id?: string;
  date_from?: string;
  date_to?: string;
}): Promise<any[]> {
  let sql = `
    SELECT pr.*,
      xi.invoice_number,
      c.name as client_name
    FROM payment_reminders pr
    LEFT JOIN xero_invoices xi ON pr.invoice_id = xi.id
    LEFT JOIN clients c ON xi.client_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters.invoice_id) {
    sql += ` AND pr.invoice_id = $${paramCount++}`;
    params.push(filters.invoice_id);
  }

  if (filters.date_from) {
    sql += ` AND pr.sent_date >= $${paramCount++}`;
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND pr.sent_date <= $${paramCount++}`;
    params.push(filters.date_to);
  }

  sql += ' ORDER BY pr.sent_date DESC, pr.created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

