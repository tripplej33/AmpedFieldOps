import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { Client, Project, PurchaseOrder } from '@/types';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface BillModalProps {
  purchaseOrderId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBillCreated?: () => void;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  account_code?: string;
}

export default function BillModal({ purchaseOrderId, open, onOpenChange, onBillCreated }: BillModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [formData, setFormData] = useState({
    supplier_id: '',
    purchase_order_id: purchaseOrderId || '',
    project_id: '',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    reference: '',
    currency: 'USD',
    line_items: [{ description: '', quantity: 1, unit_amount: 0, account_code: '' }] as LineItem[],
  });

  useEffect(() => {
    if (open) {
      loadSuppliers();
      loadProjects();
      loadPurchaseOrders();
      if (purchaseOrderId) {
        loadPurchaseOrderDetails(purchaseOrderId);
      }
    }
  }, [open, purchaseOrderId]);

  useEffect(() => {
    if (formData.purchase_order_id) {
      loadPurchaseOrderDetails(formData.purchase_order_id);
    } else {
      setSelectedPO(null);
    }
  }, [formData.purchase_order_id]);

  const loadSuppliers = async () => {
    try {
      const clients = await api.getClients();
      setSuppliers(Array.isArray(clients) ? clients : []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      toast.error('Failed to load suppliers');
    }
  };

  const loadProjects = async () => {
    try {
      const projectsData = await api.getProjects();
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      const pos = await api.getPurchaseOrders();
      setPurchaseOrders(Array.isArray(pos) ? pos : []);
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
    }
  };

  const loadPurchaseOrderDetails = async (poId: string) => {
    try {
      const po = await api.getPurchaseOrder(poId);
      if (po) {
        setSelectedPO(po);
        setFormData(prev => ({
          ...prev,
          supplier_id: po.supplier_id,
          project_id: po.project_id,
          line_items: po.line_items || [{ description: '', quantity: 1, unit_amount: 0 }],
          reference: po.po_number || prev.reference,
        }));
      }
    } catch (error) {
      console.error('Failed to load purchase order:', error);
      toast.error('Failed to load purchase order details');
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...formData.line_items];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, line_items: updated });
  };

  const addLineItem = () => {
    setFormData({
      ...formData,
      line_items: [...formData.line_items, { description: '', quantity: 1, unit_amount: 0, account_code: '' }],
    });
  };

  const removeLineItem = (index: number) => {
    if (formData.line_items.length > 1) {
      const updated = formData.line_items.filter((_, i) => i !== index);
      setFormData({ ...formData, line_items: updated });
    }
  };

  const calculateTotal = () => {
    return formData.line_items.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);
  };

  const handleCreateBill = async () => {
    if (!formData.supplier_id || !formData.date) {
      toast.error('Please fill in required fields');
      return;
    }

    if (formData.line_items.length === 0 || formData.line_items.some(item => !item.description || item.quantity <= 0 || item.unit_amount <= 0)) {
      toast.error('Please add valid line items');
      return;
    }

    setIsCreating(true);
    try {
      const lineItems = formData.line_items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_amount: item.unit_amount,
        account_code: item.account_code || undefined,
      }));

      await api.createBill({
        supplier_id: formData.supplier_id,
        purchase_order_id: formData.purchase_order_id || undefined,
        project_id: formData.project_id || undefined,
        date: formData.date,
        due_date: formData.due_date || undefined,
        line_items: lineItems,
        reference: formData.reference || undefined,
        currency: formData.currency,
      });

      toast.success('Bill created successfully');
      onBillCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create bill');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      purchase_order_id: purchaseOrderId || '',
      project_id: '',
      date: new Date().toISOString().split('T')[0],
      due_date: '',
      reference: '',
      currency: 'USD',
      line_items: [{ description: '', quantity: 1, unit_amount: 0, account_code: '' }],
    });
    setSelectedPO(null);
  };

  const totalAmount = calculateTotal();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create Bill (Supplier Invoice)</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Supplier & PO Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Supplier *</Label>
              <Select
                value={formData.supplier_id}
                onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
                disabled={!!selectedPO}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">From Purchase Order (Optional)</Label>
              <Select
                value={formData.purchase_order_id}
                onValueChange={(value) => setFormData({ ...formData, purchase_order_id: value || '' })}
                disabled={!!purchaseOrderId}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select PO (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {purchaseOrders
                    .filter(po => po.status !== 'BILLED')
                    .map(po => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.po_number} - {po.supplier_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedPO && (
                <p className="text-xs text-muted-foreground mt-1">
                  PO Total: ${selectedPO.total_amount.toFixed(2)}
                </p>
              )}
            </div>
          </div>

          {/* Project Selection (if not from PO) */}
          {!selectedPO && (
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Project (Optional)</Label>
              <Select
                value={formData.project_id}
                onValueChange={(value) => setFormData({ ...formData, project_id: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code} - {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Bill Date *</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>

          {/* Reference */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Reference</Label>
            <Input
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              placeholder="Supplier invoice number, PO reference, etc."
              className="mt-2"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="font-mono text-xs uppercase tracking-wider">Line Items *</Label>
              <Button variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="w-3 h-3 mr-1" />
                Add Line
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-mono uppercase text-muted-foreground pb-2 border-b">
                <div className="col-span-5">Description</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2">Account Code</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1"></div>
              </div>

              {formData.line_items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
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
                      value={item.unit_amount}
                      onChange={(e) => updateLineItem(index, 'unit_amount', parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={item.account_code || ''}
                      onChange={(e) => updateLineItem(index, 'account_code', e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="col-span-1 text-right font-mono font-bold">
                    ${(item.quantity * item.unit_amount).toFixed(2)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {formData.line_items.length > 1 && (
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
              <div className="grid grid-cols-12 gap-2 pt-3 border-t">
                <div className="col-span-10"></div>
                <div className="col-span-1 text-right font-mono text-sm font-bold">TOTAL</div>
                <div className="col-span-1 text-right font-mono text-lg font-bold text-electric">
                  ${totalAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-electric text-background hover:bg-electric/90"
              onClick={handleCreateBill}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Bill'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

