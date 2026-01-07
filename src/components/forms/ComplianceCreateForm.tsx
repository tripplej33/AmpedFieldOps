import { useState, useEffect } from 'react';
import { Project, ComplianceData, SafetyCertificateData } from '@/types';
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
  initialData?: Partial<ComplianceData | SafetyCertificateData>;
  onSubmit: (data: ComplianceData | SafetyCertificateData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  documentType?: 'electrical_compliance' | 'electrical_safety_certificate';
}

export function ComplianceCreateForm({ 
  projectId, 
  costCenterId,
  initialData,
  onSubmit, 
  onCancel, 
  isSubmitting = false,
  documentType = 'electrical_compliance'
}: ComplianceCreateFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const isSafetyCertificate = documentType === 'electrical_safety_certificate';
  
  const [formData, setFormData] = useState<ComplianceData | SafetyCertificateData>(
    isSafetyCertificate
      ? {
          certificate_number: (initialData as SafetyCertificateData)?.certificate_number || '',
          issue_date: (initialData as SafetyCertificateData)?.issue_date || new Date().toISOString().split('T')[0],
          expiry_date: (initialData as SafetyCertificateData)?.expiry_date || '',
          location: (initialData as SafetyCertificateData)?.location || initialData?.location || '',
          description: (initialData as SafetyCertificateData)?.description || initialData?.description || '',
          safety_checks: (initialData as SafetyCertificateData)?.safety_checks || [],
          inspector_name: initialData?.inspector_name || '',
          inspector_license: initialData?.inspector_license || '',
          inspection_date: initialData?.inspection_date || '',
          inspector_signature_date: initialData?.inspector_signature_date || '',
        }
      : {
          certificate_number: (initialData as ComplianceData)?.certificate_number || '',
          issue_date: (initialData as ComplianceData)?.issue_date || new Date().toISOString().split('T')[0],
          location: (initialData as ComplianceData)?.location || initialData?.location || '',
          description: (initialData as ComplianceData)?.description || initialData?.description || '',
          installation_date: (initialData as ComplianceData)?.installation_date || '',
          testing_results: (initialData as ComplianceData)?.testing_results || [],
          compliance_standards: (initialData as ComplianceData)?.compliance_standards || [],
          inspector_name: initialData?.inspector_name || '',
          inspector_license: initialData?.inspector_license || '',
          inspection_date: initialData?.inspection_date || '',
          inspector_signature_date: initialData?.inspector_signature_date || '',
        }
  );

  useEffect(() => {
    loadData();
  }, []);

  // Update form data when initialData changes (for autofill)
  useEffect(() => {
    if (initialData) {
      if (isSafetyCertificate) {
        setFormData(prev => ({
          ...prev,
          ...(initialData as Partial<SafetyCertificateData>),
          location: (initialData as SafetyCertificateData)?.location || initialData?.location || prev.location,
          description: (initialData as SafetyCertificateData)?.description || initialData?.description || prev.description,
        } as SafetyCertificateData));
      } else {
        setFormData(prev => ({
          ...prev,
          ...(initialData as Partial<ComplianceData>),
          location: (initialData as ComplianceData)?.location || initialData?.location || prev.location,
          description: (initialData as ComplianceData)?.description || initialData?.description || prev.description,
        } as ComplianceData));
      }
    }
  }, [initialData, isSafetyCertificate]);

  const loadData = async () => {
    try {
      const projectsResponse = await api.getProjects({ limit: 100 });
      const projectsData = projectsResponse.data || (Array.isArray(projectsResponse) ? projectsResponse : []);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (error: any) {
      toast.error('Failed to load form data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStandard = () => {
    if (!isSafetyCertificate) {
      const complianceData = formData as ComplianceData;
      setFormData({
        ...complianceData,
        compliance_standards: [...(complianceData.compliance_standards || []), ''],
      } as ComplianceData);
    }
  };

  const handleRemoveStandard = (index: number) => {
    if (!isSafetyCertificate) {
      const complianceData = formData as ComplianceData;
      setFormData({
        ...complianceData,
        compliance_standards: complianceData.compliance_standards?.filter((_: string, i: number) => i !== index) || [],
      } as ComplianceData);
    }
  };

  const handleUpdateStandard = (index: number, value: string) => {
    if (!isSafetyCertificate) {
      const complianceData = formData as ComplianceData;
      const updated = [...(complianceData.compliance_standards || [])];
      updated[index] = value;
      setFormData({ ...complianceData, compliance_standards: updated } as ComplianceData);
    }
  };

  const handleAddTestResult = () => {
    if (!isSafetyCertificate) {
      const complianceData = formData as ComplianceData;
      setFormData({
        ...complianceData,
        testing_results: [
          ...(Array.isArray(complianceData.testing_results) ? complianceData.testing_results : []),
          { test: '', result: '' },
        ],
      } as ComplianceData);
    }
  };

  const handleRemoveTestResult = (index: number) => {
    if (!isSafetyCertificate) {
      const complianceData = formData as ComplianceData;
      const results = Array.isArray(complianceData.testing_results) ? complianceData.testing_results : [];
      setFormData({
        ...complianceData,
        testing_results: results.filter((_: any, i: number) => i !== index),
      } as ComplianceData);
    }
  };

  const handleUpdateTestResult = (index: number, field: 'test' | 'result', value: string) => {
    if (!isSafetyCertificate) {
      const complianceData = formData as ComplianceData;
      const results = Array.isArray(complianceData.testing_results) ? [...complianceData.testing_results] : [];
      results[index] = { ...results[index], [field]: value };
      setFormData({ ...complianceData, testing_results: results } as ComplianceData);
    }
  };

  const handleSubmit = async () => {
    if (!formData.certificate_number || !formData.location || !formData.description) {
      toast.error('Please fill in required fields');
      return;
    }

    await onSubmit(formData as ComplianceData | SafetyCertificateData);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

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

        {!isSafetyCertificate && (formData as ComplianceData).installation_date !== undefined && (
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Installation Date</Label>
            <Input
              type="date"
              value={(formData as ComplianceData).installation_date || ''}
              onChange={(e) => {
                const complianceData = formData as ComplianceData;
                setFormData({ ...complianceData, installation_date: e.target.value || undefined } as ComplianceData);
              }}
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

          {Array.isArray((formData as ComplianceData).testing_results) && (formData as ComplianceData).testing_results!.length > 0 ? (
            <div className="space-y-3">
              {(formData as ComplianceData).testing_results!.map((result: { test: string; result: string }, index: number) => (
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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Safety Checks</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              const checks = (formData as SafetyCertificateData).safety_checks || [];
              setFormData({
                ...formData,
                safety_checks: [...checks, { check: '', status: 'pending', notes: '' }]
              } as SafetyCertificateData);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Check
            </Button>
          </div>

          {Array.isArray((formData as SafetyCertificateData).safety_checks) && (formData as SafetyCertificateData).safety_checks!.length > 0 ? (
            <div className="space-y-3">
              {(formData as SafetyCertificateData).safety_checks!.map((check, index) => (
                <Card key={index} className="p-4 border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium">Check #{index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const checks = (formData as SafetyCertificateData).safety_checks || [];
                        setFormData({
                          ...formData,
                          safety_checks: checks.filter((_, i) => i !== index)
                        } as SafetyCertificateData);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Check Description</Label>
                      <Input
                        value={check.check}
                        onChange={(e) => {
                          const checks = [...((formData as SafetyCertificateData).safety_checks || [])];
                          checks[index] = { ...checks[index], check: e.target.value };
                          setFormData({ ...formData, safety_checks: checks } as SafetyCertificateData);
                        }}
                        className="mt-2"
                        placeholder="Safety check description"
                      />
                    </div>
                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Status</Label>
                      <Select
                        value={check.status}
                        onValueChange={(value) => {
                          const checks = [...((formData as SafetyCertificateData).safety_checks || [])];
                          checks[index] = { ...checks[index], status: value };
                          setFormData({ ...formData, safety_checks: checks } as SafetyCertificateData);
                        }}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="passed">Passed</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="n/a">N/A</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="font-mono text-xs uppercase tracking-wider">Notes</Label>
                      <Textarea
                        value={check.notes || ''}
                        onChange={(e) => {
                          const checks = [...((formData as SafetyCertificateData).safety_checks || [])];
                          checks[index] = { ...checks[index], notes: e.target.value };
                          setFormData({ ...formData, safety_checks: checks } as SafetyCertificateData);
                        }}
                        className="mt-2"
                        rows={2}
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No safety checks added. Click "Add Check" to add one.</p>
          )}
        </div>
      )}

      {/* Compliance Standards */}
      {!isSafetyCertificate && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Compliance Standards</h3>
            <Button type="button" variant="outline" size="sm" onClick={handleAddStandard}>
              <Plus className="w-4 h-4 mr-2" />
              Add Standard
            </Button>
          </div>

          {(formData as ComplianceData).compliance_standards && (formData as ComplianceData).compliance_standards!.length > 0 ? (
            <div className="space-y-2">
              {(formData as ComplianceData).compliance_standards!.map((standard: string, index: number) => (
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
      )}

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

