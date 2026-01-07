import { useState, useEffect } from 'react';
import { JSAData } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';

interface JSAFormProps {
  projectId?: string;
  initialData?: Partial<JSAData>;
  onSubmit: (data: JSAData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function JSAForm({ 
  projectId,
  initialData,
  onSubmit, 
  onCancel, 
  isSubmitting = false
}: JSAFormProps) {
  const [formData, setFormData] = useState<JSAData>({
    job_description: initialData?.job_description || '',
    location: initialData?.location || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    prepared_by: initialData?.prepared_by || '',
    prepared_by_name: initialData?.prepared_by_name || '',
    prepared_by_date: initialData?.prepared_by_date || '',
    approved_by_name: initialData?.approved_by_name || '',
    approved_by_date: initialData?.approved_by_date || '',
    hazards: initialData?.hazards || [],
    notes: initialData?.notes || '',
  });

  const handleAddHazard = () => {
    setFormData({
      ...formData,
      hazards: [...(formData.hazards || []), { description: '', risk_level: 'medium', control_measures: '' }],
    });
  };

  const handleRemoveHazard = (index: number) => {
    setFormData({
      ...formData,
      hazards: formData.hazards?.filter((_, i) => i !== index) || [],
    });
  };

  const handleUpdateHazard = (index: number, field: 'description' | 'risk_level' | 'control_measures', value: string) => {
    const updated = [...(formData.hazards || [])];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, hazards: updated });
  };

  // Update form data when initialData changes (for autofill)
  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({
        ...prev,
        ...initialData,
        location: initialData.location || prev.location,
        date: initialData.date || prev.date,
      }));
    }
  }, [initialData]);

  const handleSubmit = async () => {
    if (!formData.job_description || !formData.location || !formData.date) {
      return;
    }

    await onSubmit(formData);
  };

  return (
    <div className="space-y-6 py-4 max-h-[80vh] overflow-y-auto">
      {/* Job Information */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Job Information</h3>
        
        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Job Description *</Label>
          <Textarea
            value={formData.job_description}
            onChange={(e) => setFormData({ ...formData, job_description: e.target.value })}
            className="mt-2"
            rows={3}
            placeholder="Describe the job/task..."
          />
        </div>

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

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Prepared By</Label>
          <Input
            value={formData.prepared_by_name || ''}
            onChange={(e) => setFormData({ ...formData, prepared_by_name: e.target.value })}
            className="mt-2"
            placeholder="Name of person preparing JSA"
          />
        </div>

        {formData.prepared_by_name && (
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Prepared Date</Label>
            <Input
              type="date"
              value={formData.prepared_by_date || ''}
              onChange={(e) => setFormData({ ...formData, prepared_by_date: e.target.value })}
              className="mt-2"
            />
          </div>
        )}
      </div>

      {/* Hazards and Control Measures */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Hazards and Control Measures</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddHazard}>
            <Plus className="w-4 h-4 mr-2" />
            Add Hazard
          </Button>
        </div>

        {formData.hazards && formData.hazards.length > 0 ? (
          <div className="space-y-3">
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
                    <Label className="font-mono text-xs uppercase tracking-wider">Hazard Description</Label>
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
                        <SelectValue placeholder="Select risk level" />
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
                      rows={3}
                      placeholder="Describe control measures to mitigate the hazard..."
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

      {/* Sign-offs */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Sign-offs</h3>
        
        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Approved By</Label>
          <Input
            value={formData.approved_by_name || ''}
            onChange={(e) => setFormData({ ...formData, approved_by_name: e.target.value })}
            className="mt-2"
            placeholder="Name of approver"
          />
        </div>

        {formData.approved_by_name && (
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Approved Date</Label>
            <Input
              type="date"
              value={formData.approved_by_date || ''}
              onChange={(e) => setFormData({ ...formData, approved_by_date: e.target.value })}
              className="mt-2"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Additional Notes</h3>
        <Textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          placeholder="Any additional notes or comments..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={isSubmitting || !formData.job_description || !formData.location || !formData.date}
        >
          {isSubmitting ? 'Saving...' : 'Save JSA'}
        </Button>
      </div>
    </div>
  );
}
