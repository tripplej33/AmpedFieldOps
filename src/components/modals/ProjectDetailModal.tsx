import { useState } from 'react';
import { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { mockTimesheetEntries, mockCostCenters } from '@/lib/mockData';
import { DollarSign, Clock, Calendar, Send, TrendingUp, Wrench, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectDetailModalProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProjectDetailModal({ project, open, onOpenChange }: ProjectDetailModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  if (!project) return null;

  const progress = (project.actualCost / project.budget) * 100;
  const isOverBudget = progress > 100;

  const projectEntries = mockTimesheetEntries.filter((e) => e.projectId === project.id);
  const totalHours = projectEntries.reduce((sum, e) => sum + e.hours, 0);

  // Group entries by cost center
  const entriesByCostCenter = projectEntries.reduce((acc, entry) => {
    if (!acc[entry.costCenter]) {
      acc[entry.costCenter] = [];
    }
    acc[entry.costCenter].push(entry);
    return acc;
  }, {} as Record<string, typeof projectEntries>);

  const handleSendToXero = () => {
    setIsSyncing(true);
    // Simulate sync
    setTimeout(() => {
      setIsSyncing(false);
      alert('Project sent to Xero successfully!');
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">{project.name}</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {project.code} • {project.clientName}
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
                <p className="text-2xl font-bold font-mono text-electric">${project.actualCost.toLocaleString()}</p>
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
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="breakdown" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
              <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            {/* Cost Breakdown */}
            <TabsContent value="breakdown" className="space-y-4 mt-4">
              {Object.entries(entriesByCostCenter).map(([costCenter, entries]) => {
                const totalCCHours = entries.reduce((sum, e) => sum + e.hours, 0);
                const cc = mockCostCenters.find((c) => c.code === costCenter);
                return (
                  <Card key={costCenter} className="p-4 bg-card border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-mono font-semibold text-foreground">{costCenter}</h4>
                        <p className="text-xs text-muted-foreground">{cc?.name || 'Unknown Cost Center'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-electric">{totalCCHours}h</p>
                        <p className="text-xs text-muted-foreground">{entries.length} entries</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {entries.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm py-1">
                          <span className="text-muted-foreground">{entry.userName}</span>
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
              })}
            </TabsContent>

            {/* Timesheets */}
            <TabsContent value="timesheets" className="space-y-3 mt-4">
              {projectEntries.map((entry) => (
                <Card key={entry.id} className="p-4 bg-card border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-foreground">{entry.userName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{entry.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-electric">{entry.hours}h</p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {entry.costCenter}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.notes}</p>
                  <Badge className="mt-2 capitalize text-xs">{entry.activityType}</Badge>
                </Card>
              ))}
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
                        {new Date(project.startDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {project.endDate && (
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">End Date</p>
                        <p className="font-mono text-sm">
                          {new Date(project.endDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Cost Centers</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {project.costCenters.map((cc) => (
                          <Badge key={cc} variant="outline" className="text-xs">
                            CC-{cc.padStart(3, '0')}
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

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              onClick={handleSendToXero}
              disabled={isSyncing}
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
            <Button variant="outline" className="flex-1">
              Edit Project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
