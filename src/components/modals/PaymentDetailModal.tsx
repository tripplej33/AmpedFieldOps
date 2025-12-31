import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { XeroPayment } from '@/types';
import { CreditCard, Calendar, DollarSign, FileText } from 'lucide-react';

interface PaymentDetailModalProps {
  payment: XeroPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentDetailModal({ payment, open, onOpenChange }: PaymentDetailModalProps) {
  if (!payment) return null;

  const formatPaymentMethod = (method: string) => {
    return method.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">Payment Details</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Invoice: {payment.invoice_number || 'N/A'}
              </p>
            </div>
            <Badge className="bg-voltage/20 text-voltage border-voltage/30">
              <CreditCard className="w-3 h-3 mr-1" />
              {formatPaymentMethod(payment.payment_method)}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Payment Details */}
          <Card className="p-6 bg-card border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Client</Label>
                <p className="text-sm mt-1">{payment.client_name || 'Unknown Client'}</p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Payment Date</Label>
                <p className="text-sm font-mono mt-1">
                  {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Amount</Label>
                <p className="text-lg font-mono font-bold text-electric mt-1">
                  ${(payment.amount || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Currency</Label>
                <p className="text-sm font-mono mt-1">{payment.currency || 'USD'}</p>
              </div>
              {payment.reference && (
                <div className="col-span-2">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Reference</Label>
                  <p className="text-sm font-mono mt-1">{payment.reference}</p>
                </div>
              )}
              {payment.account_code && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Account Code</Label>
                  <p className="text-sm font-mono mt-1">{payment.account_code}</p>
                </div>
              )}
              {(payment as any).xero_payment_id && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Xero ID</Label>
                  <p className="text-sm font-mono mt-1">{(payment as any).xero_payment_id}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
