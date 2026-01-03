import { useState, useEffect } from 'react';
import { Project, CostCenter, User, JSAData } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface JSACreateFormProps {
  projectId?: string;
  costCenterId?: string;
  onSubmit: (data: JSAData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function JSACreateForm({ projectId, costCenterId, onSubmit, onCancel, isSubmitting = false }: JSACreateFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<JSAData>({
    job_description: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    prepared_by: '',
    hazards: [],
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projectsResponse, usersData] = await Promise.all([
        api.getProjects({ limit: 100 }),
        api.getUsers(),
      ]);
      const projectsData = projectsResponse.data || (Array.isArray(projectsResponse) ? projectsResponse : []);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setUsers(usersData);

      if (projectId) {
        // Load cost centers for the project
        const project = projectsData.find((p: Project) => p.id === projectId);
        if (project && project.cost_center_ids) {
          // Load cost centers - you may need to adjust this based on your API
          // For now, we'll leave it empty
        }
      }
    } catch (error: any) {
      toast.error('Failed to load form data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHazard = () => {
    setFormData({
      ...formData,
      hazards: [
        ...(formData.hazards || []),
        { description: '', risk_level: 'medium', control_measures: '' },
      ],
    });
  };

  const handleRemoveHazard = (index: number) => {
    setFormData({
      ...formData,
      hazards: formData.hazards?.filter((_, i) => i !== index) || [],
    });
  };

  const handleUpdateHazard = (index: number, field: string, value: string) => {
    const updatedHazards = [...(formData.hazards || [])];
    updatedHazards[index] = { ...updatedHazards[index], [field]: value };
    setFormData({ ...formData, hazards: updatedHazards });
  };

  const handleSubmit = async () => {
    if (!formData.job_description || !formData.location || !formData.date) {
      toast.error('Please fill in required fields');
      return;
    }

    // Add prepared_by_name from users list
    const preparedByUser = users.find((u) => u.id === formData.prepared_by);
    const dataToSubmit = {
      ...formData,
      prepared_by_name: preparedByUser?.name,
    };

    await onSubmit(dataToSubmit);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6 py-4 max-h-[80vh] overflow-y-auto">
      {/* Job Information */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Job Information</h3>
        
        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Project *</Label>
          <Select
            value={projectId || ''}
            disabled={!!projectId}
            onValueChange={(value) => {
              // Project selection logic if needed
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.code} - {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Job Description *</Label>
          <Textarea
            value={formData.job_description}
            onChange={(e) => setFormData({ ...formData, job_description: e.target.value })}
            className="mt-2"
            rows={3}
            placeholder="Describe the job or task..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Location *</Label>
            <Input
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="mt-2"
              placeholder="Job location"
            />
          </div>

          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Date *</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="mt-2"
            />
          </div>
        </div>

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Prepared By</Label>
          <Select
            value={formData.prepared_by || ''}
            onValueChange={(value) => setFormData({ ...formData, prepared_by: value })}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Hazards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Hazards & Control Measures</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddHazard}>
            <Plus className="w-4 h-4 mr-2" />
            Add Hazard
          </Button>
        </div>

        {formData.hazards && formData.hazards.length > 0 ? (
          <div className="space-y-4">
            {formData.hazards.map((hazard, index) => (
              <Card key={index} className="p-4 border border-border">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Hazard #{index + 1}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveHazard(index)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">Description</Label>
                    <Textarea
                      value={hazard.description}
                      onChange={(e) => handleUpdateHazard(index, 'description', e.target.value)}
                      className="mt-2"
                      rows={2}
                      placeholder="Describe the hazard..."
                    />
                  </div>

                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">Risk Level</Label>
                    <Select
                      value={hazard.risk_level}
                      onValueChange={(value) => handleUpdateHazard(index, 'risk_level', value)}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">Control Measures</Label>
                    <Textarea
                      value={hazard.control_measures}
                      onChange={(e) => handleUpdateHazard(index, 'control_measures', e.target.value)}
                      className="mt-2"
                      rows={2}
                      placeholder="Describe control measures..."
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hazards added. Click "Add Hazard" to add one.</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <Label className="font-mono text-xs uppercase tracking-wider">Additional Notes</Label>
        <Textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="mt-2"
          rows={3}
          placeholder="Any additional notes or comments..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save JSA'}
        </Button>
      </div>
    </div>
  );
}

