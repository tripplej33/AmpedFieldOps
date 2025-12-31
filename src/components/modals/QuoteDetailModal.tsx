import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { XeroQuote } from '@/types';
import { FileText, Calendar, CheckCircle, Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuoteDetailModalProps {
  quote: XeroQuote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function QuoteDetailModal({ quote, open, onOpenChange }: QuoteDetailModalProps) {
  if (!quote) return null;

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
      ACCEPTED: { color: 'bg-voltage/20 text-voltage border-voltage/30', icon: <CheckCircle className="w-3 h-3" /> },
      DECLINED: { color: 'bg-destructive/20 text-destructive border-destructive/30', icon: <AlertCircle className="w-3 h-3" /> },
      PENDING: { color: 'bg-warning/20 text-warning border-warning/30', icon: <Clock className="w-3 h-3" /> },
      SENT: { color: 'bg-blue-400/20 text-blue-400 border-blue-400/30', icon: <FileText className="w-3 h-3" /> },
    };

    const config = statusConfig[status] || { color: 'bg-muted text-muted-foreground', icon: <FileText className="w-3 h-3" /> };

    return (
      <Badge className={cn('flex items-center gap-1', config.color)}>
        {config.icon}
        {status}
      </Badge>
    );
  };

  const lineItems = Array.isArray(quote.line_items) ? quote.line_items : [];
  const total = Number(quote.total) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold font-mono">{quote.quote_number}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{quote.client_name || 'Unknown Client'}</p>
            </div>
            {getStatusBadge(quote.status)}
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quote Details */}
          <Card className="p-6 bg-card border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Issue Date</Label>
                <p className="text-sm font-mono mt-1">
                  {quote.issue_date ? new Date(quote.issue_date).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Expiry Date</Label>
                <p className="text-sm font-mono mt-1">
                  {quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Currency</Label>
                <p className="text-sm font-mono mt-1">{quote.currency || 'USD'}</p>
              </div>
              {(quote as any).xero_quote_id && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Xero ID</Label>
                  <p className="text-sm font-mono mt-1">{(quote as any).xero_quote_id}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Line Items */}
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-bold mb-4">Line Items</h3>
            {lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-border text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-right">Quantity</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Amount</div>
                </div>
                {lineItems.map((item: any, index: number) => (
                  <div key={index} className="grid grid-cols-12 gap-2 py-2 border-b border-border/50">
                    <div className="col-span-6 text-sm">{item.description || item.Description || '-'}</div>
                    <div className="col-span-2 text-right text-sm font-mono">{item.quantity || item.Quantity || 0}</div>
                    <div className="col-span-2 text-right text-sm font-mono">
                      ${(Number(item.unit_price || item.UnitAmount) || 0).toFixed(2)}
                    </div>
                    <div className="col-span-2 text-right text-sm font-mono font-bold">
                      ${(Number(item.amount || item.LineAmount) || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Total */}
          <Card className="p-6 bg-card border-border">
            <div className="flex justify-end">
              <div className="w-64">
                <div className="flex justify-between text-lg pt-2 border-t border-border">
                  <span className="font-bold">Total:</span>
                  <span className="font-mono font-bold text-electric">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
