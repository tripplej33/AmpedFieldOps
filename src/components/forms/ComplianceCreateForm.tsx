import { useState, useEffect } from 'react';
import { Project, ComplianceData } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ComplianceCreateFormProps {
  projectId?: string;
  costCenterId?: string;
  onSubmit: (data: ComplianceData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  documentType?: 'electrical_compliance' | 'electrical_safety_certificate';
}

export function ComplianceCreateForm({ 
  projectId, 
  costCenterId, 
  onSubmit, 
  onCancel, 
  isSubmitting = false,
  documentType = 'electrical_compliance'
}: ComplianceCreateFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<ComplianceData>({
    certificate_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    location: '',
    description: '',
    inspector_name: '',
    inspector_license: '',
    compliance_standards: [],
    testing_results: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const projectsData = await api.getProjects();
      setProjects(projectsData);
    } catch (error: any) {
      toast.error('Failed to load form data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStandard = () => {
    setFormData({
      ...formData,
      compliance_standards: [...(formData.compliance_standards || []), ''],
    });
  };

  const handleRemoveStandard = (index: number) => {
    setFormData({
      ...formData,
      compliance_standards: formData.compliance_standards?.filter((_, i) => i !== index) || [],
    });
  };

  const handleUpdateStandard = (index: number, value: string) => {
    const updated = [...(formData.compliance_standards || [])];
    updated[index] = value;
    setFormData({ ...formData, compliance_standards: updated });
  };

  const handleAddTestResult = () => {
    setFormData({
      ...formData,
      testing_results: [
        ...(Array.isArray(formData.testing_results) ? formData.testing_results : []),
        { test: '', result: '' },
      ],
    });
  };

  const handleRemoveTestResult = (index: number) => {
    const results = Array.isArray(formData.testing_results) ? formData.testing_results : [];
    setFormData({
      ...formData,
      testing_results: results.filter((_, i) => i !== index),
    });
  };

  const handleUpdateTestResult = (index: number, field: 'test' | 'result', value: string) => {
    const results = Array.isArray(formData.testing_results) ? [...formData.testing_results] : [];
    results[index] = { ...results[index], [field]: value };
    setFormData({ ...formData, testing_results: results });
  };

  const handleSubmit = async () => {
    if (!formData.certificate_number || !formData.location || !formData.description) {
      toast.error('Please fill in required fields');
      return;
    }

    await onSubmit(formData);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const isSafetyCertificate = documentType === 'electrical_safety_certificate';

  return (
    <div className="space-y-6 py-4 max-h-[80vh] overflow-y-auto">
      {/* Certificate Information */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Certificate Information</h3>
        
        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Project *</Label>
          <Select
            value={projectId || ''}
            disabled={!!projectId}
            onValueChange={() => {}}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Certificate Number *</Label>
            <Input
              value={formData.certificate_number}
              onChange={(e) => setFormData({ ...formData, certificate_number: e.target.value })}
              className="mt-2"
              placeholder="Certificate number"
            />
          </div>

          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Issue Date *</Label>
            <Input
              type="date"
              value={formData.issue_date}
              onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
              className="mt-2"
            />
          </div>
        </div>

        {isSafetyCertificate && (
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Expiry Date</Label>
            <Input
              type="date"
              value={(formData as any).expiry_date || ''}
              onChange={(e) => setFormData({ ...formData, ...(e.target.value ? { expiry_date: e.target.value } : {}) } as any)}
              className="mt-2"
            />
          </div>
        )}

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Location *</Label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="mt-2"
            placeholder="Installation location"
          />
        </div>

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Description *</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-2"
            rows={3}
            placeholder="Describe the installation..."
          />
        </div>

        {formData.installation_date !== undefined && (
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Installation Date</Label>
            <Input
              type="date"
              value={formData.installation_date || ''}
              onChange={(e) => setFormData({ ...formData, installation_date: e.target.value || undefined })}
              className="mt-2"
            />
          </div>
        )}
      </div>

      {/* Testing Results */}
      {!isSafetyCertificate && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Testing Results</h3>
            <Button type="button" variant="outline" size="sm" onClick={handleAddTestResult}>
              <Plus className="w-4 h-4 mr-2" />
              Add Test
            </Button>
          </div>

          {Array.isArray(formData.testing_results) && formData.testing_results.length > 0 ? (
            <div className="space-y-3">
              {formData.testing_results.map((result, index) => (
                <Card key={index} className="p-4 border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium">Test #{index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTestResult(index)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Test</Label>
                      <Input
                        value={result.test}
                        onChange={(e) => handleUpdateTestResult(index, 'test', e.target.value)}
                        className="mt-2"
                        placeholder="Test name"
                      />
                    </div>
                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Result</Label>
                      <Input
                        value={result.result}
                        onChange={(e) => handleUpdateTestResult(index, 'result', e.target.value)}
                        className="mt-2"
                        placeholder="Test result"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No test results added. Click "Add Test" to add one.</p>
          )}
        </div>
      )}

      {/* Safety Checks (for safety certificate) */}
      {isSafetyCertificate && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Safety Checks</h3>
          <p className="text-sm text-muted-foreground">Safety checks will be added in the document data structure.</p>
        </div>
      )}

      {/* Compliance Standards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Compliance Standards</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddStandard}>
            <Plus className="w-4 h-4 mr-2" />
            Add Standard
          </Button>
        </div>

        {formData.compliance_standards && formData.compliance_standards.length > 0 ? (
          <div className="space-y-2">
            {formData.compliance_standards.map((standard, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={standard}
                  onChange={(e) => handleUpdateStandard(index, e.target.value)}
                  placeholder="Standard code or name"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveStandard(index)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No standards added. Click "Add Standard" to add one.</p>
        )}
      </div>

      {/* Inspector Details */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Inspector Details</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Inspector Name</Label>
            <Input
              value={formData.inspector_name || ''}
              onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
              className="mt-2"
              placeholder="Inspector name"
            />
          </div>

          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">License Number</Label>
            <Input
              value={formData.inspector_license || ''}
              onChange={(e) => setFormData({ ...formData, inspector_license: e.target.value })}
              className="mt-2"
              placeholder="License number"
            />
          </div>
        </div>

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider">Inspection Date</Label>
          <Input
            type="date"
            value={formData.inspection_date || ''}
            onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value || undefined })}
            className="mt-2"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : `Save ${isSafetyCertificate ? 'Certificate' : 'Compliance'}`}
        </Button>
      </div>
    </div>
  );
}

