import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { XeroInvoice } from '@/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentModalProps {
  invoice: XeroInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentRecorded?: () => void;
}

export default function PaymentModal({ invoice, open, onOpenChange, onPaymentRecorded }: PaymentModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'BANK_TRANSFER' as 'CASH' | 'CHECK' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'ONLINE',
    reference: '',
    account_code: '',
  });

  useEffect(() => {
    if (invoice && open) {
      const amountDue = invoice.amount_due || invoice.total || 0;
      setFormData(prev => ({
        ...prev,
        amount: amountDue.toString(),
      }));
    }
  }, [invoice, open]);

  const handleRecordPayment = async () => {
    if (!invoice) return;

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    setIsRecording(true);
    try {
      await api.createPayment({
        invoice_id: invoice.id,
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        reference: formData.reference || undefined,
        account_code: formData.account_code || undefined,
      });
      toast.success('Payment recorded successfully');
      onPaymentRecorded?.();
      onOpenChange(false);
      setFormData({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'BANK_TRANSFER',
        reference: '',
        account_code: '',
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to record payment');
    } finally {
      setIsRecording(false);
    }
  };

  if (!invoice) return null;

  const amountDue = invoice.amount_due || invoice.total || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Record Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Invoice Info */}
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <div className="text-sm text-muted-foreground mb-1">Invoice</div>
            <div className="font-bold">{invoice.invoice_number}</div>
            <div className="text-sm text-muted-foreground mt-2">
              Amount Due: <span className="font-mono font-bold">${amountDue.toFixed(2)}</span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Amount *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={amountDue}
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              className="mt-2"
            />
          </div>

          {/* Payment Date */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Payment Date *</Label>
            <Input
              type="date"
              value={formData.payment_date}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
              className="mt-2"
            />
          </div>

          {/* Payment Method */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Payment Method *</Label>
            <Select
              value={formData.payment_method}
              onValueChange={(value: any) => setFormData(prev => ({ ...prev, payment_method: value }))}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CHECK">Check</SelectItem>
                <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Reference</Label>
            <Input
              value={formData.reference}
              onChange={(e) => setFormData(prev => ({ ...prev, reference: e.target.value }))}
              placeholder="Check number, transaction ID, etc."
              className="mt-2"
            />
          </div>

          {/* Account Code (optional) */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Account Code</Label>
            <Input
              value={formData.account_code}
              onChange={(e) => setFormData(prev => ({ ...prev, account_code: e.target.value }))}
              placeholder="Optional"
              className="mt-2"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-electric text-background hover:bg-electric/90"
              onClick={handleRecordPayment}
              disabled={isRecording}
            >
              {isRecording ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

