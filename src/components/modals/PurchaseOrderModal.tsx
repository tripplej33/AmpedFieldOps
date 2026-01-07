import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { Client, Project, CostCenter } from '@/types';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PurchaseOrderModalProps {
  projectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchaseOrderCreated?: () => void;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  account_code?: string;
  cost_center_id?: string;
  item_id?: string;
}

export default function PurchaseOrderModal({ projectId: initialProjectId, open, onOpenChange, onPurchaseOrderCreated }: PurchaseOrderModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [formData, setFormData] = useState({
    supplier_id: '',
    project_id: initialProjectId || '',
    date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    notes: '',
    currency: 'USD',
    line_items: [{ description: '', quantity: 1, unit_amount: 0, account_code: '', cost_center_id: '' }] as LineItem[],
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    if (open) {
      loadSuppliers();
      loadProjects();
      if (initialProjectId) {
        loadProjectCostCenters(initialProjectId);
        loadProjectDetails(initialProjectId);
      }
    }
  }, [open, initialProjectId]);

  useEffect(() => {
    if (formData.project_id) {
      loadProjectCostCenters(formData.project_id);
      loadProjectDetails(formData.project_id);
    } else {
      setCostCenters([]);
      setSelectedProject(null);
    }
  }, [formData.project_id]);

  const loadSuppliers = async () => {
    try {
      const clients = await api.getClients();
      // In this system, suppliers are stored as clients (could add is_supplier flag in future)
      const clientsList = clients.data || (Array.isArray(clients) ? clients : []);
      setSuppliers(Array.isArray(clientsList) ? clientsList.filter(c => c.id) : []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      toast.error('Failed to load suppliers');
      setSuppliers([]);
    }
  };

  const loadProjects = async () => {
    try {
      const projectsData = await api.getProjects();
      const projectsList = projectsData.data || (Array.isArray(projectsData) ? projectsData : []);
      setProjects(Array.isArray(projectsList) ? projectsList.filter(p => p.id) : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load projects');
      setProjects([]);
    }
  };

  const loadProjectDetails = async (projId: string) => {
    try {
      const project = projects.find(p => p.id === projId);
      if (project) {
        setSelectedProject(project);
      } else {
        // Fetch project details if not in list
        const allProjects = await api.getProjects();
        const foundProject = Array.isArray(allProjects) ? allProjects.find((p: Project) => p.id === projId) : null;
        setSelectedProject(foundProject || null);
      }
    } catch (error) {
      console.error('Failed to load project details:', error);
    }
  };

  const loadProjectCostCenters = async (projId: string) => {
    try {
      // Load cost centers directly from API for the project
      const costCenterData = await api.getCostCenters(true, projId);
      setCostCenters(Array.isArray(costCenterData) ? costCenterData.filter(cc => cc.id) : []);
    } catch (error) {
      console.error('Failed to load cost centers:', error);
      setCostCenters([]);
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
      line_items: [...formData.line_items, { description: '', quantity: 1, unit_amount: 0, account_code: '', cost_center_id: '' }],
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

  const handleCreatePO = async () => {
    if (!formData.supplier_id || !formData.project_id) {
      toast.error('Please select a supplier and project');
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
        cost_center_id: item.cost_center_id || undefined,
        item_id: item.item_id || undefined,
      }));

      await api.createPurchaseOrder({
        supplier_id: formData.supplier_id,
        project_id: formData.project_id,
        date: formData.date,
        delivery_date: formData.delivery_date || undefined,
        line_items: lineItems,
        notes: formData.notes || undefined,
        currency: formData.currency,
      });

      toast.success('Purchase Order created successfully');
      onPurchaseOrderCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create purchase order');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      project_id: initialProjectId || '',
      date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      notes: '',
      currency: 'USD',
      line_items: [{ description: '', quantity: 1, unit_amount: 0, account_code: '', cost_center_id: '' }],
    });
    setSelectedProject(null);
  };

  const totalAmount = calculateTotal();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create Purchase Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Supplier & Project Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Supplier *</Label>
              <Select
                value={formData.supplier_id}
                onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <SelectItem value="__empty__" disabled>No suppliers available</SelectItem>
                  ) : (
                    suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Project *</Label>
              <Select
                value={formData.project_id}
                onValueChange={(value) => setFormData({ ...formData, project_id: value })}
                disabled={!!initialProjectId}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="__empty__" disabled>No projects available</SelectItem>
                  ) : (
                    projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} - {project.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedProject && (
                <p className="text-xs text-muted-foreground mt-1">
                  Budget: ${selectedProject.budget.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">PO Date *</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Expected Delivery Date</Label>
              <Input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                className="mt-2"
              />
            </div>
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
                <div className="col-span-4">Description</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2">Cost Center</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1"></div>
              </div>

              {formData.line_items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
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
                    <Select
                      value={item.cost_center_id || undefined}
                      onValueChange={(value) => updateLineItem(index, 'cost_center_id', value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {costCenters.length === 0 ? (
                          <SelectItem value="__none__" disabled>No cost centers for this project</SelectItem>
                        ) : (
                          costCenters.map(cc => (
                            <SelectItem key={cc.id} value={cc.id}>
                              {cc.code} - {cc.name}{cc.client_po_number ? ` - ${cc.client_po_number}` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold">
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
                <div className="col-span-9"></div>
                <div className="col-span-2 text-right font-mono text-sm font-bold">TOTAL</div>
                <div className="col-span-1 text-right font-mono text-lg font-bold text-electric">
                  ${totalAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes or instructions..."
              className="mt-2"
              rows={3}
            />
          </div>

          {/* Budget Impact Warning */}
          {selectedProject && totalAmount > 0 && (
            <div className="p-4 rounded-lg bg-muted/30 border border-border">
              <p className="text-sm font-mono">
                <strong>Budget Impact:</strong> This PO will commit ${totalAmount.toLocaleString()} 
                {selectedProject.budget > 0 && (
                  <> ({(totalAmount / selectedProject.budget * 100).toFixed(1)}% of project budget)</>
                )}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-electric text-background hover:bg-electric/90"
              onClick={handleCreatePO}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Purchase Order'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

