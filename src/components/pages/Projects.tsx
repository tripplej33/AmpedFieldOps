import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProjects, createProject, updateProject, deleteProject, getClients } from '@/lib/supabaseQueries';
import { Project, ProjectStatus, Client } from '@/types';
import { Plus, MoreVertical, TrendingUp, Clock, DollarSign, Loader2, Archive, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProjectDetailModal from '@/components/modals/ProjectDetailModal';
import { toast } from 'sonner';

const statusColumns: { status: ProjectStatus; label: string; color: string }[] = [
  { status: 'quoted', label: 'Quoted', color: 'text-muted-foreground' },
  { status: 'in-progress', label: 'In Progress', color: 'text-electric' },
  { status: 'completed', label: 'Completed', color: 'text-voltage' },
  { status: 'invoiced', label: 'Invoiced', color: 'text-warning' },
];

function ProjectCard({ 
  project, 
  onClick, 
  onDelete 
}: { 
  project: Project; 
  onClick: () => void;
  onDelete: (project: Project) => void;
}) {
  const progress = project.budget > 0 ? ((project.actual_cost || 0) / project.budget) * 100 : 0;
  const isOverBudget = progress > 100;

  return (
    <Card className="p-4 bg-card border-border hover:border-electric transition-all cursor-pointer group" onClick={onClick}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground group-hover:text-electric transition-colors truncate">
            {project.name}
          </h4>
          <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{project.code}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-destructive" 
              onClick={(e) => { e.stopPropagation(); onDelete(project); }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-muted-foreground mb-4">{project.client_name}</p>

      {/* Progress Ring */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              className="text-muted"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.min(progress, 100) / 100)}`}
              className={cn(
                'transition-all',
                isOverBudget ? 'text-warning' : progress > 70 ? 'text-electric' : 'text-voltage'
              )}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold font-mono">{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <DollarSign className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-muted-foreground truncate">
              ${(project.actual_cost || 0).toLocaleString()} / ${project.budget.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-muted-foreground">{project.hours_logged || 0}h logged</span>
          </div>
        </div>
      </div>

      {/* Cost Centers */}
      <div className="flex flex-wrap gap-1">
        {(project.cost_center_codes || []).map((cc, i) => (
          <Badge key={i} variant="outline" className="text-xs font-mono">
            {cc}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

export default function Projects() {
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    client_id: '',
    description: '',
    budget: '',
    status: 'quoted' as ProjectStatus,
  });

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Only load data once auth is complete and user is authenticated
    if (!authLoading && isAuthenticated) {
      loadProjects();
      loadClients();
    }
  }, [authLoading, isAuthenticated]);

  // Handle URL parameters for opening specific project or create modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('id');
    const action = params.get('action');
    
    if (action === 'create') {
      setCreateModalOpen(true);
      navigate('/projects', { replace: true });
    } else if (projectId && projects.length > 0) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        setSelectedProject(project);
        setDetailModalOpen(true);
        // Clear the URL param
        navigate('/projects', { replace: true });
      }
    }
  }, [location.search, projects, navigate]);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await getProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      toast.error(error.message || 'Failed to load projects');
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(Array.isArray(data) ? data.filter(c => c.id) : []);
    } catch (error) {
      console.error('Failed to load clients:', error);
      toast.error('Failed to load clients');
      setClients([]);
    }
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setDetailModalOpen(true);
  };

  const handleCreateProject = () => {
    setCreateModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      client_id: '',
      description: '',
      budget: '',
      status: 'quoted',
    });
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.client_id) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await createProject({
        ...formData,
        budget: parseFloat(formData.budget) || 0,
      });
      toast.success('Project created successfully');
      setCreateModalOpen(false);
      resetForm();
      loadProjects();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete "${project.name}"?`)) return;

    try {
      await deleteProject(project.id);
      toast.success('Project deleted');
      loadProjects();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete project');
    }
  };

  // Filter projects based on active tab
  const activeProjects = projects.filter((p) => p.status !== 'paid');
  const archivedProjects = projects.filter((p) => p.status === 'paid');

  if (isLoading) {
    return (
      <>
        <Header title="Project Status Board" subtitle="Kanban view of all active projects" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Project Status Board" subtitle="Kanban view of all active projects" />

      <div className="p-4 sm:p-6 lg:p-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'active' | 'archive')} className="w-full">
          <div className="mb-6 flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="active">
                Active Projects
              </TabsTrigger>
              <TabsTrigger value="archive">
                <Archive className="w-4 h-4 mr-2" />
                Archive ({archivedProjects.length})
              </TabsTrigger>
            </TabsList>
            {activeTab === 'active' && (
              <Button 
                className="bg-electric text-background hover:bg-electric/90 glow-primary"
                onClick={handleCreateProject}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            )}
          </div>

          <TabsContent value="active" className="mt-0">
            <div className="mb-6 flex items-center gap-4">
              {statusColumns.map((col) => {
                const count = activeProjects.filter((p) => p.status === col.status).length;
                return (
                  <div key={col.status} className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', col.color.replace('text-', 'bg-'))} />
                    <span className="text-sm font-mono">
                      {col.label} <span className="text-muted-foreground">({count})</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-w-[320px] px-4 sm:px-0">
                {statusColumns.map((column) => (
                <div key={column.status} className="space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-border">
                    <div className={cn('w-2 h-2 rounded-full', column.color.replace('text-', 'bg-'))} />
                    <h3 className={cn('font-bold font-mono uppercase text-sm tracking-wider', column.color)}>
                      {column.label}
                    </h3>
                    <span className="ml-auto text-sm font-mono text-muted-foreground">
                      {activeProjects.filter((p) => p.status === column.status).length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {activeProjects
                      .filter((p) => p.status === column.status)
                      .map((project) => (
                        <ProjectCard key={project.id} project={project} onClick={() => handleProjectClick(project)} onDelete={handleDeleteProject} />
                      ))}
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full border-2 border-dashed border-muted hover:border-electric hover:text-electric"
                    onClick={handleCreateProject}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Project
                  </Button>
                </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="archive" className="mt-0">
            {archivedProjects.length === 0 ? (
              <Card className="p-12 bg-card border-border text-center">
                <Archive className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Archived Projects</h3>
                <p className="text-muted-foreground">
                  Projects marked as "paid" will appear here once they are archived.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedProjects.map((project) => (
                  <Card 
                    key={project.id} 
                    className="p-4 bg-card border-border hover:border-muted-foreground/30 transition-colors cursor-pointer opacity-75 hover:opacity-100"
                    onClick={() => handleProjectClick(project)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-4 h-4 text-voltage flex-shrink-0" />
                          <h4 className="font-semibold text-foreground truncate">{project.name}</h4>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground mb-1">{project.code}</p>
                        <p className="text-sm text-muted-foreground truncate">{project.client_name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        <span>${(project.actual_cost || 0).toLocaleString()}</span>
                      </div>
                      {project.end_date && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(project.end_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ProjectDetailModal project={selectedProject} open={detailModalOpen} onOpenChange={setDetailModalOpen} onProjectUpdated={loadProjects} />

      {/* Create Project Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Project</DialogTitle>
            <DialogDescription>Add a new project to track time and costs</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider">
                Project Name *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Commercial Fit-out - Office Building"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="client" className="font-mono text-xs uppercase tracking-wider">
                Client *
              </Label>
              <Select 
                value={formData.client_id} 
                onValueChange={(value) => setFormData({ ...formData, client_id: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 ? (
                    <SelectItem value="__empty__" disabled>No clients available</SelectItem>
                  ) : (
                    clients.filter(client => client.id).map((client) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description" className="font-mono text-xs uppercase tracking-wider">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Project details and scope..."
                className="mt-2 min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="budget" className="font-mono text-xs uppercase tracking-wider">
                  Budget ($)
                </Label>
                <Input
                  id="budget"
                  type="number"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  placeholder="50000"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="status" className="font-mono text-xs uppercase tracking-wider">
                  Status
                </Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => setFormData({ ...formData, status: value as ProjectStatus })}
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
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setCreateModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-electric text-background hover:bg-electric/90"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
