import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
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
import { ActivityType } from '@/types';
import { Plus, Edit, Trash2, Loader2, Wrench, CheckCircle, Search, MessageSquare, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const iconOptions = [
  { value: 'Wrench', label: 'Wrench', icon: Wrench },
  { value: 'CheckCircle', label: 'Check Circle', icon: CheckCircle },
  { value: 'Search', label: 'Search', icon: Search },
  { value: 'MessageSquare', label: 'Message', icon: MessageSquare },
  { value: 'Settings2', label: 'Settings', icon: Settings2 },
];

const colorOptions = [
  { value: 'bg-electric/20 border-electric text-electric', label: 'Electric Blue' },
  { value: 'bg-warning/20 border-warning text-warning', label: 'Warning Yellow' },
  { value: 'bg-voltage/20 border-voltage text-voltage', label: 'Voltage Green' },
  { value: 'bg-blue-400/20 border-blue-400 text-blue-400', label: 'Blue' },
  { value: 'bg-purple-400/20 border-purple-400 text-purple-400', label: 'Purple' },
  { value: 'bg-rose-400/20 border-rose-400 text-rose-400', label: 'Rose' },
  { value: 'bg-orange-400/20 border-orange-400 text-orange-400', label: 'Orange' },
];

export default function ActivityTypes() {
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('Wrench');
  const [formColor, setFormColor] = useState(colorOptions[0].value);
  const [formRate, setFormRate] = useState('');

  useEffect(() => {
    loadActivityTypes();
  }, []);

  const loadActivityTypes = async () => {
    setIsLoading(true);
    try {
      const data = await api.getActivityTypes();
      setActivityTypes(Array.isArray(data) ? data : []);
      setIsLoading(false);
    } catch (error: any) {
      console.error('Failed to load activity types:', error);
      // Only show toast if it's not a network error during development
      if (error?.message !== 'Failed to fetch') {
        toast.error('Failed to load activity types');
      }
      setActivityTypes([]);
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormIcon('Wrench');
    setFormColor(colorOptions[0].value);
    setFormRate('');
    setEditingType(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (type: ActivityType) => {
    setEditingType(type);
    setFormName(type.name);
    setFormIcon(type.icon);
    setFormColor(type.color);
    setFormRate(type.hourly_rate.toString());
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a name');
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        name: formName,
        icon: formIcon,
        color: formColor,
        hourly_rate: parseFloat(formRate) || 0
      };

      if (editingType) {
        await api.updateActivityType(editingType.id, data);
        toast.success('Activity type updated');
      } else {
        await api.createActivityType(data);
        toast.success('Activity type created');
      }
      setShowModal(false);
      resetForm();
      loadActivityTypes();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (type: ActivityType) => {
    try {
      await api.updateActivityType(type.id, { is_active: !type.is_active });
      toast.success(type.is_active ? 'Activity type deactivated' : 'Activity type activated');
      loadActivityTypes();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const handleDelete = async (type: ActivityType) => {
    if (type.usage_count && type.usage_count > 0) {
      toast.error(`Cannot delete - used in ${type.usage_count} timesheets`);
      return;
    }

    if (!confirm(`Are you sure you want to delete "${type.name}"?`)) return;

    try {
      await api.deleteActivityType(type.id);
      toast.success('Activity type deleted');
      loadActivityTypes();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const getIconComponent = (iconName: string) => {
    const iconDef = iconOptions.find(i => i.value === iconName);
    if (iconDef) {
      const Icon = iconDef.icon;
      return <Icon className="w-5 h-5" />;
    }
    return <Wrench className="w-5 h-5" />;
  };

  return (
    <>
      <Header title="Activity Types" subtitle="Configure timesheet activity categories" />

      <div className="p-8 max-w-[1200px] mx-auto">
        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {activityTypes.length} activity types
          </p>
          <Button 
            className="bg-electric text-background hover:bg-electric/90"
            onClick={handleOpenCreate}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Activity Type
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-electric" />
          </div>
        )}

        {/* Activity Types Grid */}
        {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activityTypes.map((type) => (
            <Card 
              key={type.id} 
              className={cn(
                "p-6 bg-card border-border transition-all",
                !type.is_active && "opacity-50"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-lg border-2 flex items-center justify-center",
                  type.color
                )}>
                  {getIconComponent(type.icon)}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(type)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(type)}
                    disabled={type.usage_count && type.usage_count > 0}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <h3 className="font-bold text-lg mb-2">{type.name}</h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Hourly Rate</span>
                  <span className="font-mono font-bold text-electric">
                    ${type.hourly_rate.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Usage Count</span>
                  <span className="font-mono">{type.usage_count || 0} timesheets</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active</span>
                <Switch
                  checked={type.is_active}
                  onCheckedChange={() => handleToggleActive(type)}
                />
              </div>
            </Card>
          ))}
        </div>
        )}

        {activityTypes.length === 0 && !isLoading && (
          <Card className="p-12 text-center bg-card border-border">
            <p className="text-muted-foreground">No activity types found. Create your first one.</p>
          </Card>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? 'Edit Activity Type' : 'New Activity Type'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="font-mono text-xs uppercase">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Installation"
                className="mt-2"
              />
            </div>

            <div>
              <Label className="font-mono text-xs uppercase">Icon</Label>
              <Select value={formIcon} onValueChange={setFormIcon}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="w-4 h-4" />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase">Color</Label>
              <Select value={formColor} onValueChange={setFormColor}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-4 h-4 rounded border-2", opt.value)} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase">Hourly Rate ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formRate}
                onChange={(e) => setFormRate(e.target.value)}
                placeholder="85.00"
                className="mt-2"
              />
            </div>

            {/* Preview */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg border-2 flex items-center justify-center",
                  formColor
                )}>
                  {getIconComponent(formIcon)}
                </div>
                <div>
                  <p className="font-medium">{formName || 'Activity Name'}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    ${parseFloat(formRate || '0').toFixed(2)}/hr
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-electric text-background hover:bg-electric/90"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingType ? 'Update' : 'Create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
