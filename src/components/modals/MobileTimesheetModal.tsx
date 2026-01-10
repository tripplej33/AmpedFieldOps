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
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Client, Project, ActivityType, CostCenter, User } from '@/types';
import { Camera, Wrench, Clock, Loader2, Image, X, Calendar, Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MobileTimesheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ActivityTypeEntry {
  id: string;
  activity_type_id: string;
  cost_center_id: string;
  hours: string;
  user_ids: string[];
  user_hours: Record<string, string>;
  notes: string;
}

export default function MobileTimesheetModal({ open, onOpenChange }: MobileTimesheetModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    client_id: '',
    project_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    activity_entries: [] as ActivityTypeEntry[],
  });

  // Image state
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [clientsResponse, activityData, usersData] = await Promise.all([
        api.getClients({ status: 'active', limit: 100 }).catch(() => ({ data: [] })),
        api.getActivityTypes(true).catch(() => []),
        api.getUsers().catch(() => ({ data: [] })),
      ]);
      
      const clientsList = clientsResponse.data || (Array.isArray(clientsResponse) ? clientsResponse : []);
      setClients(Array.isArray(clientsList) ? clientsList.filter(c => c.id) : []);
      setActivityTypes(Array.isArray(activityData) ? activityData.filter(a => a.id) : []);
      
      const usersList = (usersData && typeof usersData === 'object' && 'data' in usersData && Array.isArray(usersData.data)) 
        ? usersData.data 
        : (Array.isArray(usersData) ? usersData : []);
      setUsers(Array.isArray(usersList) ? usersList.filter(u => u.id) : []);
      
      setCostCenters([]);
    } catch (error) {
      console.error('Failed to load form data:', error);
      toast.error('Failed to load form data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientChange = async (clientId: string) => {
    setFormData({ ...formData, client_id: clientId, project_id: '' });
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
    setFormData({ ...formData, project_id: projectId });
    
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

  // Activity entry management
  const addActivityEntry = () => {
    const newEntry: ActivityTypeEntry = {
      id: `entry-${Date.now()}-${Math.random()}`,
      activity_type_id: '',
      cost_center_id: '',
      hours: '',
      user_ids: [],
      user_hours: {},
      notes: '',
    };
    setFormData(prev => ({
      ...prev,
      activity_entries: [...prev.activity_entries, newEntry]
    }));
  };

  const removeActivityEntry = (entryId: string) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.filter(e => e.id !== entryId)
    }));
  };

  const updateActivityEntry = (entryId: string, updates: Partial<ActivityTypeEntry>) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.map(e => 
        e.id === entryId ? { ...e, ...updates } : e
      )
    }));
  };

  const toggleUserForActivity = (entryId: string, userId: string) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.map(e => {
        if (e.id !== entryId) return e;
        const isSelected = e.user_ids.includes(userId);
        const newUserIds = isSelected 
          ? e.user_ids.filter(id => id !== userId)
          : [...e.user_ids, userId];
        const newUserHours = { ...e.user_hours };
        if (isSelected) {
          delete newUserHours[userId];
        } else {
          newUserHours[userId] = e.hours || '';
        }
        return { ...e, user_ids: newUserIds, user_hours: newUserHours };
      })
    }));
  };

  const updateUserHoursForActivity = (entryId: string, userId: string, hours: string) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.map(e => 
        e.id === entryId 
          ? { ...e, user_hours: { ...e.user_hours, [userId]: hours } }
          : e
      )
    }));
  };

  // Image handling
  const validateAndAddFiles = (files: File[]) => {
    const validFiles: File[] = [];
    
    for (const file of files) {
      if (imageFiles.length + validFiles.length >= 5) {
        toast.error('Maximum 5 images allowed');
        break;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      
      validFiles.push(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
    
    setImageFiles(prev => [...prev, ...validFiles]);
    return validFiles.length;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    validateAndAddFiles(files);
    if (e.target) e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    validateAndAddFiles(files);
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.project_id) {
      toast.error('Please select a project');
      return;
    }

    if (formData.activity_entries.length === 0) {
      toast.error('Please add at least one activity type');
      return;
    }

    // Validate each activity entry
    for (const entry of formData.activity_entries) {
      if (!entry.activity_type_id) {
        toast.error('Please select an activity type for all entries');
        return;
      }
      if (!entry.cost_center_id) {
        toast.error('Please select a cost center for all entries');
        return;
      }

      if (entry.user_ids.length > 0) {
        const missingHours = entry.user_ids.filter(
          userId => !entry.user_hours[userId] || parseFloat(entry.user_hours[userId]) <= 0
        );
        if (missingHours.length > 0) {
          toast.error('Please enter hours for all assigned users');
          return;
        }
      } else if (!entry.hours || parseFloat(entry.hours) <= 0) {
        toast.error('Please enter hours for all activity types');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let createdCount = 0;

      for (const entry of formData.activity_entries) {
        if (entry.user_ids.length > 0) {
          for (const userId of entry.user_ids) {
            const hours = parseFloat(entry.user_hours[userId]);
            await api.createTimesheet({
              project_id: formData.project_id,
              activity_type_id: entry.activity_type_id,
              cost_center_id: entry.cost_center_id,
              date: formData.date,
              hours: hours,
              notes: entry.notes || formData.notes,
              user_id: userId,
              image_files: imageFiles,
            });
            createdCount++;
          }
        } else {
          await api.createTimesheet({
            project_id: formData.project_id,
            activity_type_id: entry.activity_type_id,
            cost_center_id: entry.cost_center_id,
            date: formData.date,
            hours: parseFloat(entry.hours),
            notes: entry.notes || formData.notes,
            image_files: imageFiles,
          });
          createdCount++;
        }
      }

      toast.success(`Created ${createdCount} timesheet entr${createdCount !== 1 ? 'ies' : 'y'}`);
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create entries');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: '',
      project_id: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      activity_entries: [],
    });
    setImageFiles([]);
    setImagePreviews([]);
    setCostCenters([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">New Timesheet Entry</DialogTitle>
          <DialogDescription>
            Log hours for a project
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-electric" />
            </div>
          ) : (
            <>
              {/* Project Information Section */}
              <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-electric" />
                  Project Information
                </h3>
                
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Client</Label>
                  <Select value={formData.client_id} onValueChange={handleClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <SelectItem value="__empty__" disabled>No clients available</SelectItem>
                      ) : (
                        clients.map((client) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Project *</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={handleProjectChange}
                    disabled={!formData.client_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.length === 0 ? (
                        <SelectItem value="__empty__" disabled>No projects for this client</SelectItem>
                      ) : (
                        projects.filter(project => project.id).map((project) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Date *</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="max-w-xs"
                  />
                </div>
              </div>

              {/* Activity Entries Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-electric" />
                    Activity Types *
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addActivityEntry}
                    className="h-8 border-electric/30 hover:border-electric hover:bg-electric/10"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Activity
                  </Button>
                </div>

                {formData.activity_entries.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-muted rounded-lg text-center bg-muted/10">
                    <Wrench className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground font-medium">No activities added</p>
                    <p className="text-xs text-muted-foreground mt-1">Click "Add Activity" to get started</p>
                  </div>
                ) : (
                  formData.activity_entries.map((entry: ActivityTypeEntry, index: number) => (
                    <Card key={entry.id} className="p-5 border-2 border-border hover:border-electric/50 transition-colors bg-card">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-electric/20 border-2 border-electric flex items-center justify-center">
                            <span className="text-sm font-bold font-mono text-electric">{index + 1}</span>
                          </div>
                          <Label className="font-semibold text-base">
                            Activity {index + 1}
                          </Label>
                        </div>
                        {formData.activity_entries.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeActivityEntry(entry.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Activity Type *</Label>
                          <Select
                            value={entry.activity_type_id}
                            onValueChange={(value) => updateActivityEntry(entry.id, { activity_type_id: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select activity" />
                            </SelectTrigger>
                            <SelectContent>
                              {activityTypes.length === 0 ? (
                                <SelectItem value="__empty__" disabled>No activity types available</SelectItem>
                              ) : (
                                activityTypes.filter(type => type.id).map((type) => (
                                  <SelectItem key={type.id} value={type.id.toString()}>
                                    {type.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Cost Center *</Label>
                          <Select
                            value={entry.cost_center_id}
                            onValueChange={(value) => updateActivityEntry(entry.id, { cost_center_id: value })}
                            disabled={!formData.project_id || costCenters.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={costCenters.length === 0 ? "Select project first" : "Select cost center"} />
                            </SelectTrigger>
                            <SelectContent>
                              {costCenters.length === 0 ? (
                                <SelectItem value="__none__" disabled>No cost centers for this project</SelectItem>
                              ) : (
                                costCenters.filter(cc => cc.id).map((cc) => (
                                  <SelectItem key={cc.id} value={cc.id.toString()}>
                                    {cc.code} - {cc.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Users and Hours Section */}
                      <div className="space-y-3 pt-3 border-t border-border">
                        <Label className="font-mono text-xs uppercase tracking-wider flex items-center gap-2 mb-3 block">
                          <Users className="w-4 h-4 text-electric" />
                          Assign Users & Hours
                        </Label>
                        
                        <div className="space-y-2">
                          {users.map((user) => {
                            const isSelected = entry.user_ids.includes(user.id);
                            return (
                              <div key={user.id} className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border-2 transition-all",
                                isSelected 
                                  ? "border-electric bg-electric/10" 
                                  : "border-border hover:border-electric/30 bg-card"
                              )}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleUserForActivity(entry.id, user.id)}
                                  className="border-2"
                                />
                                <div className="flex-1">
                                  <Label className="text-sm font-medium cursor-pointer" onClick={() => toggleUserForActivity(entry.id, user.id)}>
                                    {user.name}
                                  </Label>
                                </div>
                                {isSelected && (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      step="0.25"
                                      min="0.25"
                                      max="24"
                                      value={entry.user_hours[user.id] || ''}
                                      onChange={(e) => updateUserHoursForActivity(entry.id, user.id, e.target.value)}
                                      placeholder="0.00"
                                      className="w-24 h-9 text-sm font-mono text-center border-electric/30 focus:border-electric"
                                    />
                                    <span className="text-xs text-muted-foreground font-medium">hrs</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {entry.user_ids.length === 0 && (
                          <div className="p-4 text-xs text-muted-foreground text-center border-2 border-dashed border-muted rounded-lg bg-muted/10">
                            <Users className="w-5 h-5 mx-auto mb-2 opacity-50" />
                            <p>No users assigned. Check users above to assign hours, or enter hours below.</p>
                          </div>
                        )}

                        {entry.user_ids.length === 0 && (
                          <div>
                            <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Hours *</Label>
                            <Input
                              type="number"
                              step="0.25"
                              min="0.25"
                              max="24"
                              value={entry.hours}
                              onChange={(e) => updateActivityEntry(entry.id, { hours: e.target.value })}
                              placeholder="8.00"
                              className="font-mono"
                            />
                          </div>
                        )}
                      </div>

                      {/* Activity-specific notes */}
                      <div className="pt-3 border-t border-border">
                        <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Activity Notes</Label>
                        <Textarea
                          value={entry.notes}
                          onChange={(e) => updateActivityEntry(entry.id, { notes: e.target.value })}
                          placeholder="Notes for this activity..."
                          className="min-h-[60px] text-sm"
                        />
                      </div>
                    </Card>
                  ))
                )}
              </div>

              {/* General Notes */}
              <div className="p-4 rounded-lg border border-border bg-muted/20">
                <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">General Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="General work description..."
                  className="min-h-[100px] resize-none"
                />
              </div>

              {/* Photo/Image Upload Section */}
              <div className="p-4 rounded-lg border border-border bg-muted/20">
                <Label className="font-mono text-xs uppercase tracking-wider mb-3 block flex items-center gap-2">
                  <Camera className="w-4 h-4 text-electric" />
                  Photos / Media
                </Label>
                
                {/* Drag and Drop Zone */}
                {imagePreviews.length < 5 && (
                  <div
                    ref={dropZoneRef as React.LegacyRef<HTMLDivElement>}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 transition-all duration-200",
                      isDragging 
                        ? "border-electric bg-electric/20 scale-[1.02] shadow-lg shadow-electric/20" 
                        : "border-muted hover:border-electric/50 bg-muted/10"
                    )}
                  >
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                        isDragging ? "bg-electric/20" : "bg-muted"
                      )}>
                        <Image className={cn(
                          "w-6 h-6 transition-colors",
                          isDragging ? "text-electric" : "text-muted-foreground"
                        )} />
                      </div>
                      <div>
                        <p className={cn(
                          "text-sm font-semibold transition-colors",
                          isDragging ? "text-electric" : "text-foreground"
                        )}>
                          {isDragging ? "Drop images here" : "Drag & drop images here"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          or click buttons below to select
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {/* Image Previews */}
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-border group hover:border-electric transition-all shadow-sm">
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

                  {/* Upload Buttons */}
                  {imagePreviews.length < 5 && (
                    <>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-20 h-20 rounded-lg border-2 border-dashed border-muted hover:border-electric hover:bg-electric/5 flex flex-col items-center justify-center gap-2 transition-all group"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted group-hover:bg-electric/20 flex items-center justify-center transition-colors">
                          <Camera className="w-4 h-4 text-muted-foreground group-hover:text-electric transition-colors" />
                        </div>
                        <span className="text-xs text-muted-foreground group-hover:text-electric font-medium transition-colors">Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-lg border-2 border-dashed border-muted hover:border-electric hover:bg-electric/5 flex flex-col items-center justify-center gap-2 transition-all group"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted group-hover:bg-electric/20 flex items-center justify-center transition-colors">
                          <Image className="w-4 h-4 text-muted-foreground group-hover:text-electric transition-colors" />
                        </div>
                        <span className="text-xs text-muted-foreground group-hover:text-electric font-medium transition-colors">Gallery</span>
                      </button>
                    </>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-electric"></span>
                  Add up to 5 photos (max 10MB each). Drag & drop or click to select.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Submit Button */}
        <div className="sticky bottom-0 bg-background pt-6 border-t-2 border-border -mx-4 px-4 pb-4">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.project_id || formData.activity_entries.length === 0}
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
      </DialogContent>
    </Dialog>
  );
}
