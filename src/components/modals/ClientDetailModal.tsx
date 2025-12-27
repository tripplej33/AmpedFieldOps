import { useState, useEffect } from 'react';
import { Client, Project, TimesheetEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { 
  DollarSign, 
  Clock, 
  Phone, 
  Mail, 
  MapPin, 
  Briefcase, 
  Loader2, 
  Pencil,
  TrendingUp,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ClientDetailModalProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientUpdated?: () => void;
}

export default function ClientDetailModal({ client, open, onOpenChange, onClientUpdated }: ClientDetailModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    location: '',
    notes: '',
  });

  useEffect(() => {
    if (client && open) {
      loadClientData();
      setEditForm({
        name: client.name,
        contact_name: client.contact_name || '',
        email: client.email,
        phone: client.phone || '',
        location: client.location || '',
        notes: client.notes || '',
      });
      setIsEditing(false);
    }
  }, [client, open]);

  const loadClientData = async () => {
    if (!client) return;
    setIsLoading(true);
    try {
      const [projectsData, timesheetsData] = await Promise.all([
        api.getProjects({ client_id: client.id }),
        api.getTimesheets({ client_id: client.id }),
      ]);
      setProjects(projectsData);
      setTimesheets(timesheetsData);
    } catch (error) {
      console.error('Failed to load client data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!client || !editForm.name || !editForm.email) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateClient(client.id, editForm);
      toast.success('Client updated successfully');
      setIsEditing(false);
      onClientUpdated?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update client');
    } finally {
      setIsSaving(false);
    }
  };

  if (!client) return null;

  // Calculate metrics
  const totalHours = timesheets.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalActual = projects.reduce((sum, p) => sum + (p.actual_cost || 0), 0);
  const activeProjects = projects.filter(p => p.status === 'in-progress').length;
  const completedProjects = projects.filter(p => p.status === 'completed' || p.status === 'invoiced').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">{client.name}</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {client.contact_name && `${client.contact_name} • `}{client.email}
              </DialogDescription>
            </div>
            <Badge className="bg-electric/20 text-electric border-electric">
              {client.active_projects || 0} Active Projects
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Contact Info */}
          <Card className="p-4 bg-card border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <a href={`mailto:${client.email}`} className="text-sm text-electric hover:underline">{client.email}</a>
                </div>
              </div>
              {client.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <a href={`tel:${client.phone}`} className="text-sm text-electric hover:underline">{client.phone}</a>
                  </div>
                </div>
              )}
              {client.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm">{client.location}</p>
                  </div>
                </div>
              )}
              {client.contact_name && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Contact</p>
                    <p className="text-sm">{client.contact_name}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Financial Summary */}
          <Card className="p-6 bg-card border-border">
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Financial Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground uppercase">Total Budget</span>
                </div>
                <p className="text-2xl font-bold font-mono">${totalBudget.toLocaleString()}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground uppercase">Total Billed</span>
                </div>
                <p className="text-2xl font-bold font-mono text-electric">${totalActual.toLocaleString()}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground uppercase">Total Hours</span>
                </div>
                <p className="text-2xl font-bold font-mono text-voltage">{totalHours.toFixed(1)}h</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground uppercase">Projects</span>
                </div>
                <p className="text-2xl font-bold font-mono">
                  {activeProjects} <span className="text-sm text-muted-foreground">/ {projects.length}</span>
                </p>
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="projects" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
              <TabsTrigger value="timesheets">Recent Activity</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            {/* Projects */}
            <TabsContent value="projects" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-electric" />
                </div>
              ) : projects.length === 0 ? (
                <Card className="p-6 bg-card border-border">
                  <p className="text-center text-muted-foreground">No projects found</p>
                </Card>
              ) : (
                projects.map((project) => {
                  const progress = project.budget > 0 ? ((project.actual_cost || 0) / project.budget) * 100 : 0;
                  return (
                    <Card key={project.id} className="p-4 bg-card border-border hover:border-electric transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground">{project.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{project.code}</p>
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
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Budget: ${project.budget?.toLocaleString()}</span>
                        <span className={cn('font-mono', progress > 100 ? 'text-warning' : 'text-foreground')}>
                          {Math.round(progress)}% used
                        </span>
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
              ) : timesheets.length === 0 ? (
                <Card className="p-6 bg-card border-border">
                  <p className="text-center text-muted-foreground">No timesheet entries found</p>
                </Card>
              ) : (
                timesheets.slice(0, 10).map((entry) => (
                  <Card key={entry.id} className="p-4 bg-card border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-foreground">{entry.project_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{entry.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-electric">{entry.hours}h</p>
                        <p className="text-xs text-muted-foreground">{entry.user_name}</p>
                      </div>
                    </div>
                    {entry.notes && <p className="text-sm text-muted-foreground">{entry.notes}</p>}
                  </Card>
                ))
              )}
              {timesheets.length > 10 && (
                <p className="text-center text-sm text-muted-foreground">
                  +{timesheets.length - 10} more entries
                </p>
              )}
            </TabsContent>

            {/* Details / Edit */}
            <TabsContent value="details" className="space-y-4 mt-4">
              {isEditing ? (
                <Card className="p-4 bg-muted/30 border-electric">
                  <h4 className="font-bold mb-4 flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    Edit Client
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Company Name *</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Contact Name</Label>
                      <Input
                        value={editForm.contact_name}
                        onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
                        className="mt-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">Email *</Label>
                        <Input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">Phone</Label>
                        <Input
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="mt-2"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Location</Label>
                      <Input
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Notes</Label>
                      <Textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="mt-2"
                      />
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
              ) : (
                <Card className="p-4 bg-card border-border">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm mt-1">{client.notes || 'No notes added'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Activity</p>
                      <p className="text-sm mt-1 font-mono">
                        {client.last_activity 
                          ? new Date(client.last_activity).toLocaleDateString() 
                          : 'No activity'}
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
            >
              <Pencil className="w-4 h-4 mr-2" />
              {isEditing ? 'Cancel Edit' : 'Edit Client'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
