import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, CheckCircle, Link2, Upload, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { CostCenter } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { hasPermission } = useAuth();
  const [xeroStatus, setXeroStatus] = useState<any>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, costCentersData] = await Promise.all([
        api.getSettings(),
        api.getCostCenters()
      ]);
      setSettings(settingsData);
      setCostCenters(costCentersData);

      if (hasPermission('can_sync_xero')) {
        const xeroData = await api.getXeroStatus();
        setXeroStatus(xeroData);
      }
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleXeroConnect = async () => {
    try {
      const { url, configured } = await api.getXeroAuthUrl();
      if (configured && url) {
        window.location.href = url;
      } else {
        toast.error('Xero credentials not configured');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect');
    }
  };

  const handleXeroDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Xero?')) return;
    try {
      await api.disconnectXero();
      setXeroStatus({ connected: false, configured: xeroStatus?.configured });
      toast.success('Xero disconnected');
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    }
  };

  const handleXeroSync = async () => {
    setIsSyncing(true);
    try {
      await api.syncXero('all');
      toast.success('Sync completed');
      loadSettings();
    } catch (error: any) {
      toast.error(error.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await api.uploadCompanyLogo(file);
      setSettings((prev: any) => ({ ...prev, company_logo: result.logo_url }));
      toast.success('Logo updated');
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSettingChange = async (key: string, value: any) => {
    try {
      await api.updateSetting(key, value, true);
      setSettings((prev: any) => ({ ...prev, [key]: value }));
    } catch (error: any) {
      toast.error('Failed to update setting');
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Settings" subtitle="Configure system preferences and integrations" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Settings" subtitle="Configure system preferences and integrations" />

      <div className="p-8 max-w-[1000px] mx-auto space-y-6">
        {/* Company Branding */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-4">Company Branding</h3>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg bg-muted/30 border-2 border-dashed border-muted flex items-center justify-center overflow-hidden">
                {settings.company_logo ? (
                  <img src={settings.company_logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('logo-upload')?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload Logo'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG. Max 5MB.</p>
              </div>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Company Name</Label>
              <Input
                value={settings.company_name || 'AmpedFieldOps'}
                onChange={(e) => handleSettingChange('company_name', e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Timezone</Label>
              <select
                value={settings.timezone || 'America/New_York'}
                onChange={(e) => handleSettingChange('timezone', e.target.value)}
                className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="Pacific/Auckland">Pacific/Auckland (NZST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                <option value="Australia/Perth">Australia/Perth (AWST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Chicago">America/Chicago (CST)</option>
                <option value="America/Denver">America/Denver (MST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Xero Integration */}
        {hasPermission('can_sync_xero') && (
        <Card className="p-6 bg-card border-border">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold mb-1">Xero Integration</h3>
              <p className="text-sm text-muted-foreground">Connect and manage your Xero accounting integration</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                xeroStatus?.connected ? "bg-voltage animate-pulse" : "bg-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-mono",
                xeroStatus?.connected ? "text-voltage" : "text-muted-foreground"
              )}>
                {xeroStatus?.connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
          </div>

          {xeroStatus?.connected ? (
          <div className="space-y-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                Organization
              </Label>
              <Input
                value={xeroStatus?.tenant_name || 'Connected Organization'}
                readOnly
                className="mt-2 bg-muted/50 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-mono text-muted-foreground mb-1">Last Sync</p>
                <p className="text-sm font-mono text-foreground">
                  {xeroStatus?.last_sync 
                    ? new Date(xeroStatus.last_sync).toLocaleString() 
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-sm font-mono text-muted-foreground mb-1">Status</p>
                <p className="text-sm font-mono text-voltage">Active</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="font-mono text-xs uppercase tracking-wider">Auto-sync</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically sync completed projects to Xero
                </p>
              </div>
              <Switch 
                checked={settings.xero_auto_sync === 'true'}
                onCheckedChange={(checked) => handleSettingChange('xero_auto_sync', checked.toString())}
              />
            </div>

            <div className="flex gap-3">
              <Button 
                className="bg-electric text-background hover:bg-electric/90"
                onClick={handleXeroSync}
                disabled={isSyncing}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
              <Button variant="outline" onClick={handleXeroDisconnect}>Disconnect</Button>
            </div>
          </div>
          ) : (
          <div className="text-center py-6">
            <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Connect your Xero account to sync invoices, quotes, and contacts
            </p>
            <Button 
              onClick={handleXeroConnect}
              className="bg-electric text-background hover:bg-electric/90"
              disabled={!xeroStatus?.configured}
            >
              Connect to Xero
            </Button>
            {!xeroStatus?.configured && (
              <p className="text-xs text-warning mt-2">
                Xero credentials not configured. Add XERO_CLIENT_ID and XERO_CLIENT_SECRET to environment.
              </p>
            )}
          </div>
          )}
        </Card>
        )}

        {/* Notification Settings */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-4">Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Budget Alerts</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Notify when projects exceed 80% of budget
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Timesheet Reminders</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Daily reminder for technicians to log hours
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Project Status Changes</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Notify when project status is updated
                </p>
              </div>
              <Switch />
            </div>
          </div>
        </Card>

        {/* Cost Centers */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Cost Centers</h3>
            <span className="text-sm text-muted-foreground">{costCenters.length} configured</span>
          </div>

          <div className="space-y-2">
            {costCenters.slice(0, 5).map((cc) => (
              <div
                key={cc.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className={cn(
                    "w-4 h-4",
                    cc.is_active ? "text-voltage" : "text-muted-foreground"
                  )} />
                  <div>
                    <span className="font-mono text-sm text-foreground">{cc.code}</span>
                    <span className="text-sm text-muted-foreground ml-2">- {cc.name}</span>
                  </div>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  ${cc.budget?.toLocaleString() || 0}
                </span>
              </div>
            ))}
            {costCenters.length > 5 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                +{costCenters.length - 5} more
              </p>
            )}
          </div>
        </Card>

        {/* Notification Settings */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-4">Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Budget Alerts</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Notify when projects exceed 80% of budget
                </p>
              </div>
              <Switch 
                checked={settings.budget_alerts !== 'false'}
                onCheckedChange={(checked) => handleSettingChange('budget_alerts', checked.toString())}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Timesheet Reminders</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Daily reminder for technicians to log hours
                </p>
              </div>
              <Switch 
                checked={settings.timesheet_reminders !== 'false'}
                onCheckedChange={(checked) => handleSettingChange('timesheet_reminders', checked.toString())}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">Project Status Changes</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Notify when project status is updated
                </p>
              </div>
              <Switch 
                checked={settings.status_notifications === 'true'}
                onCheckedChange={(checked) => handleSettingChange('status_notifications', checked.toString())}
              />
            </div>
          </div>
        </Card>

        {/* System Info */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-4">System Information</h3>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground font-mono mb-1">Version</p>
              <p className="font-mono text-foreground">v2.0.0</p>
            </div>
            <div>
              <p className="text-muted-foreground font-mono mb-1">Environment</p>
              <p className="font-mono text-foreground">
                {import.meta.env.MODE === 'production' ? 'Production' : 'Development'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground font-mono mb-1">Database</p>
              <p className="font-mono text-voltage">Online</p>
            </div>
            <div>
              <p className="text-muted-foreground font-mono mb-1">Timezone</p>
              <p className="font-mono text-foreground">{settings.timezone || 'America/New_York'}</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
