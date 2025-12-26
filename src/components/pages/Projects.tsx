import { useState } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockProjects } from '@/lib/mockData';
import { Project, ProjectStatus } from '@/types';
import { Plus, MoreVertical, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ProjectDetailModal from '@/components/modals/ProjectDetailModal';

const statusColumns: { status: ProjectStatus; label: string; color: string }[] = [
  { status: 'quoted', label: 'Quoted', color: 'text-muted-foreground' },
  { status: 'in-progress', label: 'In Progress', color: 'text-electric' },
  { status: 'completed', label: 'Completed', color: 'text-voltage' },
  { status: 'invoiced', label: 'Invoiced', color: 'text-warning' },
];

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const progress = (project.actualCost / project.budget) * 100;
  const isOverBudget = progress > 100;

  return (
    <Card className="p-4 bg-card border-border hover:border-electric transition-all cursor-pointer group" onClick={onClick}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="font-semibold text-foreground group-hover:text-electric transition-colors">
            {project.name}
          </h4>
          <p className="text-xs font-mono text-muted-foreground mt-1">{project.code}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem>Edit Project</DropdownMenuItem>
            <DropdownMenuItem>Send to Xero</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-muted-foreground mb-4">{project.clientName}</p>

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
            <span className="font-mono text-muted-foreground">
              ${project.actualCost.toLocaleString()} / ${project.budget.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-muted-foreground">{project.hoursLogged}h logged</span>
          </div>
        </div>
      </div>

      {/* Cost Centers */}
      <div className="flex flex-wrap gap-1">
        {project.costCenters.map((cc, i) => (
          <Badge key={i} variant="outline" className="text-xs font-mono">
            CC-{cc.padStart(3, '0')}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

export default function Projects() {
  const [projects] = useState<Project[]>(mockProjects);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setDetailModalOpen(true);
  };

  return (
    <>
      <Header title="Project Status Board" subtitle="Kanban view of all active projects" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {statusColumns.map((col) => {
              const count = projects.filter((p) => p.status === col.status).length;
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
          <Button className="bg-electric text-background hover:bg-electric/90 glow-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statusColumns.map((column) => (
            <div key={column.status} className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <div className={cn('w-2 h-2 rounded-full', column.color.replace('text-', 'bg-'))} />
                <h3 className={cn('font-bold font-mono uppercase text-sm tracking-wider', column.color)}>
                  {column.label}
                </h3>
                <span className="ml-auto text-sm font-mono text-muted-foreground">
                  {projects.filter((p) => p.status === column.status).length}
                </span>
              </div>

              <div className="space-y-3">
                {projects
                  .filter((p) => p.status === column.status)
                  .map((project) => (
                    <ProjectCard key={project.id} project={project} onClick={() => handleProjectClick(project)} />
                  ))}
              </div>

              <Button
                variant="ghost"
                className="w-full border-2 border-dashed border-muted hover:border-electric hover:text-electric"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Project
              </Button>
            </div>
          ))}
        </div>
      </div>

      <ProjectDetailModal project={selectedProject} open={detailModalOpen} onOpenChange={setDetailModalOpen} />
    </>
  );
}
