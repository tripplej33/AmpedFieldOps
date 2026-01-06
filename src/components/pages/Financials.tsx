import React, { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { XeroInvoice, XeroQuote, Client, Project } from '@/types';
import { 
  DollarSign, 
  FileText, 
  Clock, 
  TrendingUp, 
  RefreshCw, 
  Plus, 
  Download,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Trash2,
  Loader2,
  ShoppingCart,
  Receipt,
  CreditCard,
  Camera
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PaymentModal from '@/components/modals/PaymentModal';
import PurchaseOrderModal from '@/components/modals/PurchaseOrderModal';
import PurchaseOrderDetailModal from '@/components/modals/PurchaseOrderDetailModal';
import BillModal from '@/components/modals/BillModal';
import ExpenseModal from '@/components/modals/ExpenseModal';
import InvoiceDetailModal from '@/components/modals/InvoiceDetailModal';
import QuoteDetailModal from '@/components/modals/QuoteDetailModal';
import PaymentDetailModal from '@/components/modals/PaymentDetailModal';
import BillDetailModal from '@/components/modals/BillDetailModal';
import ExpenseDetailModal from '@/components/modals/ExpenseDetailModal';
import FinancialReportsTab from './FinancialReportsTab';
import { XeroPayment, PurchaseOrder, Bill, Expense } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export default function Financials() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [quotes, setQuotes] = useState<XeroQuote[]>([]);
  const [payments, setPayments] = useState<XeroPayment[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDeletedInvoices, setShowDeletedInvoices] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<XeroInvoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedPOForBill, setSelectedPOForBill] = useState<string | undefined>(undefined);
  const [selectedInvoice, setSelectedInvoice] = useState<XeroInvoice | null>(null);
  const [isInvoiceDetailOpen, setIsInvoiceDetailOpen] = useState(false);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [isPODetailOpen, setIsPODetailOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<XeroQuote | null>(null);
  const [isQuoteDetailOpen, setIsQuoteDetailOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<XeroPayment | null>(null);
  const [isPaymentDetailOpen, setIsPaymentDetailOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isBillDetailOpen, setIsBillDetailOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isExpenseDetailOpen, setIsExpenseDetailOpen] = useState(false);
  
  // Create Invoice Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateFromTimesheetsModalOpen, setIsCreateFromTimesheetsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingFromTimesheets, setIsCreatingFromTimesheets] = useState(false);
  const [syncingInvoices, setSyncingInvoices] = useState<Set<string>>(new Set());
  const [syncingPOs, setSyncingPOs] = useState<Set<string>>(new Set());
  const [syncErrors, setSyncErrors] = useState<Record<string, any>>({});
  const [selectedErrorEntity, setSelectedErrorEntity] = useState<{ type: string; id: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: '',
    project_id: '',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    reference: '',
    line_items: [{ description: '', quantity: 1, unit_price: 0, amount: 0 }] as LineItem[]
  });
  const [timesheetInvoiceForm, setTimesheetInvoiceForm] = useState({
    client_id: '',
    project_id: '',
    period: 'week' as 'week' | 'month' | 'custom',
    date_from: '',
    date_to: '',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
    loadClients();
  }, [showDeletedInvoices]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invoicesData, quotesData, summaryData, paymentsData, posData, billsData, expensesData] = await Promise.all([
        api.getXeroInvoices({ include_deleted: showDeletedInvoices }).catch(() => []),
        api.getXeroQuotes().catch(() => []),
        api.getXeroFinancialSummary().catch(() => null),
        api.getPayments().catch(() => []),
        api.getPurchaseOrders().catch(() => []),
        api.getBills().catch(() => []),
        api.getExpenses().catch(() => [])
      ]);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      setQuotes(Array.isArray(quotesData) ? quotesData : []);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
      setPurchaseOrders(Array.isArray(posData) ? posData : []);
      setBills(Array.isArray(billsData) ? billsData : []);
      setExpenses(Array.isArray(expensesData) ? expensesData : []);
      setSummary(summaryData || {
        outstanding_invoices: 0,
        paid_this_month: 0,
        pending_quotes: { total: 0, count: 0 },
        revenue_by_month: []
      });
    } catch (error) {
      console.error('Failed to load financial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const data = await api.getClients();
      setClients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const loadProjects = async (clientId: string) => {
    if (!clientId) {
      setProjects([]);
      return;
    }
    try {
      const data = await api.getProjects({ client_id: clientId });
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  };

  const handleClientChange = (clientId: string) => {
    setInvoiceForm(prev => ({ ...prev, client_id: clientId, project_id: '' }));
    loadProjects(clientId);
  };

  const addLineItem = () => {
    setInvoiceForm(prev => ({
      ...prev,
      line_items: [...prev.line_items, { description: '', quantity: 1, unit_price: 0, amount: 0 }]
    }));
  };

  const removeLineItem = (index: number) => {
    setInvoiceForm(prev => ({
      ...prev,
      line_items: prev.line_items.filter((_, i) => i !== index)
    }));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setInvoiceForm(prev => {
      const newItems = [...prev.line_items];
      newItems[index] = { ...newItems[index], [field]: value };
      // Auto-calculate amount
      if (field === 'quantity' || field === 'unit_price') {
        newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
      }
      return { ...prev, line_items: newItems };
    });
  };

  const calculateTotal = () => {
    return invoiceForm.line_items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const handleCreateInvoice = async () => {
    if (!invoiceForm.client_id) {
      toast.error('Please select a client');
      return;
    }
    if (invoiceForm.line_items.every(item => !item.description)) {
      toast.error('Please add at least one line item');
      return;
    }

    setIsCreating(true);
    try {
      await api.createXeroInvoice({
        client_id: invoiceForm.client_id,
        project_id: invoiceForm.project_id || undefined,
        due_date: invoiceForm.due_date,
        line_items: invoiceForm.line_items.filter(item => item.description)
      });
      toast.success('Invoice created successfully');
      setIsCreateModalOpen(false);
      setInvoiceForm({
        client_id: '',
        project_id: '',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        reference: '',
        line_items: [{ description: '', quantity: 1, unit_price: 0, amount: 0 }]
      });
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create invoice');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await api.syncXero('all') as any;
      toast.success(`Xero sync completed at ${new Date(result.synced_at || Date.now()).toLocaleTimeString()}`);
      // Refresh Xero status
      window.dispatchEvent(new CustomEvent('xero-status-updated'));
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConvertQuote = async (quoteId: string) => {
    try {
      await api.convertQuoteToInvoice(quoteId);
      toast.success('Quote converted to invoice');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Conversion failed');
    }
  };

  const handleCreateInvoiceFromTimesheets = async () => {
    if (!timesheetInvoiceForm.client_id) {
      toast.error('Please select a client');
      return;
    }

    if (timesheetInvoiceForm.period === 'custom' && (!timesheetInvoiceForm.date_from || !timesheetInvoiceForm.date_to)) {
      toast.error('Please select date range');
      return;
    }

    setIsCreatingFromTimesheets(true);
    try {
      const result = await api.createInvoiceFromTimesheets({
        client_id: timesheetInvoiceForm.client_id,
        project_id: timesheetInvoiceForm.project_id || undefined,
        period: timesheetInvoiceForm.period === 'custom' ? undefined : timesheetInvoiceForm.period,
        date_from: timesheetInvoiceForm.period === 'custom' ? timesheetInvoiceForm.date_from : undefined,
        date_to: timesheetInvoiceForm.period === 'custom' ? timesheetInvoiceForm.date_to : undefined,
        due_date: timesheetInvoiceForm.due_date
      });
      
      const invoiceId = (result as any)?.id;
      const timesheetCount = (result as any)?.timesheets_count || (result as any)?.timesheet_ids?.length || 0;
      
      // Check if async sync (202 Accepted)
      if ((result as any)?.async || (result as any)?.sync_status === 'pending') {
        toast.success(`Invoice created. Syncing to Xero...`);
        if (invoiceId) {
          setSyncingInvoices(prev => new Set(prev).add(invoiceId));
          // Poll for sync status
          pollInvoiceSyncStatus(invoiceId);
        }
      } else {
        toast.success(`Invoice created from ${timesheetCount} timesheet${timesheetCount !== 1 ? 's' : ''}`);
      }
      
      setIsCreateFromTimesheetsModalOpen(false);
      setTimesheetInvoiceForm({
        client_id: '',
        project_id: '',
        period: 'week',
        date_from: '',
        date_to: '',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create invoice from timesheets');
    } finally {
      setIsCreatingFromTimesheets(false);
    }
  };

  // Poll for invoice sync status
  const pollInvoiceSyncStatus = async (invoiceId: string, retries = 0) => {
    if (retries > 20) { // Stop after 20 attempts (100 seconds)
      setSyncingInvoices(prev => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
      toast.error('Sync status check timed out. Please refresh to see current status.');
      return;
    }

    try {
      const status = await api.getInvoiceSyncStatus(invoiceId);
      
      if (status.sync_status === 'synced') {
        setSyncingInvoices(prev => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        });
        toast.success('Invoice synced to Xero successfully!');
        loadData();
      } else if (status.sync_status === 'failed') {
        setSyncingInvoices(prev => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        });
        // Load error details
        try {
          const logs = await api.getSyncLogs('invoice', invoiceId);
          const errorLog = logs.find((log: any) => log.status_code && log.status_code >= 400);
          if (errorLog) {
            setSyncErrors(prev => ({ ...prev, [`invoice-${invoiceId}`]: errorLog }));
          }
        } catch (e) {
          console.error('Failed to load error details:', e);
        }
        toast.error('Invoice sync to Xero failed. Click "View Error Details" for more information.');
        loadData();
      } else {
        // Still pending, poll again after 5 seconds
        setTimeout(() => pollInvoiceSyncStatus(invoiceId, retries + 1), 5000);
      }
    } catch (error) {
      console.error('Failed to check sync status:', error);
      // Continue polling on error
      setTimeout(() => pollInvoiceSyncStatus(invoiceId, retries + 1), 5000);
    }
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    try {
      await api.markInvoiceAsPaid(invoiceId);
      toast.success('Invoice marked as paid. Timesheets updated.');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark invoice as paid');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
      PAID: { color: 'bg-voltage/20 text-voltage border-voltage/30', icon: <CheckCircle className="w-3 h-3" /> },
      AUTHORISED: { color: 'bg-electric/20 text-electric border-electric/30', icon: <Clock className="w-3 h-3" /> },
      SUBMITTED: { color: 'bg-blue-400/20 text-blue-400 border-blue-400/30', icon: <Clock className="w-3 h-3" /> },
      DRAFT: { color: 'bg-muted text-muted-foreground', icon: <FileText className="w-3 h-3" /> },
      PENDING: { color: 'bg-warning/20 text-warning border-warning/30', icon: <Clock className="w-3 h-3" /> },
      ACCEPTED: { color: 'bg-voltage/20 text-voltage border-voltage/30', icon: <CheckCircle className="w-3 h-3" /> },
      DECLINED: { color: 'bg-destructive/20 text-destructive border-destructive/30', icon: <AlertCircle className="w-3 h-3" /> },
    };

    const config = statusConfig[status] || statusConfig.DRAFT;

    return (
      <Badge className={cn('flex items-center gap-1', config.color)}>
        {config.icon}
        {status}
      </Badge>
    );
  };

  return (
    <>
      <Header title="Financials" subtitle="Xero invoices, quotes, and financial overview" />

      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-mono text-muted-foreground">Outstanding</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-mono">
                ${summary.outstanding_invoices.toLocaleString()}
              </p>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-voltage/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-voltage" />
                </div>
                <div>
                  <p className="text-sm font-mono text-muted-foreground">Paid This Month</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-voltage">
                ${summary.paid_this_month.toLocaleString()}
              </p>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-electric/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-electric" />
                </div>
                <div>
                  <p className="text-sm font-mono text-muted-foreground">Pending Quotes</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-electric">
                ${summary.pending_quotes.total.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.pending_quotes.count} quotes
              </p>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-400/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-mono text-muted-foreground">6 Month Avg</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-mono">
                ${summary.revenue_by_month.length > 0 
                  ? Math.round(summary.revenue_by_month.reduce((a: number, b: any) => a + parseFloat(b.total), 0) / 6).toLocaleString() 
                  : '0'}
              </p>
            </Card>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-6 gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing}
              className="flex-1 sm:flex-initial"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Sync with Xero'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button 
              variant="outline"
              onClick={() => navigate('/document-scan')}
            >
              <Camera className="w-4 h-4 mr-2" />
              Scan Documents
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button 
              variant="outline"
              onClick={() => setIsCreateFromTimesheetsModalOpen(true)}
            >
              <Clock className="w-4 h-4 mr-2" />
              Invoice from Timesheets
            </Button>
            <Button 
              className="bg-electric text-background hover:bg-electric/90"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Invoice
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="invoices">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <TabsList className="grid w-full grid-cols-7 min-w-[700px] max-w-5xl">
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          </div>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold">Invoices</h3>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-deleted"
                    checked={showDeletedInvoices}
                    onCheckedChange={(checked) => setShowDeletedInvoices(checked === true)}
                  />
                  <Label htmlFor="show-deleted" className="text-sm cursor-pointer">
                    Show deleted invoices
                  </Label>
                </div>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Invoice #
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Client
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Date
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                        Amount
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">
                        Status
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          No invoices found. Create one or sync with Xero.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((invoice) => {
                        const invoiceId = invoice.id;
                        const isSyncing = syncingInvoices.has(invoiceId);
                        const hasError = syncErrors[`invoice-${invoiceId}`];
                        const syncStatus = (invoice as any).sync_status;
                        const isDeleted = !!(invoice as any).deleted_at;
                          
                          return (
                        <tr key={invoice.id} className={cn("hover:bg-muted/30 transition-colors", isDeleted && "opacity-50")}>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono font-medium">
                            {invoice.invoice_number}
                            {isDeleted && (
                              <Badge className="ml-2 bg-muted text-muted-foreground text-xs">Deleted</Badge>
                            )}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">
                            {invoice.client_name}
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {new Date(invoice.issue_date).toLocaleDateString()}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono font-bold">
                            ${invoice.total?.toLocaleString() || '0'}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {getStatusBadge(invoice.status)}
                              {isSyncing && (
                                <Badge className="bg-warning/20 text-warning border-warning/30 flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Syncing...
                                </Badge>
                              )}
                              {syncStatus === 'pending' && !isSyncing && (
                                <Badge className="bg-warning/20 text-warning border-warning/30">
                                  Pending Sync
                                </Badge>
                              )}
                              {syncStatus === 'synced' && (
                                <Badge className="bg-voltage/20 text-voltage border-voltage/30 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Synced
                                </Badge>
                              )}
                              {syncStatus === 'failed' && (
                                <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                                  Sync Failed
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {hasError && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setSelectedErrorEntity({ type: 'invoice', id: invoiceId })}
                                  className="text-destructive"
                                >
                                  <AlertCircle className="w-4 h-4 mr-1" />
                                  Error Details
                                </Button>
                              )}
                              {invoice.status !== 'PAID' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleMarkAsPaid(String(invoice.id))}
                                >
                                  Mark as Paid
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setIsInvoiceDetailOpen(true);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Quote #
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Client
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Expires
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                        Amount
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">
                        Status
                      </th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {quotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          No quotes found. Create one or sync with Xero.
                        </td>
                      </tr>
                    ) : (
                      quotes.map((quote) => (
                        <tr key={quote.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono font-medium">
                            {quote.quote_number}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">
                            {quote.client_name}
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono font-bold">
                            ${quote.total?.toLocaleString() || '0'}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                            {getStatusBadge(quote.status)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {quote.status === 'PENDING' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleConvertQuote(quote.id)}
                                >
                                  Convert <ArrowRight className="w-3 h-3 ml-1" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setSelectedQuote(quote);
                                  setIsQuoteDetailOpen(true);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Invoice #</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Client</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Date</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Amount</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Method</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Reference</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                          No payments found.
                        </td>
                      </tr>
                    ) : (
                      payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono font-medium">{payment.invoice_number}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{payment.client_name}</td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono font-bold">
                            ${(Number(payment.amount) || 0).toFixed(2)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{payment.payment_method.replace('_', ' ')}</td>
                          <td className="px-6 py-4 text-muted-foreground">{payment.reference || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Purchase Orders Tab */}
          <TabsContent value="purchase-orders" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold">Purchase Orders</h3>
                <Button variant="outline" size="sm" onClick={() => setIsPOModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New PO
                </Button>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">PO #</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Supplier</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Project</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Date</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Amount</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">Status</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {purchaseOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                          No purchase orders found.
                        </td>
                      </tr>
                    ) : (
                      purchaseOrders.map((po) => (
                        <tr key={po.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono font-medium">{po.po_number}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{po.supplier_name}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{po.project_name || po.project_code}</td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {new Date(po.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono font-bold">
                            ${(Number(po.total_amount) || 0).toFixed(2)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                            {getStatusBadge(po.status)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {po.status !== 'BILLED' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPOForBill(po.id);
                                    setIsBillModalOpen(true);
                                  }}
                                >
                                  Convert to Bill
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setSelectedPurchaseOrder(po);
                                  setIsPODetailOpen(true);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Bills Tab */}
          <TabsContent value="bills" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold">Bills (Supplier Invoices)</h3>
                <Button variant="outline" size="sm" onClick={() => {
                  setSelectedPOForBill(undefined);
                  setIsBillModalOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Bill
                </Button>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Bill #</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Supplier</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Project</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Date</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Amount</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Due</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">Status</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bills.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                          No bills found.
                        </td>
                      </tr>
                    ) : (
                      bills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono font-medium">{bill.bill_number}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{bill.supplier_name}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{bill.project_name || bill.project_code || '-'}</td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {new Date(bill.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono font-bold">
                            ${(Number(bill.amount) || 0).toFixed(2)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono">
                            ${(Number(bill.amount_due) || 0).toFixed(2)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                            {getStatusBadge(bill.status)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {bill.status !== 'PAID' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await api.markBillAsPaid(String(bill.id), { amount: Number(bill.amount_due) || 0 });
                                      toast.success('Bill marked as paid');
                                      loadData();
                                    } catch (error: any) {
                                      toast.error(error.message || 'Failed to mark bill as paid');
                                    }
                                  }}
                                >
                                  Mark Paid
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setSelectedBill(bill);
                                  setIsBillDetailOpen(true);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold">Expenses</h3>
                <Button variant="outline" size="sm" onClick={() => setIsExpenseModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Expense
                </Button>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Date</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Description</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Project</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">Cost Center</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Amount</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">Status</th>
                      <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                          No expenses found.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
                        <tr key={expense.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {new Date(expense.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{expense.description}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{expense.project_name || expense.project_code || '-'}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4">{expense.cost_center_name || expense.cost_center_code || '-'}</td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono font-bold">
                            ${(Number(expense.amount) || 0).toFixed(2)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                            {getStatusBadge(expense.status)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedExpense(expense);
                                setIsExpenseDetailOpen(true);
                              }}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="mt-6">
            <FinancialReportsTab />
          </TabsContent>
        </Tabs>

        {/* Top Clients */}
        {summary?.top_clients && summary.top_clients.length > 0 && (
          <Card className="mt-8 p-6 bg-card border-border">
            <h3 className="text-lg font-bold mb-4">Top Clients by Revenue</h3>
            <div className="space-y-3">
              {summary.top_clients.map((client: any, index: number) => (
                <div key={client.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-mono">
                      {index + 1}
                    </span>
                    <span className="font-medium">{client.name}</span>
                  </div>
                  <span className="font-mono font-bold text-electric">
                    ${(Number(client.total_revenue) || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Client & Project Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Client *</Label>
                <Select
                  value={invoiceForm.client_id}
                  onValueChange={handleClientChange}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Project (Optional)</Label>
                <Select
                  value={invoiceForm.project_id}
                  onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, project_id: value }))}
                  disabled={!invoiceForm.client_id}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Due Date</Label>
                <Input
                  type="date"
                  value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Reference</Label>
                <Input
                  value={invoiceForm.reference}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="PO number, etc."
                  className="mt-2"
                />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="font-mono text-xs uppercase tracking-wider">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Line
                </Button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-2 text-xs font-mono uppercase text-muted-foreground">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>

                {invoiceForm.line_items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input
                        value={item.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        placeholder="Service description"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                        className="text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={item.amount.toFixed(2)}
                        readOnly
                        className="text-right bg-muted/50"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {invoiceForm.line_items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="grid grid-cols-12 gap-2 pt-3 border-t border-border">
                  <div className="col-span-7"></div>
                  <div className="col-span-2 text-right font-mono text-sm font-bold">TOTAL</div>
                  <div className="col-span-2 text-right font-mono text-lg font-bold text-electric">
                    ${calculateTotal().toFixed(2)}
                  </div>
                  <div className="col-span-1"></div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-electric text-background hover:bg-electric/90"
                onClick={handleCreateInvoice}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Create Invoice
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Invoice from Timesheets Modal */}
      <Dialog open={isCreateFromTimesheetsModalOpen} onOpenChange={setIsCreateFromTimesheetsModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create Invoice from Timesheets</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Client & Project Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Client *</Label>
                <Select
                  value={timesheetInvoiceForm.client_id}
                  onValueChange={(value) => {
                    setTimesheetInvoiceForm(prev => ({ ...prev, client_id: value, project_id: '' }));
                    loadProjects(value);
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Project (Optional)</Label>
                <Select
                  value={timesheetInvoiceForm.project_id || '__all__'}
                  onValueChange={(value) => setTimesheetInvoiceForm(prev => ({ ...prev, project_id: value === '__all__' ? '' : value }))}
                  disabled={!timesheetInvoiceForm.client_id}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All projects</SelectItem>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Period Selection */}
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Time Period *</Label>
              <Select
                value={timesheetInvoiceForm.period}
                onValueChange={(value: 'week' | 'month' | 'custom') => setTimesheetInvoiceForm(prev => ({ ...prev, period: value }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            {timesheetInvoiceForm.period === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">From Date *</Label>
                  <Input
                    type="date"
                    value={timesheetInvoiceForm.date_from}
                    onChange={(e) => setTimesheetInvoiceForm(prev => ({ ...prev, date_from: e.target.value }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">To Date *</Label>
                  <Input
                    type="date"
                    value={timesheetInvoiceForm.date_to}
                    onChange={(e) => setTimesheetInvoiceForm(prev => ({ ...prev, date_to: e.target.value }))}
                    className="mt-2"
                  />
                </div>
              </div>
            )}

            {/* Due Date */}
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Due Date</Label>
              <Input
                type="date"
                value={timesheetInvoiceForm.due_date}
                onChange={(e) => setTimesheetInvoiceForm(prev => ({ ...prev, due_date: e.target.value }))}
                className="mt-2"
              />
            </div>

            {/* Info */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border">
              <p className="text-sm text-muted-foreground">
                This will create an invoice from all unbilled timesheets for the selected client and period.
                Timesheets will be grouped by activity type and automatically marked as "billed".
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setIsCreateFromTimesheetsModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-electric text-background hover:bg-electric/90"
                onClick={handleCreateInvoiceFromTimesheets}
                disabled={isCreatingFromTimesheets}
              >
                {isCreatingFromTimesheets ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    Create Invoice
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <PaymentModal
        invoice={selectedInvoiceForPayment}
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        onPaymentRecorded={loadData}
      />

      {/* Purchase Order Modal */}
      <PurchaseOrderModal
        open={isPOModalOpen}
        onOpenChange={setIsPOModalOpen}
        onPurchaseOrderCreated={loadData}
      />

      {/* Bill Modal */}
      <BillModal
        purchaseOrderId={selectedPOForBill}
        open={isBillModalOpen}
        onOpenChange={(open) => {
          setIsBillModalOpen(open);
          if (!open) setSelectedPOForBill(undefined);
        }}
        onBillCreated={loadData}
      />

      {/* Expense Modal */}
      <ExpenseModal
        open={isExpenseModalOpen}
        onOpenChange={setIsExpenseModalOpen}
        onExpenseCreated={loadData}
      />

      {/* Error Details Modal */}
      <Dialog open={!!selectedErrorEntity} onOpenChange={(open) => !open && setSelectedErrorEntity(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync Error Details</DialogTitle>
          </DialogHeader>
          {selectedErrorEntity && syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`] && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-mono text-muted-foreground">Status Code</Label>
                <p className="mt-1 font-mono">{syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].status_code || 'N/A'}</p>
              </div>
              {syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].error_message && (
                <div>
                  <Label className="text-sm font-mono text-muted-foreground">Error Message</Label>
                  <p className="mt-1 text-destructive">{syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].error_message}</p>
                </div>
              )}
              {syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].request_payload && (
                <div>
                  <Label className="text-sm font-mono text-muted-foreground">Request Payload</Label>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                    {JSON.stringify(syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].request_payload, null, 2)}
                  </pre>
                </div>
              )}
              {syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].response_payload && (
                <div>
                  <Label className="text-sm font-mono text-muted-foreground">Response Payload</Label>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                    {JSON.stringify(syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].response_payload, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <Label className="text-sm font-mono text-muted-foreground">Timestamp</Label>
                <p className="mt-1 font-mono text-sm">
                  {new Date(syncErrors[`${selectedErrorEntity.type}-${selectedErrorEntity.id}`].created_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        invoice={selectedInvoice}
        open={isInvoiceDetailOpen}
        onOpenChange={setIsInvoiceDetailOpen}
      />

      {/* Purchase Order Detail Modal */}
      <PurchaseOrderDetailModal
        purchaseOrder={selectedPurchaseOrder}
        open={isPODetailOpen}
        onOpenChange={setIsPODetailOpen}
      />

      {/* Quote Detail Modal */}
      <QuoteDetailModal
        quote={selectedQuote}
        open={isQuoteDetailOpen}
        onOpenChange={setIsQuoteDetailOpen}
      />

      {/* Payment Detail Modal */}
      <PaymentDetailModal
        payment={selectedPayment}
        open={isPaymentDetailOpen}
        onOpenChange={setIsPaymentDetailOpen}
      />

      {/* Bill Detail Modal */}
      <BillDetailModal
        bill={selectedBill}
        open={isBillDetailOpen}
        onOpenChange={setIsBillDetailOpen}
      />

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expense={selectedExpense}
        open={isExpenseDetailOpen}
        onOpenChange={setIsExpenseDetailOpen}
      />
    </>
  );
}
