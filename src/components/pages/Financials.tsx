import { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export default function Financials() {
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [quotes, setQuotes] = useState<XeroQuote[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Create Invoice Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: '',
    project_id: '',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    reference: '',
    line_items: [{ description: '', quantity: 1, unit_price: 0, amount: 0 }] as LineItem[]
  });

  useEffect(() => {
    loadData();
    loadClients();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invoicesData, quotesData, summaryData] = await Promise.all([
        api.getXeroInvoices().catch(() => []),
        api.getXeroQuotes().catch(() => []),
        api.getXeroFinancialSummary().catch(() => null)
      ]);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      setQuotes(Array.isArray(quotesData) ? quotesData : []);
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
      await api.syncXero('all');
      toast.success('Xero sync completed');
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

      <div className="p-8 max-w-[1400px] mx-auto">
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Sync with Xero'}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
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
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
          </TabsList>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Invoice #
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Client
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Date
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
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
                      invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-mono font-medium">
                            {invoice.invoice_number}
                          </td>
                          <td className="px-6 py-4">
                            {invoice.client_name}
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {new Date(invoice.issue_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold">
                            ${invoice.total?.toLocaleString() || '0'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {getStatusBadge(invoice.status)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="sm">
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

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="mt-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Quote #
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Client
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                        Expires
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
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
                          <td className="px-6 py-4 font-mono font-medium">
                            {quote.quote_number}
                          </td>
                          <td className="px-6 py-4">
                            {quote.client_name}
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                            {quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold">
                            ${quote.total?.toLocaleString() || '0'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {getStatusBadge(quote.status)}
                          </td>
                          <td className="px-6 py-4 text-right">
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
                              <Button variant="ghost" size="sm">
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
                    ${parseFloat(client.total_revenue).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Client & Project Selection */}
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
    </>
  );
}
