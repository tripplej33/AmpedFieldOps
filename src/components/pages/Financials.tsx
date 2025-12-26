import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { XeroInvoice, XeroQuote } from '@/types';
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
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Financials() {
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [quotes, setQuotes] = useState<XeroQuote[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invoicesData, quotesData, summaryData] = await Promise.all([
        api.getXeroInvoices(),
        api.getXeroQuotes(),
        api.getXeroFinancialSummary()
      ]);
      setInvoices(invoicesData);
      setQuotes(quotesData);
      setSummary(summaryData);
    } catch (error) {
      toast.error('Failed to load financial data');
    } finally {
      setIsLoading(false);
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
            <Button className="bg-electric text-background hover:bg-electric/90">
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
    </>
  );
}
