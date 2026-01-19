import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { JSAForm } from '@/components/forms/JSAForm';
import { ComplianceCreateForm } from '@/components/forms/ComplianceCreateForm';
import { Project, Client, CostCenter, JSAData, ComplianceData, SafetyCertificateData } from '@/types';
import { api } from '@/lib/api';
import { getProjects } from '@/lib/supabaseQueries';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateSafetyDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function CreateSafetyDocumentModal({ 
  open, 
  onOpenChange,
  onSuccess 
}: CreateSafetyDocumentModalProps) {
  const [documentType, setDocumentType] = useState<'jsa' | 'electrical_compliance' | 'electrical_safety_certificate'>('jsa');
  const [projectId, setProjectId] = useState<string>('');
  const [costCenterId, setCostCenterId] = useState<string>('__none__');
  const [title, setTitle] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'completed' | 'approved'>('draft');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data for each document type
  const [jsaData, setJsaData] = useState<Partial<JSAData>>({});
  const [complianceData, setComplianceData] = useState<Partial<ComplianceData>>({});
  const [safetyCertData, setSafetyCertData] = useState<Partial<SafetyCertificateData>>({});

  useEffect(() => {
    if (open) {
      loadProjects();
    }
  }, [open]);

  useEffect(() => {
    if (projectId) {
      loadProjectData(projectId);
    } else {
      setSelectedProject(null);
      setSelectedClient(null);
      setCostCenters([]);
      setCostCenterId('__none__');
      // Reset autofilled data
      setJsaData({});
      setComplianceData({});
      setSafetyCertData({});
      setTitle('');
    }
  }, [projectId, documentType]);

  useEffect(() => {
    if (selectedProject && documentType) {
      // Generate title suggestion
      const typeLabel = documentType === 'jsa' 
        ? 'JSA' 
        : documentType === 'electrical_compliance' 
        ? 'Electrical Compliance' 
        : 'Electrical Safety Certificate';
      setTitle(`${selectedProject.code} - ${typeLabel}`);
    }
  }, [selectedProject, documentType]);

  const loadProjects = async () => {
    try {
      const projectsData = await getProjects({ limit: 100 });
      setProjects(Array.isArray(projectsData) ? projectsData.filter(p => p.id) : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load projects');
    }
  };

  const loadProjectData = async (projId: string) => {
    setLoadingProject(true);
    try {
      // Fetch project details
      const project = await api.getProject(projId);
      setSelectedProject(project);

      // Fetch client if project has client_id
      if (project.client_id) {
        try {
          const client = await api.getClient(project.client_id);
          setSelectedClient(client);
          
          // Autofill location from client address or project description
          // Note: projects table doesn't have location column, use client address or project description
          const location = client.address || project.description || '';
          
          // Autofill based on document type
          if (documentType === 'jsa') {
            setJsaData({
              location: location,
              date: new Date().toISOString().split('T')[0],
              prepared_by_name: '', // Could be autofilled from current user
            });
          } else if (documentType === 'electrical_compliance' || documentType === 'electrical_safety_certificate') {
            setComplianceData({
              location: location,
              issue_date: new Date().toISOString().split('T')[0],
              description: project.description || '',
            });
            if (documentType === 'electrical_safety_certificate') {
              setSafetyCertData({
                location: location,
                issue_date: new Date().toISOString().split('T')[0],
                description: project.description || '',
              });
            }
          }
        } catch (error) {
          console.error('Failed to load client:', error);
        }
      }

      // Load cost centers for this project
      try {
        const costCenterData = await api.getCostCenters(true, projId);
        setCostCenters(Array.isArray(costCenterData) ? costCenterData.filter(cc => cc.id) : []);
        
        // Pre-select first cost center if available
        if (costCenterData && Array.isArray(costCenterData) && costCenterData.length > 0) {
          setCostCenterId(costCenterData[0].id);
        } else {
          setCostCenterId('__none__');
        }
      } catch (error) {
        console.error('Failed to load cost centers:', error);
        setCostCenters([]);
      }
    } catch (error) {
      console.error('Failed to load project data:', error);
      toast.error('Failed to load project details');
    } finally {
      setLoadingProject(false);
    }
  };

  const handleDocumentTypeChange = (type: 'jsa' | 'electrical_compliance' | 'electrical_safety_certificate') => {
    setDocumentType(type);
    // Regenerate title when type changes
    if (selectedProject) {
      const typeLabel = type === 'jsa' 
        ? 'JSA' 
        : type === 'electrical_compliance' 
        ? 'Electrical Compliance' 
        : 'Electrical Safety Certificate';
      setTitle(`${selectedProject.code} - ${typeLabel}`);
    }
  };

  const handleJSASubmit = async (data: JSAData) => {
    await handleSubmit(data);
  };

  const handleComplianceSubmit = async (data: ComplianceData | SafetyCertificateData) => {
    await handleSubmit(data);
  };

  const handleSubmit = async (documentData: JSAData | ComplianceData | SafetyCertificateData) => {
    if (!projectId) {
      toast.error('Please select a project');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createSafetyDocument({
        project_id: projectId,
        cost_center_id: costCenterId && costCenterId !== '__none__' ? costCenterId : undefined,
        document_type: documentType,
        title: title.trim(),
        data: documentData,
        status: status,
      });

      toast.success('Safety document created successfully');
      onOpenChange(false);
      resetForm();
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create safety document');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setProjectId('');
    setCostCenterId('__none__');
    setTitle('');
    setStatus('draft');
    setDocumentType('jsa');
    setSelectedProject(null);
    setSelectedClient(null);
    setCostCenters([]);
    setJsaData({});
    setComplianceData({});
    setSafetyCertData({});
  };

  const handleClose = (open: boolean) => {
    if (!open && !isSubmitting) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create Safety Document</DialogTitle>
          <DialogDescription>
            Create a new safety document for a project. Select a project to autofill information.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Document Type Selection */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">Document Type *</Label>
            <Select value={documentType} onValueChange={handleDocumentTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jsa">Job Safety Analysis (JSA)</SelectItem>
                <SelectItem value="electrical_compliance">Electrical Compliance</SelectItem>
                <SelectItem value="electrical_safety_certificate">Electrical Safety Certificate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Project Selection */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingProject && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading project details...
              </div>
            )}
            {selectedClient && (
              <p className="text-sm text-muted-foreground">
                Client: {selectedClient.name}
              </p>
            )}
          </div>

          {/* Cost Center Selection (optional) */}
          {projectId && costCenters.length > 0 && (
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider">Cost Center (Optional)</Label>
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a cost center" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {costCenters.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>
                      {cc.code} - {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider">Status</Label>
            <Select value={status} onValueChange={(value: 'draft' | 'completed' | 'approved') => setStatus(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Document Type Specific Form */}
          {projectId && (
            <div className="border-t border-border pt-4">
              {documentType === 'jsa' && (
                <JSAForm
                  projectId={projectId}
                  initialData={jsaData}
                  onSubmit={handleJSASubmit}
                  onCancel={() => handleClose(false)}
                  isSubmitting={isSubmitting}
                />
              )}
              {(documentType === 'electrical_compliance' || documentType === 'electrical_safety_certificate') && (
                <ComplianceCreateForm
                  projectId={projectId}
                  costCenterId={costCenterId && costCenterId !== '__none__' ? costCenterId : undefined}
                  documentType={documentType}
                  initialData={documentType === 'electrical_safety_certificate' ? safetyCertData : complianceData}
                  onSubmit={handleComplianceSubmit}
                  onCancel={() => handleClose(false)}
                  isSubmitting={isSubmitting}
                />
              )}
            </div>
          )}

          {!projectId && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Please select a project to continue</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
