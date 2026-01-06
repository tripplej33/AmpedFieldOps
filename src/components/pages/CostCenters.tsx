import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { CostCenter, Project } from '@/types';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  Briefcase, 
  DollarSign, 
  Clock,
  FolderOpen,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function CostCenters() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');

  // Form
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBudget, setFormBudget] = useState('');
  const [formProjectId, setFormProjectId] = useState<string>('');

  useEffect(() => {
    loadCostCenters();
    loadProjects();
  }, []);

  const loadCostCenters = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCostCenters();
      setCostCenters(Array.isArray(data) ? data : []);
      setIsLoading(false);
    } catch (error: any) {
      console.error('Failed to load cost centers:', error);
      if (error?.message !== 'Failed to fetch') {
        toast.error('Failed to load cost centers');
      }
      setCostCenters([]);
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  };

  const resetForm = () => {
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormBudget('');
    setFormProjectId('');
    setEditingCostCenter(null);
  };

  const handleOpenCreate = (projectId?: string) => {
    resetForm();
    if (projectId) setFormProjectId(projectId);
    setShowModal(true);
  };

  const handleOpenEdit = (cc: CostCenter) => {
    setEditingCostCenter(cc);
    setFormCode(cc.code);
    setFormName(cc.name);
    setFormDescription(cc.description || '');
    setFormBudget(cc.budget?.toString() || '');
    setFormProjectId(cc.project_id || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formCode.trim() || !formName.trim()) {
      toast.error('Please enter code and name');
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        code: formCode,
        name: formName,
        description: formDescription,
        budget: parseFloat(formBudget) || 0,
        project_id: formProjectId || null,
      };

      if (editingCostCenter) {
        await api.updateCostCenter(editingCostCenter.id, data);
        toast.success('Cost center updated');
      } else {
        await api.createCostCenter(data);
        toast.success('Cost center created');
      }
      setShowModal(false);
      resetForm();
      loadCostCenters();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (cc: CostCenter) => {
    try {
      await api.updateCostCenter(cc.id, { is_active: !cc.is_active });
      toast.success(cc.is_active ? 'Cost center deactivated' : 'Cost center activated');
      loadCostCenters();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const handleDelete = async (cc: CostCenter) => {
    if (!confirm(`Are you sure you want to delete "${cc.name}"?`)) return;

    try {
      await api.deleteCostCenter(cc.id);
      toast.success('Cost center deleted');
      loadCostCenters();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  // Filter cost centers
  const filteredCostCenters = costCenters.filter(cc => {
    const matchesSearch = cc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          cc.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = filterProjectId === 'all' || 
                           (filterProjectId === 'global' && !cc.project_id) ||
                           cc.project_id === filterProjectId;
    return matchesSearch && matchesProject;
  });

  // Group by project
  const globalCostCenters = filteredCostCenters.filter(cc => !cc.project_id);
  const projectCostCenters = filteredCostCenters.filter(cc => cc.project_id);

  // Group project cost centers by project
  const groupedByProject = projectCostCenters.reduce((acc, cc) => {
    const projectId = cc.project_id!;
    if (!acc[projectId]) acc[projectId] = [];
    acc[projectId].push(cc);
    return acc;
  }, {} as Record<string, CostCenter[]>);

  return (
    <>
      <Header title="Cost Centers" subtitle="Manage project-specific and global cost centers" />

      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        {/* Actions */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search cost centers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>

            {/* Project Filter */}
            <Select value={filterProjectId} onValueChange={setFilterProjectId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cost Centers</SelectItem>
                <SelectItem value="global">Global Only</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-sm text-muted-foreground">
              {filteredCostCenters.length} cost centers
            </p>
          </div>

          <Button 
            className="bg-electric text-background hover:bg-electric/90"
            onClick={() => handleOpenCreate()}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Cost Center
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-electric" />
          </div>
        )}

        {!isLoading && (
          <>
            {/* Global Cost Centers */}
            {(filterProjectId === 'all' || filterProjectId === 'global') && globalCostCenters.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-electric" />
                  Global Cost Centers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {globalCostCenters.map((cc) => (
                    <CostCenterCard 
                      key={cc.id} 
                      costCenter={cc}
                      onEdit={handleOpenEdit}
                      onDelete={handleDelete}
                      onToggleActive={handleToggleActive}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Project-Specific Cost Centers */}
            {Object.entries(groupedByProject).map(([projectId, costCenters]) => {
              const project = projects.find(p => p.id === projectId);
              if (!project) return null;
              
              return (
                <div key={projectId} className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-electric" />
                      {project.name}
                      <Badge variant="outline" className="ml-2 font-mono text-xs">
                        {project.code}
                      </Badge>
                    </h3>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleOpenCreate(projectId)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add to {project.name}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {costCenters.map((cc) => (
                      <CostCenterCard 
                        key={cc.id} 
                        costCenter={cc}
                        onEdit={handleOpenEdit}
                        onDelete={handleDelete}
                        onToggleActive={handleToggleActive}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {filteredCostCenters.length === 0 && (
              <Card className="p-12 text-center bg-card border-border">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {searchQuery || filterProjectId !== 'all' 
                    ? 'No cost centers found matching your filters.'
                    : 'No cost centers yet. Create your first one.'}
                </p>
                {!searchQuery && filterProjectId === 'all' && (
                  <Button 
                    className="bg-electric text-background hover:bg-electric/90"
                    onClick={() => handleOpenCreate()}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Cost Center
                  </Button>
                )}
              </Card>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingCostCenter ? 'Edit Cost Center' : 'New Cost Center'}
            </DialogTitle>
            <DialogDescription>
              {editingCostCenter 
                ? 'Update cost center details and budget'
                : 'Create a new cost center for tracking project expenses'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs uppercase">Code *</Label>
                <Input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="CC001"
                  className="mt-2 font-mono"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase">Budget ($)</Label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  placeholder="5000"
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase">Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Electrical Installation"
                className="mt-2"
              />
            </div>

            <div>
              <Label className="font-mono text-xs uppercase">Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Description of what this cost center tracks..."
                className="mt-2 min-h-[80px]"
              />
            </div>

            <div>
              <Label className="font-mono text-xs uppercase">Project (Optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Link to a specific project for job-specific tracking
              </p>
              <Select value={formProjectId || 'none'} onValueChange={(v) => setFormProjectId(v === 'none' ? '' : v)}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Global (No Project)</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        {project.name}
                        <span className="text-muted-foreground font-mono text-xs">
                          {project.code}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-electric text-background hover:bg-electric/90"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingCostCenter ? 'Update Cost Center' : 'Create Cost Center')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Cost Center Card Component
function CostCenterCard({ 
  costCenter, 
  onEdit, 
  onDelete, 
  onToggleActive 
}: { 
  costCenter: CostCenter;
  onEdit: (cc: CostCenter) => void;
  onDelete: (cc: CostCenter) => void;
  onToggleActive: (cc: CostCenter) => void;
}) {
  const budgetUsed = costCenter.actual_cost || costCenter.total_cost || 0;
  const budgetProgress = costCenter.budget > 0 ? (budgetUsed / costCenter.budget) * 100 : 0;
  const isOverBudget = budgetProgress > 100;
  const remainingBudget = costCenter.budget - budgetUsed;

  return (
    <Card className={cn(
      "p-5 bg-card border-border transition-all hover:border-electric",
      !costCenter.is_active && "opacity-50"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <Badge variant="outline" className="font-mono text-xs mb-2">
            {costCenter.code}
          </Badge>
          <h4 className="font-bold text-foreground">{costCenter.name}</h4>
          {costCenter.project_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Briefcase className="w-3 h-3" />
              {costCenter.project_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(costCenter)}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(costCenter)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {costCenter.description && (
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {costCenter.description}
        </p>
      )}

      {/* Budget Progress */}
      {costCenter.budget > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-mono font-bold">
              ${costCenter.budget.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={Math.min(budgetProgress, 100)} 
            className={cn(
              "h-2",
              isOverBudget && "[&>div]:bg-warning"
            )}
          />
          <div className="flex items-center justify-between text-xs">
            <span className={cn(
              "font-mono",
              isOverBudget ? "text-warning" : "text-muted-foreground"
            )}>
              ${budgetUsed.toLocaleString()} used ({Math.round(budgetProgress)}%)
            </span>
            <span className={cn(
              "font-mono",
              remainingBudget < 0 ? "text-warning" : "text-voltage"
            )}>
              ${remainingBudget.toLocaleString()} remaining
            </span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{(Number(costCenter.total_hours) || 0).toFixed(1)}h logged</span>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono">${budgetUsed.toLocaleString()}</span>
        </div>
      </div>

      {/* Active Toggle */}
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Active</span>
        <Switch
          checked={costCenter.is_active}
          onCheckedChange={() => onToggleActive(costCenter)}
        />
      </div>
    </Card>
  );
}
