import { useState, useEffect } from 'react';
import { Project, TimesheetEntry, Client, ProjectStatus, CostCenter } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { DollarSign, Clock, Calendar, Send, TrendingUp, Wrench, Loader2, Pencil, Plus, FolderOpen, Trash2, ShoppingCart, Receipt, File, FileText, Image, Shield, Upload, Eye, Download as DownloadIcon } from 'lucide-react';
import { ProjectFinancials, ProjectFile, SafetyDocument } from '@/types';
import { FileUpload } from '@/components/ui/file-upload';
import { DocumentViewer } from '@/components/ui/document-viewer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProjectDetailModalProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated?: () => void;
}

export default function ProjectDetailModal({ project, open, onOpenChange, onProjectUpdated }: ProjectDetailModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [projectEntries, setProjectEntries] = useState<TimesheetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projectFinancials, setProjectFinancials] = useState<ProjectFinancials | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [safetyDocuments, setSafetyDocuments] = useState<SafetyDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  
  // Cost Center form
  const [showCostCenterForm, setShowCostCenterForm] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [ccFormCode, setCcFormCode] = useState('');
  const [ccFormName, setCcFormName] = useState('');
  const [ccFormDescription, setCcFormDescription] = useState('');
  const [ccFormBudget, setCcFormBudget] = useState('');
  const [isSavingCostCenter, setIsSavingCostCenter] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    client_id: '',
    description: '',
    budget: '',
    status: 'quoted' as ProjectStatus,
  });

  useEffect(() => {
    if (project && open) {
      loadProjectTimesheets();
      loadClients();
      loadCostCenters();
      loadProjectFinancials();
      loadProjectFiles();
      loadSafetyDocuments();
      // Reset edit form when project changes
      setEditForm({
        name: project.name,
        client_id: project.client_id || '',
        description: project.description || '',
        budget: project.budget?.toString() || '',
        status: project.status,
      });
      setIsEditing(false);
      setShowCostCenterForm(false);
    }
  }, [project, open]);

  const loadProjectFiles = async () => {
    if (!project) return;
    try {
      const files = await api.getProjectFiles(project.id);
      setProjectFiles(files);
    } catch (error: any) {
      console.error('Failed to load project files:', error);
    }
  };

  const loadSafetyDocuments = async () => {
    if (!project) return;
    try {
      const docs = await api.getSafetyDocuments({ project_id: project.id });
      setSafetyDocuments(docs);
    } catch (error: any) {
      console.error('Failed to load safety documents:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const loadProjectFinancials = async () => {
    if (!project) return;
    try {
      const financials = await api.getProjectFinancials(project.id);
      setProjectFinancials(financials);
    } catch (error) {
      console.error('Failed to load project financials:', error);
      setProjectFinancials(null);
    }
  };

  const loadProjectTimesheets = async () => {
    if (!project) return;
    setIsLoading(true);
    try {
      const timesheets = await api.getTimesheets({ project_id: project.id });
      setProjectEntries(Array.isArray(timesheets) ? timesheets : []);
    } catch (error) {
      console.error('Failed to load timesheets:', error);
      setProjectEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const data = await api.getClients();
      setClients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load clients:', error);
      setClients([]);
    }
  };

  const loadCostCenters = async () => {
    if (!project) return;
    try {
      const data = await api.getCostCenters(false, project.id);
      setCostCenters(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load cost centers:', error);
      setCostCenters([]);
    }
  };

  const resetCostCenterForm = () => {
    setCcFormCode('');
    setCcFormName('');
    setCcFormDescription('');
    setCcFormBudget('');
    setShowCostCenterForm(false);
    setEditingCostCenter(null);
  };

  const startEditCostCenter = (cc: CostCenter) => {
    setEditingCostCenter(cc);
    setCcFormCode(cc.code);
    setCcFormName(cc.name);
    setCcFormDescription(cc.description || '');
    setCcFormBudget(cc.budget?.toString() || '');
    setShowCostCenterForm(true);
  };

  const handleSaveCostCenter = async () => {
    if (!project || !ccFormCode.trim() || !ccFormName.trim()) {
      toast.error('Please enter code and name');
      return;
    }

    setIsSavingCostCenter(true);
    try {
      if (editingCostCenter) {
        // Update existing
        await api.updateCostCenter(editingCostCenter.id, {
          code: ccFormCode,
          name: ccFormName,
          description: ccFormDescription,
          budget: parseFloat(ccFormBudget) || 0,
        });
        toast.success('Cost center updated');
      } else {
        // Create new
        await api.createCostCenter({
          code: ccFormCode,
          name: ccFormName,
          description: ccFormDescription,
          budget: parseFloat(ccFormBudget) || 0,
          project_id: project.id,
        });
        toast.success('Cost center added to project');
      }
      resetCostCenterForm();
      loadCostCenters();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save cost center');
    } finally {
      setIsSavingCostCenter(false);
    }
  };

  const handleDeleteCostCenter = async (cc: CostCenter) => {
    if (!confirm(`Delete cost center "${cc.name}"?`)) return;
    
    try {
      await api.deleteCostCenter(cc.id);
      toast.success('Cost center deleted');
      loadCostCenters();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleSaveEdit = async () => {
    if (!project || !editForm.name || !editForm.client_id) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateProject(project.id, {
        name: editForm.name,
        client_id: editForm.client_id,
        description: editForm.description,
        budget: parseFloat(editForm.budget) || 0,
        status: editForm.status,
      });
      toast.success('Project updated successfully');
      setIsEditing(false);
      onProjectUpdated?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update project');
    } finally {
      setIsSaving(false);
    }
  };

  if (!project) return null;

  const progress = project.budget > 0 ? ((project.actual_cost || 0) / project.budget) * 100 : 0;
  const isOverBudget = progress > 100;

  const totalHours = projectEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

  // Group entries by cost center
  const entriesByCostCenter = projectEntries.reduce((acc, entry) => {
    const cc = entry.cost_center_code || 'Unknown';
    if (!acc[cc]) {
      acc[cc] = [];
    }
    acc[cc].push(entry);
    return acc;
  }, {} as Record<string, TimesheetEntry[]>);

  const handleSendToXero = () => {
    setIsSyncing(true);
    // Simulate sync
    setTimeout(() => {
      setIsSyncing(false);
      alert('Project sent to Xero successfully!');
    }, 2000);
  };

  if (!project) {
    return null;
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">{project.name}</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {project.code} • {project.client_name}
              </DialogDescription>
            </div>
            <Badge
              className={cn(
                'capitalize',
                project.status === 'in-progress'
                  ? 'bg-electric/20 text-electric border-electric'
                  : project.status === 'completed'
                  ? 'bg-voltage/20 text-voltage border-voltage'
                  : project.status === 'invoiced'
                  ? 'bg-warning/20 text-warning border-warning'
                  : ''
              )}
            >
              {project.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Budget Overview */}
          <Card className="p-6 bg-card border-border">
            {projectFinancials ? (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">Budget</span>
                    </div>
                    <p className="text-xl font-bold font-mono">${String(projectFinancials.financials.budget).toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingCart className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">PO Commitments</span>
                    </div>
                    <p className="text-xl font-bold font-mono text-purple-400">${String(projectFinancials.financials.po_commitments).toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Receipt className="w-4 h-4 text-electric" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">Actual Costs</span>
                    </div>
                    <p className="text-xl font-bold font-mono text-electric">${String(projectFinancials.financials.actual_cost).toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-voltage" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">Available</span>
                    </div>
                    <p className={cn('text-xl font-bold font-mono', projectFinancials.financials.available_budget < 0 ? 'text-warning' : 'text-voltage')}>
                      ${String(projectFinancials.financials.available_budget).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono text-muted-foreground">Budget Utilization</span>
                      <span className={cn('font-mono font-bold', ((projectFinancials.financials.actual_cost || 0) + (projectFinancials.financials.po_commitments || 0)) / (projectFinancials.financials.budget || 1) > 1 ? 'text-warning' : 'text-foreground')}>
                        {(projectFinancials.financials.budget || 0) > 0 
                          ? Math.round(((projectFinancials.financials.actual_cost || 0) + (projectFinancials.financials.po_commitments || 0)) / (projectFinancials.financials.budget || 1) * 100)
                          : 0}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(((projectFinancials.financials.actual_cost || 0) + (projectFinancials.financials.po_commitments || 0)) / (projectFinancials.financials.budget || 1) * 100, 100)}
                      className={cn('h-3', ((projectFinancials.financials.actual_cost || 0) + (projectFinancials.financials.po_commitments || 0)) / (projectFinancials.financials.budget || 1) > 1 ? '[&>div]:bg-warning' : '[&>div]:bg-electric')}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border text-xs">
                    <div>
                      <span className="text-muted-foreground font-mono uppercase">POs: </span>
                      <span className="font-bold">{projectFinancials.purchase_orders.total_count} (${(Number(projectFinancials.purchase_orders.total_committed) || 0).toFixed(0)})</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-mono uppercase">Bills: </span>
                      <span className="font-bold">{projectFinancials.bills.total_count} (${(Number(projectFinancials.bills.total_amount) || 0).toFixed(0)})</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-mono uppercase">Expenses: </span>
                      <span className="font-bold">{projectFinancials.expenses.total_count} (${(Number(projectFinancials.expenses.total_amount) || 0).toFixed(0)})</span>
                    </div>
                  </div>
                  {(projectFinancials.financials.available_budget || 0) < 0 && (
                    <p className="text-xs text-warning font-mono">⚠ Project is over budget</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">Budget</span>
                    </div>
                    <p className="text-2xl font-bold font-mono">${project.budget.toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">Actual</span>
                    </div>
                    <p className="text-2xl font-bold font-mono text-electric">${(project.actual_cost || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-mono text-muted-foreground uppercase">Hours</span>
                    </div>
                    <p className="text-2xl font-bold font-mono text-voltage">{totalHours}h</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-muted-foreground">Budget Utilization</span>
                    <span className={cn('font-mono font-bold', isOverBudget ? 'text-warning' : 'text-foreground')}>
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(progress, 100)}
                    className={cn('h-3', isOverBudget ? '[&>div]:bg-warning' : '[&>div]:bg-electric')}
                  />
                  {isOverBudget && (
                    <p className="text-xs text-warning font-mono">⚠ Project is over budget</p>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="costcenters" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="costcenters">Cost Centers</TabsTrigger>
              <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
              <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="safety">Safety</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            {/* Cost Centers Tab */}
            <TabsContent value="costcenters" className="space-y-4 mt-4">
              {/* Info message for locked cost centers */}
              {project.status !== 'quoted' && project.status !== 'in-progress' && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-sm text-warning">
                    Cost centers are locked for projects that are completed or invoiced.
                  </p>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Project Cost Centers ({costCenters.length})
                </h4>
                {(project.status === 'quoted' || project.status === 'in-progress') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCostCenterForm(!showCostCenterForm)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Cost Center
                  </Button>
                )}
              </div>

              {/* Add/Edit Cost Center Form */}
              {showCostCenterForm && (
                <Card className="p-4 bg-muted/30 border-electric">
                  <h5 className="font-mono text-sm font-semibold mb-3">
                    {editingCostCenter ? 'Edit Cost Center' : 'Add Cost Center'}
                  </h5>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Code *</Label>
                        <Input
                          value={ccFormCode}
                          onChange={(e) => setCcFormCode(e.target.value.toUpperCase())}
                          placeholder="CC001"
                          className="mt-1 font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Budget ($)</Label>
                        <Input
                          type="number"
                          value={ccFormBudget}
                          onChange={(e) => setCcFormBudget(e.target.value)}
                          placeholder="5000"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Name *</Label>
                      <Input
                        value={ccFormName}
                        onChange={(e) => setCcFormName(e.target.value)}
                        placeholder="Electrical Work"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={ccFormDescription}
                        onChange={(e) => setCcFormDescription(e.target.value)}
                        placeholder="Description..."
                        className="mt-1 h-16"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={resetCostCenterForm}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveCostCenter} disabled={isSavingCostCenter} className="bg-electric text-background hover:bg-electric/90">
                        {isSavingCostCenter ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingCostCenter ? 'Update' : 'Add')}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Cost Centers List */}
              {costCenters.length === 0 ? (
                <Card className="p-6 bg-card border-border text-center">
                  <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No cost centers for this project yet
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {costCenters.map((cc) => {
                    const used = cc.actual_cost || cc.total_cost || 0;
                    const pct = cc.budget > 0 ? (used / cc.budget) * 100 : 0;
                    return (
                      <Card key={cc.id} className="p-4 bg-card border-border">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">{cc.code}</Badge>
                              <span className="font-semibold">{cc.name}</span>
                            </div>
                            {cc.description && (
                              <p className="text-xs text-muted-foreground mt-1">{cc.description}</p>
                            )}
                          </div>
                          {(project.status === 'quoted' || project.status === 'in-progress') && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditCostCenter(cc)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteCostCenter(cc)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {cc.budget > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Budget: ${cc.budget.toLocaleString()}</span>
                              <span className={cn("font-mono", pct > 100 ? "text-warning" : "text-voltage")}>
                                ${(cc.budget - used).toLocaleString()} remaining
                              </span>
                            </div>
                            <Progress value={Math.min(pct, 100)} className={cn("h-1.5", pct > 100 && "[&>div]:bg-warning")} />
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {(Number(cc.total_hours) || 0).toFixed(1)}h
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> ${used.toLocaleString()}
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Cost Breakdown */}
            <TabsContent value="breakdown" className="space-y-4 mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-electric" />
                </div>
              ) : Object.entries(entriesByCostCenter).length === 0 ? (
                <Card className="p-6 bg-card border-border">
                  <p className="text-center text-muted-foreground">No timesheet entries found</p>
                </Card>
              ) : (
                Object.entries(entriesByCostCenter).map(([costCenter, entries]) => {
                  const totalCCHours = entries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
                  return (
                    <Card key={costCenter} className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-mono font-semibold text-foreground">{costCenter}</h4>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-electric">{totalCCHours}h</p>
                          <p className="text-xs text-muted-foreground">{entries.length} entries</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {entries.slice(0, 3).map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between text-sm py-1">
                            <span className="text-muted-foreground">{entry.user_name}</span>
                            <span className="font-mono text-foreground">{entry.hours}h</span>
                          </div>
                        ))}
                        {entries.length > 3 && (
                          <p className="text-xs text-muted-foreground text-center pt-1">
                            +{entries.length - 3} more entries
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            {/* Timesheets */}
            <TabsContent value="timesheets" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-electric" />
                </div>
              ) : projectEntries.length === 0 ? (
                <Card className="p-6 bg-card border-border">
                  <p className="text-center text-muted-foreground">No timesheet entries found</p>
                </Card>
              ) : (
                projectEntries.map((entry) => (
                  <Card key={entry.id} className="p-4 bg-card border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-foreground">{entry.user_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{entry.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-electric">{entry.hours}h</p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {entry.cost_center_code}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.notes}</p>
                    <Badge className="mt-2 capitalize text-xs">{entry.activity_type_name}</Badge>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Project Files ({projectFiles.length})
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUploadModalOpen(true)}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-1" />
                      Upload Files
                    </>
                  )}
                </Button>
              </div>

              {projectFiles.length === 0 ? (
                <Card className="p-8 bg-card border-border border-dashed text-center">
                  <File className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">No files uploaded</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Upload project documents, images, and other files
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsUploadModalOpen(true)}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Upload Your First File
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projectFiles.map((file) => {
                    const isImage = file.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                    const isPDF = file.file_name.match(/\.pdf$/i);
                    return (
                      <Card key={file.id} className="p-4 hover:border-electric transition-colors group">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            isImage ? "bg-electric/20" : isPDF ? "bg-red-500/20" : "bg-muted"
                          )}>
                            {isImage ? (
                              <Image className="w-5 h-5 text-electric" />
                            ) : isPDF ? (
                              <FileText className="w-5 h-5 text-red-500" />
                            ) : (
                              <File className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-sm">{file.file_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedFile(file)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const blob = await api.downloadFile(file.id);
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = file.file_name;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                  toast.success('File downloaded');
                                } catch (error: any) {
                                  toast.error('Failed to download file');
                                }
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <DownloadIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (!confirm(`Delete ${file.file_name}?`)) return;
                                try {
                                  await api.deleteFile(file.id);
                                  toast.success('File deleted');
                                  loadProjectFiles();
                                } catch (error: any) {
                                  toast.error('Failed to delete file');
                                }
                              }}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Safety Documents Tab */}
            <TabsContent value="safety" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Safety Documents ({safetyDocuments.length})
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info('Create safety document feature coming soon')}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Document
                </Button>
              </div>

              {safetyDocuments.length === 0 ? (
                <Card className="p-6 bg-card border-border">
                  <p className="text-center text-muted-foreground">No safety documents</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {safetyDocuments.map((doc) => (
                    <Card key={doc.id} className="p-4 hover:border-electric transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <Shield className="w-5 h-5 text-electric" />
                          <div className="flex-1">
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.document_type.replace('_', ' ')} • {doc.status} • {new Date(doc.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.file_path ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const blob = await api.downloadSafetyDocumentPDF(doc.id);
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${doc.title}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                } catch (error: any) {
                                  toast.error('Failed to download PDF');
                                }
                              }}
                            >
                              <DownloadIcon className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await api.generateSafetyDocumentPDF(doc.id);
                                  toast.success('PDF generated');
                                  loadSafetyDocuments();
                                } catch (error: any) {
                                  toast.error('Failed to generate PDF');
                                }
                              }}
                            >
                              Generate PDF
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Details */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <Card className="p-4 bg-card border-border">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Start Date</p>
                      <p className="font-mono text-sm">
                        {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'Not set'}
                      </p>
                    </div>
                  </div>
                  {project.end_date && (
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">End Date</p>
                        <p className="font-mono text-sm">
                          {new Date(project.end_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Cost Centers</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(project.cost_center_codes || []).map((cc) => (
                          <Badge key={cc} variant="outline" className="text-xs">
                            {cc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-card border-border">
                <p className="text-sm text-muted-foreground mb-2">Description</p>
                <p className="text-foreground">{project.description}</p>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Edit Form */}
          {isEditing && (
            <Card className="p-4 bg-muted/30 border-electric">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Edit Project
              </h4>
              <div className="space-y-4">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">Project Name *</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">Client *</Label>
                  <Select 
                    value={editForm.client_id} 
                    onValueChange={(value) => setEditForm({ ...editForm, client_id: value })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">Description</Label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="mt-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">Budget ($)</Label>
                    <Input
                      type="number"
                      value={editForm.budget}
                      onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">Status</Label>
                    <Select 
                      value={editForm.status} 
                      onValueChange={(value) => setEditForm({ ...editForm, status: value as ProjectStatus })}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="invoiced">Invoiced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-electric text-background hover:bg-electric/90">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              onClick={handleSendToXero}
              disabled={isSyncing || isEditing}
              className="flex-1 bg-electric text-background hover:bg-electric/90 glow-primary"
            >
              {isSyncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-rotate mr-2" />
                  Syncing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send to Xero
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
            >
              <Pencil className="w-4 h-4 mr-2" />
              {isEditing ? 'Cancel Edit' : 'Edit Project'}
            </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription>
              Upload files for project {project?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <FileUpload
              onFileSelect={setUploadFiles}
              multiple={true}
              accept="image/*,application/pdf,.doc,.docx"
              maxSize={50 * 1024 * 1024}
              disabled={isUploading}
            />
            
            {/* Upload Progress */}
            {isUploading && uploadFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-medium">Upload Progress</p>
                {uploadFiles.map((file, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1 mr-2">{file.name}</span>
                      <span className="text-muted-foreground">
                        {uploadProgress[index] || 0}%
                      </span>
                    </div>
                    <Progress value={uploadProgress[index] || 0} className="h-2" />
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!project || uploadFiles.length === 0) {
                    toast.error('Please select files to upload');
                    return;
                  }
                  setIsUploading(true);
                  setUploadProgress({});
                  try {
                    // Upload files one by one with progress tracking
                    for (let i = 0; i < uploadFiles.length; i++) {
                      const file = uploadFiles[i];
                      setUploadProgress(prev => ({ ...prev, [i]: 0 }));
                      
                      // Simulate progress (actual implementation would track real upload progress)
                      const progressInterval = setInterval(() => {
                        setUploadProgress(prev => {
                          const current = prev[i] || 0;
                          if (current < 90) {
                            return { ...prev, [i]: current + 10 };
                          }
                          return prev;
                        });
                      }, 200);

                      try {
                        await api.uploadProjectFile(file, project.id);
                        setUploadProgress(prev => ({ ...prev, [i]: 100 }));
                        clearInterval(progressInterval);
                      } catch (error) {
                        clearInterval(progressInterval);
                        throw error;
                      }
                    }
                    toast.success(`Successfully uploaded ${uploadFiles.length} file${uploadFiles.length !== 1 ? 's' : ''}`);
                    setIsUploadModalOpen(false);
                    setUploadFiles([]);
                    setUploadProgress({});
                    loadProjectFiles();
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to upload files');
                    setUploadProgress({});
                  } finally {
                    setIsUploading(false);
                  }
                }}
                disabled={uploadFiles.length === 0 || isUploading}
                className="bg-electric text-background hover:bg-electric/90"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {uploadFiles.length > 0 && `(${uploadFiles.length})`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Viewer Modal */}
      {selectedFile && (
        <DocumentViewer
          file={selectedFile}
          open={!!selectedFile}
          onOpenChange={(open) => !open && setSelectedFile(null)}
        />
      )}
    </>
  );
}
