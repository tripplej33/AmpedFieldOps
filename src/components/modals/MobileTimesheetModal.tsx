import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { Client, Project, ActivityType, CostCenter } from '@/types';
import { Camera, Wrench, CheckCircle, Search, MessageSquare, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MobileTimesheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Wrench: Wrench,
  CheckCircle: CheckCircle,
  Search: Search,
  MessageSquare: MessageSquare,
};

export default function MobileTimesheetModal({ open, onOpenChange }: MobileTimesheetModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedActivity, setSelectedActivity] = useState('');
  const [selectedCostCenter, setSelectedCostCenter] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [clientsData, activityData, costCenterData] = await Promise.all([
        api.getClients({ status: 'active' }),
        api.getActivityTypes(true),
        api.getCostCenters(true)
      ]);
      setClients(clientsData);
      setActivityTypes(activityData);
      setCostCenters(costCenterData);
    } catch (error) {
      toast.error('Failed to load form data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientChange = async (clientId: string) => {
    setSelectedClient(clientId);
    setSelectedProject('');
    
    if (clientId) {
      try {
        const projectsData = await api.getProjects({ client_id: clientId });
        setProjects(projectsData);
      } catch (error) {
        setProjects([]);
      }
    } else {
      setProjects([]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedProject || !selectedActivity || !selectedCostCenter || !hours) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createTimesheet({
        project_id: selectedProject,
        activity_type_id: selectedActivity,
        cost_center_id: selectedCostCenter,
        date: new Date().toISOString().split('T')[0],
        hours: parseFloat(hours),
        notes
      });
      toast.success('Timesheet entry created');
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedClient('');
    setSelectedProject('');
    setSelectedActivity('');
    setSelectedCostCenter('');
    setHours('');
    setNotes('');
  };

  const filteredProjects = projects;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">New Timesheet Entry</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric',
              year: 'numeric'
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Photo Capture */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Photos (Optional)</Label>
            <Button
              variant="outline"
              className="w-full h-32 border-dashed border-2 hover:border-electric hover:bg-electric/5"
            >
              <div className="flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Tap to capture photo</span>
              </div>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-electric" />
            </div>
          ) : (
            <>
          {/* Client Selection */}
          <div>
            <Label htmlFor="client" className="font-mono text-xs uppercase tracking-wider">
              Client
            </Label>
            <Select value={selectedClient} onValueChange={handleClientChange}>
              <SelectTrigger className="mt-2 focus:border-electric focus:glow-primary">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Project Selection */}
          <div>
            <Label htmlFor="project" className="font-mono text-xs uppercase tracking-wider">
              Project *
            </Label>
            <Select 
              value={selectedProject} 
              onValueChange={setSelectedProject}
              disabled={!selectedClient}
            >
              <SelectTrigger className="mt-2 focus:border-electric focus:glow-primary">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {filteredProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cost Center Selection */}
          <div>
            <Label htmlFor="costCenter" className="font-mono text-xs uppercase tracking-wider">
              Cost Center *
            </Label>
            <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
              <SelectTrigger className="mt-2 focus:border-electric focus:glow-primary">
                <SelectValue placeholder="Select cost center" />
              </SelectTrigger>
              <SelectContent>
                {costCenters.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    <span className="font-mono">{cc.code}</span> - {cc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Activity Type */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider mb-3 block">
              Activity Type *
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {activityTypes.map((activity) => {
                const IconComponent = iconMap[activity.icon] || Wrench;
                return (
                  <button
                    key={activity.id}
                    onClick={() => setSelectedActivity(activity.id)}
                    className={cn(
                      'p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                      selectedActivity === activity.id
                        ? activity.color + ' glow-primary'
                        : 'bg-muted/20 border-muted hover:border-electric'
                    )}
                  >
                    <IconComponent className="w-6 h-6" />
                    <span className="text-xs font-medium">{activity.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hours */}
          <div>
            <Label htmlFor="hours" className="font-mono text-xs uppercase tracking-wider">
              Hours Worked
            </Label>
            <div className="relative mt-2">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="hours"
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="8.0"
                className="pl-10 font-mono text-lg focus:border-electric focus:glow-primary"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="font-mono text-xs uppercase tracking-wider">
              Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details about the work performed..."
              rows={4}
              className="mt-2 resize-none focus:border-electric focus:glow-primary"
            />
          </div>
            </>
          )}
        </div>

        {/* Submit Button */}
        <div className="sticky bottom-0 bg-background pt-4 border-t border-border">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedProject || !selectedActivity || !selectedCostCenter || !hours}
            className="w-full h-12 bg-electric text-background hover:bg-electric/90 glow-primary text-base font-semibold"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Submit Entry'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
