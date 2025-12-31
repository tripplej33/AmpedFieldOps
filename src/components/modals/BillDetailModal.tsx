import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Bill } from '@/types';
import { FileText, Calendar, DollarSign, CheckCircle, Clock, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BillDetailModalProps {
  bill: Bill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BillDetailModal({ bill, open, onOpenChange }: BillDetailModalProps) {
  if (!bill) return null;

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
      PAID: { color: 'bg-voltage/20 text-voltage border-voltage/30', icon: <CheckCircle className="w-3 h-3" /> },
      AUTHORISED: { color: 'bg-electric/20 text-electric border-electric/30', icon: <CheckCircle className="w-3 h-3" /> },
      SUBMITTED: { color: 'bg-blue-400/20 text-blue-400 border-blue-400/30', icon: <Clock className="w-3 h-3" /> },
      DRAFT: { color: 'bg-muted text-muted-foreground', icon: <FileText className="w-3 h-3" /> },
      VOIDED: { color: 'bg-destructive/20 text-destructive border-destructive/30', icon: <FileText className="w-3 h-3" /> },
    };

    const config = statusConfig[status] || statusConfig.DRAFT;

    return (
      <Badge className={cn('flex items-center gap-1', config.color)}>
        {config.icon}
        {status}
      </Badge>
    );
  };

  const lineItems = Array.isArray(bill.line_items) ? bill.line_items : [];
  const total = bill.amount || 0;
  const amountPaid = bill.amount_paid || 0;
  const amountDue = bill.amount_due || total - amountPaid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold font-mono">{bill.bill_number}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{bill.supplier_name || 'Unknown Supplier'}</p>
            </div>
            {getStatusBadge(bill.status)}
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Bill Details */}
          <Card className="p-6 bg-card border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Date</Label>
                <p className="text-sm font-mono mt-1">
                  {bill.date ? new Date(bill.date).toLocaleDateString() : '-'}
                </p>
              </div>
              {bill.due_date && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Due Date</Label>
                  <p className="text-sm font-mono mt-1">
                    {new Date(bill.due_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {bill.paid_date && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Paid Date</Label>
                  <p className="text-sm font-mono mt-1">
                    {new Date(bill.paid_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Project</Label>
                <p className="text-sm mt-1">{bill.project_name || bill.project_code || '-'}</p>
              </div>
              {bill.po_number && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Purchase Order</Label>
                  <p className="text-sm font-mono mt-1">{bill.po_number}</p>
                </div>
              )}
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Currency</Label>
                <p className="text-sm font-mono mt-1">{bill.currency || 'USD'}</p>
              </div>
              {(bill as any).xero_bill_id && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Xero ID</Label>
                  <p className="text-sm font-mono mt-1">{(bill as any).xero_bill_id}</p>
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
                  <div className="col-span-2 text-right">Unit Amount</div>
                  <div className="col-span-2 text-right">Line Amount</div>
                </div>
                {lineItems.map((item: any, index: number) => (
                  <div key={index} className="grid grid-cols-12 gap-2 py-2 border-b border-border/50">
                    <div className="col-span-6 text-sm">{item.description || item.Description || '-'}</div>
                    <div className="col-span-2 text-right text-sm font-mono">{item.quantity || item.Quantity || 0}</div>
                    <div className="col-span-2 text-right text-sm font-mono">
                      ${(item.unit_amount || item.UnitAmount || 0).toFixed(2)}
                    </div>
                    <div className="col-span-2 text-right text-sm font-mono font-bold">
                      ${(item.line_amount || item.LineAmount || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Totals */}
          <Card className="p-6 bg-card border-border">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount:</span>
                  <span className="font-mono font-bold">${total.toFixed(2)}</span>
                </div>
                {amountPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid:</span>
                    <span className="font-mono text-voltage">${amountPaid.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg pt-2 border-t border-border">
                  <span className="font-bold">Amount Due:</span>
                  <span className="font-mono font-bold text-electric">${amountDue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
