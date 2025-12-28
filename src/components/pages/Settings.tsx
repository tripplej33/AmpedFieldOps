import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, CheckCircle, Link2, Upload, Download, Loader2 } from 'lucide-react';
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
  
  // Local state for Xero credentials (not auto-saving)
  const [xeroCredentials, setXeroCredentials] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);

  useEffect(() => {
    loadSettings();

    // Check for Xero OAuth errors in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const xeroError = urlParams.get('xero_error');
    const xeroErrorMsg = urlParams.get('xero_error_msg');
    
    if (xeroError) {
      const errorMessages: Record<string, string> = {
        'no_code': 'No authorization code received from Xero',
        'credentials_missing': 'Xero credentials not configured',
        'token_exchange_failed': 'Failed to exchange authorization code for tokens',
        'unauthorized_client': 'Client ID or Secret is incorrect, or redirect URI does not match Xero app settings',
        'access_denied': 'Connection was cancelled'
      };
      
      const message = xeroErrorMsg || errorMessages[xeroError] || 'Xero connection failed';
      
      // Log error to console and show full message
      console.error('[Xero] Connection error:', {
        error: xeroError,
        message: xeroErrorMsg,
        settings: {
          clientId: settings.xero_client_id || 'NOT SET',
          redirectUri: settings.xero_redirect_uri || `${window.location.origin}/api/xero/callback`
        }
      });
      
      // Show full error message with details
      toast.error(message, {
        duration: 15000, // Longer duration for detailed messages
        description: (
          <div className="space-y-2 text-xs">
            {xeroError === 'unauthorized_client' && (
              <>
                <div className="font-semibold">Current Configuration:</div>
                <div>Client ID: {settings.xero_client_id || 'NOT SET'}</div>
                <div>Redirect URI: {settings.xero_redirect_uri || `${window.location.origin}/api/xero/callback`}</div>
                <div className="mt-2 text-warning">⚠️ These must match your Xero app settings exactly</div>
              </>
            )}
          </div>
        )
      });
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Listen for Xero OAuth popup messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'XERO_CONNECTED') {
        if (event.data.success) {
          toast.success('Successfully connected to Xero!');
          loadSettings();
        } else {
          toast.error('Failed to connect to Xero');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, costCentersData] = await Promise.all([
        api.getSettings(),
        api.getCostCenters()
      ]);
      setSettings(settingsData);
      setCostCenters(costCentersData);

      // Auto-update redirect URI if domain has changed
      const currentRedirectUri = `${window.location.origin}/api/xero/callback`;
      const savedRedirectUri = settingsData.xero_redirect_uri;
      
      if (savedRedirectUri && savedRedirectUri !== currentRedirectUri) {
        // Check if the saved URI is from a different domain
        try {
          const savedUrl = new URL(savedRedirectUri);
          const currentUrl = new URL(currentRedirectUri);
          
          if (savedUrl.origin !== currentUrl.origin) {
            // Domain has changed - automatically update
            console.log('[Xero] Domain changed, updating redirect URI:', {
              old: savedRedirectUri,
              new: currentRedirectUri
            });
            
            await api.updateSetting('xero_redirect_uri', currentRedirectUri, true);
            setSettings((prev: any) => ({ ...prev, xero_redirect_uri: currentRedirectUri }));
            
            toast.info('Redirect URI updated for new domain', {
              description: `Updated to ${currentRedirectUri}`,
              duration: 5000
            });
          }
        } catch (e) {
          // Invalid URL format, use current origin
          console.warn('[Xero] Invalid redirect URI format, updating:', e);
          await api.updateSetting('xero_redirect_uri', currentRedirectUri, true);
          setSettings((prev: any) => ({ ...prev, xero_redirect_uri: currentRedirectUri }));
        }
      } else if (!savedRedirectUri) {
        // No redirect URI saved yet, save the current one
        await api.updateSetting('xero_redirect_uri', currentRedirectUri, true);
        setSettings((prev: any) => ({ ...prev, xero_redirect_uri: currentRedirectUri }));
      }

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
    // Validate credentials are entered
    if (!settings.xero_client_id || !settings.xero_client_secret) {
      toast.error('Please enter your Xero Client ID and Client Secret first');
      return;
    }

    // Validate Client ID format (Xero Client IDs are typically 32 characters)
    if (settings.xero_client_id.length !== 32) {
      toast.warning('Client ID should be 32 characters. Please verify it matches your Xero app.');
    }

    try {
      // Always use the current origin for redirect URI (auto-updates on domain change)
      const redirectUri = `${window.location.origin}/api/xero/callback`;
      
      // Validate Client ID format before saving
      const clientId = settings.xero_client_id.trim();
      const clientSecret = settings.xero_client_secret.trim();
      
      // Check if Client ID looks like an email address
      if (clientId.includes('@')) {
        toast.error('Invalid Client ID: Email addresses cannot be used as Client IDs. Please enter your 32-character Xero Client ID from the Xero Developer Portal.');
        return;
      }
      
      if (clientId.length !== 32) {
        toast.error(`Invalid Client ID format. Xero Client IDs must be exactly 32 characters (you entered ${clientId.length}). Please check your Xero Developer Portal.`);
        return;
      }
      
      // Validate it's hexadecimal (Xero Client IDs are hex)
      if (!/^[0-9A-Fa-f]{32}$/.test(clientId)) {
        toast.warning('Client ID should contain only hexadecimal characters (0-9, A-F). Please verify it matches your Xero app.');
      }
      
      console.log('[Xero] Saving credentials:', {
        clientId: `${clientId.substring(0, 8)}...`,
        clientIdLength: clientId.length,
        hasClientSecret: !!clientSecret,
        redirectUri
      });
      
      // Credentials should already be saved, but ensure redirect URI is up to date
      if (settings.xero_redirect_uri !== redirectUri) {
        await api.updateSetting('xero_redirect_uri', redirectUri, true);
        setSettings((prev: any) => ({ ...prev, xero_redirect_uri: redirectUri }));
      }
      
      console.log('[Xero] Using saved credentials:', {
        clientId: `${clientId.substring(0, 8)}...`,
        redirectUri
      });
      
      // Small delay to ensure database write is committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now request the auth URL
      const response = await api.getXeroAuthUrl();
      if (response.url) {
        console.log('[Xero] Opening auth URL:', {
          redirectUri: response.redirectUri,
          clientIdPrefix: response.clientIdPrefix,
          verification: response.verification
        });
        
        // Show detailed info about what needs to match in Xero (with full client ID)
        if (response.redirectUri) {
          const fullClientId = response.clientId || settings.xero_client_id || 'NOT SET';
          console.log('[Xero] Connection attempt:', {
            clientId: fullClientId,
            redirectUri: response.redirectUri,
            clientIdFromResponse: response.clientId,
            clientIdFromSettings: settings.xero_client_id
          });
          
          toast.info(`Connecting to Xero...`, {
            duration: 10000,
            description: (
              <div className="space-y-1 text-xs">
                <div><strong>Client ID:</strong> {fullClientId}</div>
                <div><strong>Redirect URI:</strong> {response.redirectUri}</div>
                <div className="text-warning mt-1">⚠️ These must match your Xero app settings exactly</div>
              </div>
            )
          });
        }
        
        // Open popup window for Xero OAuth
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          response.url,
          'xero-auth',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popup) {
          toast.error('Popup blocked. Please allow popups for this site and try again.');
          return;
        }

        // Listen for the popup to close or redirect
        const checkPopup = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkPopup);
            // Reload settings to check if connection was successful
            loadSettings();
          }
        }, 500);
      } else if (!response.configured) {
        toast.error('Xero credentials not configured. Please save your credentials and try again.');
      } else {
        toast.error('Failed to generate Xero authorization URL');
      }
    } catch (error: any) {
      console.error('Xero connect error:', error);
      toast.error(error.message || 'Failed to connect to Xero', {
        description: error.details || 'Please check your credentials and try again'
      });
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

  const handlePullContacts = async () => {
    setIsSyncing(true);
    try {
      const result = await api.pullXeroContacts();
      toast.success(`Pulled contacts from Xero: ${result.results.created} created, ${result.results.updated} updated`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to pull contacts from Xero');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushAllContacts = async () => {
    setIsSyncing(true);
    try {
      const result = await api.pushAllClientsToXero();
      toast.success(`Pushed to Xero: ${result.results.created} clients created`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to push clients to Xero');
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

            <Separator />

            {/* Xero Credentials */}
            <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border">
              <h4 className="text-sm font-bold font-mono uppercase tracking-wider">Xero Credentials</h4>
              
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">
                  Client ID *
                </Label>
                <Input
                  value={xeroCredentials.clientId}
                  onChange={(e) => setXeroCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                  placeholder="Enter Xero Client ID (32 characters)"
                  className="mt-2 font-mono text-sm"
                />
                {xeroCredentials.clientId && xeroCredentials.clientId.length !== 32 && (
                  <p className="text-xs text-warning mt-1">
                    Client ID should be exactly 32 characters (currently {xeroCredentials.clientId.length})
                  </p>
                )}
              </div>

              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">
                  Client Secret *
                </Label>
                <Input
                  type="password"
                  value={xeroCredentials.clientSecret}
                  onChange={(e) => setXeroCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                  placeholder="Enter Xero Client Secret"
                  className="mt-2 font-mono text-sm"
                />
              </div>

              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">
                  Redirect URI
                </Label>
                <Input
                  value={xeroCredentials.redirectUri}
                  onChange={(e) => setXeroCredentials(prev => ({ ...prev, redirectUri: e.target.value }))}
                  placeholder={`${window.location.origin}/api/xero/callback`}
                  className="mt-2 font-mono text-sm"
                />
              </div>
              
              <Button
                onClick={handleSaveXeroCredentials}
                disabled={isSavingCredentials || !xeroCredentials.clientId || !xeroCredentials.clientSecret}
                className="w-full bg-electric text-background hover:bg-electric/90"
              >
                {isSavingCredentials ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Save Credentials
                  </>
                )}
              </Button>
              
              {(!xeroCredentials.clientId || !xeroCredentials.clientSecret) && (
                <p className="text-xs text-muted-foreground text-center">
                  Enter your credentials above and click "Save Credentials" before connecting
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Get your credentials from the <a href="https://developer.xero.com/myapps" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Xero Developer Portal</a>
              </p>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mt-3">
                <Label className="font-mono text-xs uppercase tracking-wider text-warning flex items-center gap-2">
                  <span>⚠️</span> Important: Redirect URI
                </Label>
                <p className="text-xs text-muted-foreground mt-2 mb-2">
                  In your Xero app settings, add this exact redirect URI:
                </p>
                <code className="text-xs bg-background px-2 py-1 rounded border border-border block font-mono break-all">
                  {window.location.origin}/api/xero/callback
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Go to <strong>Configuration → OAuth 2.0 redirect URIs</strong> in your Xero app
                </p>
              </div>
            </div>

            <Separator />

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

            {/* Contact Sync Options */}
            <Separator />
            
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider mb-3 block">Contact Sync</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Keep your Xero contacts and local clients in sync. Xero is the source of truth.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button 
                  variant="outline"
                  onClick={handlePullContacts}
                  disabled={isSyncing}
                >
                  <Download className={cn("w-4 h-4 mr-2")} />
                  Pull from Xero
                </Button>
                <Button 
                  variant="outline"
                  onClick={handlePushAllContacts}
                  disabled={isSyncing}
                >
                  <Upload className={cn("w-4 h-4 mr-2")} />
                  Push New to Xero
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button 
                className="bg-electric text-background hover:bg-electric/90"
                onClick={handleXeroSync}
                disabled={isSyncing}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync All'}
              </Button>
              <Button variant="outline" onClick={handleXeroDisconnect}>Disconnect</Button>
            </div>
          </div>
          ) : (
          <div>
            {/* Xero Credentials */}
            <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border mb-6">
              <h4 className="text-sm font-bold font-mono uppercase tracking-wider">Xero Credentials</h4>
              
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">
                  Client ID *
                </Label>
                <Input
                  value={settings.xero_client_id || ''}
                  onChange={(e) => handleSettingChange('xero_client_id', e.target.value)}
                  placeholder="Enter Xero Client ID"
                  className="mt-2 font-mono text-sm"
                />
              </div>

              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">
                  Client Secret *
                </Label>
                <Input
                  type="password"
                  value={settings.xero_client_secret || ''}
                  onChange={(e) => handleSettingChange('xero_client_secret', e.target.value)}
                  placeholder="Enter Xero Client Secret"
                  className="mt-2 font-mono text-sm"
                />
              </div>

              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">
                  Redirect URI
                </Label>
                <Input
                  value={settings.xero_redirect_uri || `${window.location.origin}/api/xero/callback`}
                  onChange={(e) => handleSettingChange('xero_redirect_uri', e.target.value)}
                  placeholder="https://your-domain.com/api/xero/callback"
                  className="mt-2 font-mono text-sm"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Get your credentials from the <a href="https://developer.xero.com/myapps" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Xero Developer Portal</a>
              </p>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mt-3">
                <Label className="font-mono text-xs uppercase tracking-wider text-warning flex items-center gap-2">
                  <span>⚠️</span> Important: Redirect URI
                </Label>
                <p className="text-xs text-muted-foreground mt-2 mb-2">
                  In your Xero app settings, add this exact redirect URI:
                </p>
                <code className="text-xs bg-background px-2 py-1 rounded border border-border block font-mono break-all">
                  {window.location.origin}/api/xero/callback
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Go to <strong>Configuration → OAuth 2.0 redirect URIs</strong> in your Xero app
                </p>
              </div>
            </div>

            <div className="text-center py-6">
              <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Xero account to sync invoices, quotes, and contacts
              </p>
              <Button 
                onClick={handleXeroConnect}
                className="bg-electric text-background hover:bg-electric/90"
                disabled={!settings.xero_client_id || !settings.xero_client_secret}
              >
                Connect to Xero
              </Button>
              {(!settings.xero_client_id || !settings.xero_client_secret) && (
                <p className="text-xs text-warning mt-2">
                  Please enter your Xero credentials above before connecting
                </p>
              )}
            </div>
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
