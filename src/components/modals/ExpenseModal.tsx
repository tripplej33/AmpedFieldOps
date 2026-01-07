import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { Project, CostCenter } from '@/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ExpenseModalProps {
  projectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExpenseCreated?: () => void;
}

export default function ExpenseModal({ projectId: initialProjectId, open, onOpenChange, onExpenseCreated }: ExpenseModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [formData, setFormData] = useState({
    project_id: initialProjectId || '',
    cost_center_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    receipt_url: '',
    currency: 'USD',
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    if (open) {
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

  const handleCreateExpense = async () => {
    if (!formData.description || !formData.amount || !formData.date) {
      toast.error('Please fill in required fields');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsCreating(true);
    try {
      await api.createExpense({
        project_id: formData.project_id || undefined,
        cost_center_id: formData.cost_center_id || undefined,
        amount: amount,
        date: formData.date,
        description: formData.description,
        receipt_url: formData.receipt_url || undefined,
        currency: formData.currency,
      });

      toast.success('Expense created successfully');
      onExpenseCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create expense');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      project_id: initialProjectId || '',
      cost_center_id: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      receipt_url: '',
      currency: 'USD',
    });
    setSelectedProject(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create Expense Claim</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Project Selection */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Project (Optional)</Label>
            <Select
              value={formData.project_id || undefined}
              onValueChange={(value) => setFormData({ ...formData, project_id: value || '', cost_center_id: '' })}
              disabled={!!initialProjectId}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select project (optional)" />
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

          {/* Cost Center (only if project selected) */}
          {formData.project_id && (
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Cost Center (Optional)</Label>
              <Select
                value={formData.cost_center_id || undefined}
                onValueChange={(value) => setFormData({ ...formData, cost_center_id: value || '' })}
                disabled={costCenters.length === 0}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={costCenters.length === 0 ? "No cost centers for this project" : "Select cost center (optional)"} />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.length === 0 ? (
                    <SelectItem value="__none__" disabled>No cost centers available</SelectItem>
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
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="mt-2"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Date *</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Description *</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the expense..."
              className="mt-2"
              rows={3}
            />
          </div>

          {/* Receipt URL */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Receipt URL (Optional)</Label>
            <Input
              type="url"
              value={formData.receipt_url}
              onChange={(e) => setFormData({ ...formData, receipt_url: e.target.value })}
              placeholder="https://..."
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Link to receipt image or document
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-electric text-background hover:bg-electric/90"
              onClick={handleCreateExpense}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Expense'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

