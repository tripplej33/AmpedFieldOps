import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Expense } from '@/types';
import { FileText, Calendar, DollarSign, CheckCircle, Clock, Receipt, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpenseDetailModalProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ExpenseDetailModal({ expense, open, onOpenChange }: ExpenseDetailModalProps) {
  if (!expense) return null;

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
      PAID: { color: 'bg-voltage/20 text-voltage border-voltage/30', icon: <CheckCircle className="w-3 h-3" /> },
      APPROVED: { color: 'bg-electric/20 text-electric border-electric/30', icon: <CheckCircle className="w-3 h-3" /> },
      SUBMITTED: { color: 'bg-blue-400/20 text-blue-400 border-blue-400/30', icon: <Clock className="w-3 h-3" /> },
      DRAFT: { color: 'bg-muted text-muted-foreground', icon: <FileText className="w-3 h-3" /> },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">Expense Details</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {expense.description || 'No description'}
              </p>
            </div>
            {getStatusBadge(expense.status)}
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Expense Details */}
          <Card className="p-6 bg-card border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Date</Label>
                <p className="text-sm font-mono mt-1">
                  {expense.date ? new Date(expense.date).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Amount</Label>
                <p className="text-lg font-mono font-bold text-electric mt-1">
                  ${(expense.amount || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Project</Label>
                <p className="text-sm mt-1">{expense.project_name || expense.project_code || '-'}</p>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Cost Center</Label>
                <p className="text-sm mt-1">{expense.cost_center_name || expense.cost_center_code || '-'}</p>
              </div>
              {(expense as any).xero_expense_id && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Xero ID</Label>
                  <p className="text-sm font-mono mt-1">{(expense as any).xero_expense_id}</p>
                </div>
              )}
            </div>
            {expense.description && (
              <div className="mt-4">
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Description</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{expense.description}</p>
              </div>
            )}
            {expense.receipt_url && (
              <div className="mt-4">
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Receipt</Label>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(expense.receipt_url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Receipt
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
