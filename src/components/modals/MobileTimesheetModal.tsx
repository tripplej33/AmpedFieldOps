import { useState, useEffect, useRef } from 'react';
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
import { Camera, Wrench, CheckCircle, Search, MessageSquare, Clock, Loader2, Image, X, Calendar } from 'lucide-react';
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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Image state
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [clientsResponse, activityData] = await Promise.all([
        api.getClients({ status: 'active' }),
        api.getActivityTypes(true),
      ]);
      const clientsList = clientsResponse.data || (Array.isArray(clientsResponse) ? clientsResponse : []);
      setClients(Array.isArray(clientsList) ? clientsList.filter(c => c.id) : []);
      setActivityTypes(Array.isArray(activityData) ? activityData.filter(a => a.id) : []);
      setCostCenters([]); // Cost centers are now loaded per-project
    } catch (error) {
      console.error('Failed to load form data:', error);
      toast.error('Failed to load form data');
      setClients([]);
      setActivityTypes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientChange = async (clientId: string) => {
    setSelectedClient(clientId);
    setSelectedProject('');
    setSelectedCostCenter('');
    setCostCenters([]);
    
    if (clientId) {
      try {
        const projectsResponse = await api.getProjects({ client_id: clientId, limit: 100 });
        const projectsData = projectsResponse.data || (Array.isArray(projectsResponse) ? projectsResponse : []);
        setProjects(Array.isArray(projectsData) ? projectsData.filter(p => p.id) : []);
      } catch (error) {
        console.error('Failed to load projects:', error);
        setProjects([]);
      }
    } else {
      setProjects([]);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    setSelectedProject(projectId);
    setSelectedCostCenter('');
    
    if (projectId) {
      try {
        const costCenterData = await api.getCostCenters(true, projectId);
        setCostCenters(Array.isArray(costCenterData) ? costCenterData.filter(cc => cc.id) : []);
      } catch (error) {
        console.error('Failed to load cost centers:', error);
        setCostCenters([]);
      }
    } else {
      setCostCenters([]);
    }
  };

  // Image handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + imageFiles.length > 5) {
      toast.error('Maximum 5 images allowed');
      return;
    }
    
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image must be less than 10MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    
    setImageFiles(prev => [...prev, ...files]);
    if (e.target) e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
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
        date: selectedDate,
        hours: parseFloat(hours),
        notes,
        image_files: imageFiles,
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
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setImageFiles([]);
    setImagePreviews([]);
  };

  const filteredProjects = projects;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">New Timesheet Entry</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {new Date(selectedDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric',
              year: 'numeric'
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date Selection */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label className="font-mono text-xs uppercase tracking-wider mb-3 block flex items-center gap-2">
              <Calendar className="w-4 h-4 text-electric" />
              Date
            </Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono text-base h-12"
            />
          </div>

          {/* Photo Capture */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label className="font-mono text-xs uppercase tracking-wider mb-3 block flex items-center gap-2">
              <Camera className="w-4 h-4 text-electric" />
              Photos (Optional)
            </Label>
            
            {/* Image Previews */}
            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-border group">
                    <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {imagePreviews.length < 5 && (
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-24 border-2 border-dashed hover:border-electric hover:bg-electric/10 transition-all"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-electric/20 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-electric" />
                    </div>
                    <span className="text-xs font-medium">Take Photo</span>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-24 border-2 border-dashed hover:border-electric hover:bg-electric/10 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-electric/20 flex items-center justify-center">
                      <Image className="w-5 h-5 text-electric" />
                    </div>
                    <span className="text-xs font-medium">Gallery</span>
                  </div>
                </Button>
              </div>
            )}
            
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <p className="text-xs text-muted-foreground mt-2">
              {imagePreviews.length}/5 photos added
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-electric" />
            </div>
          ) : (
            <>
          {/* Client Selection */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label htmlFor="client" className="font-mono text-xs uppercase tracking-wider mb-3 block">
              Client
            </Label>
            <Select value={selectedClient} onValueChange={handleClientChange}>
              <SelectTrigger className="h-12 focus:border-electric">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.length === 0 ? (
                  <SelectItem value="__empty__" disabled>No active clients available</SelectItem>
                ) : (
                  clients.filter(client => client.id).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Project Selection */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label htmlFor="project" className="font-mono text-xs uppercase tracking-wider mb-3 block">
              Project *
            </Label>
            <Select 
              value={selectedProject} 
              onValueChange={handleProjectChange}
              disabled={!selectedClient}
            >
              <SelectTrigger className="h-12 focus:border-electric">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {filteredProjects.length === 0 ? (
                  <SelectItem value="__empty__" disabled>No projects for this client</SelectItem>
                ) : (
                  filteredProjects.filter(project => project.id).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Cost Center Selection */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label htmlFor="costCenter" className="font-mono text-xs uppercase tracking-wider mb-3 block">
              Cost Center *
            </Label>
            <Select 
              value={selectedCostCenter} 
              onValueChange={setSelectedCostCenter}
              disabled={!selectedProject || costCenters.length === 0}
            >
              <SelectTrigger className="h-12 focus:border-electric">
                <SelectValue placeholder={costCenters.length === 0 ? "Select project first" : "Select cost center"} />
              </SelectTrigger>
              <SelectContent>
                {costCenters.length === 0 ? (
                  <SelectItem value="__none__" disabled>No cost centers for this project</SelectItem>
                ) : (
                  costCenters.filter(cc => cc.id).map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>
                      <span className="font-mono">{cc.code}</span> - {cc.name}{cc.client_po_number ? ` - ${cc.client_po_number}` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Activity Type */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label className="font-mono text-xs uppercase tracking-wider mb-4 block">
              Activity Type *
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {activityTypes.length === 0 ? (
                <div className="col-span-2 p-6 text-center text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg bg-muted/10">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No activity types available</p>
                </div>
              ) : (
                activityTypes.map((activity) => {
                const IconComponent = iconMap[activity.icon] || Wrench;
                return (
                  <button
                    key={activity.id}
                    onClick={() => setSelectedActivity(activity.id)}
                    className={cn(
                      'p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 min-h-[100px]',
                      selectedActivity === activity.id
                        ? activity.color + ' glow-primary shadow-md scale-[1.02]'
                        : 'bg-card border-border hover:border-electric/50 hover:bg-muted/30'
                    )}
                  >
                    <IconComponent className={cn(
                      "w-7 h-7 transition-colors",
                      selectedActivity === activity.id ? "text-electric" : "text-muted-foreground"
                    )} />
                    <span className="text-xs font-semibold">{activity.name}</span>
                  </button>
                );
              })
              )}
            </div>
          </div>

          {/* Hours */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label htmlFor="hours" className="font-mono text-xs uppercase tracking-wider mb-3 block flex items-center gap-2">
              <Clock className="w-4 h-4 text-electric" />
              Hours Worked *
            </Label>
            <div className="relative">
              <Input
                id="hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="8.00"
                className="h-14 pl-4 pr-4 font-mono text-2xl text-center focus:border-electric focus:ring-2 focus:ring-electric/20"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">hrs</span>
            </div>
          </div>

          {/* Notes */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <Label htmlFor="notes" className="font-mono text-xs uppercase tracking-wider mb-3 block">
              Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details about the work performed..."
              rows={5}
              className="resize-none focus:border-electric focus:ring-2 focus:ring-electric/20"
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
            className="w-full h-14 bg-electric text-background hover:bg-electric/90 glow-primary text-base font-semibold shadow-lg shadow-electric/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Entry'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
