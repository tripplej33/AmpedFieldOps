import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { RefreshCw, CheckCircle, Link2, Upload, Download, Loader2, Mail, Send, Shield, Plus, Trash2, Edit, X, Settings as SettingsIcon, Plug, Lock, X as XIcon, Cloud } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updateFavicon } from '@/lib/favicon';

export default function Settings() {
  const { hasPermission, user } = useAuth();
  const [xeroStatus, setXeroStatus] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [isConnectingGoogleDrive, setIsConnectingGoogleDrive] = useState(false);
  
  // Local state for Google Drive credentials (not auto-saving)
  const [googleDriveCredentials, setGoogleDriveCredentials] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  const [savedGoogleDriveCredentials, setSavedGoogleDriveCredentials] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  const [isSavingGoogleDriveCredentials, setIsSavingGoogleDriveCredentials] = useState(false);
  
  // Check if Google Drive credentials have been modified
  const googleDriveCredentialsChanged = 
    googleDriveCredentials.clientId !== savedGoogleDriveCredentials.clientId ||
    googleDriveCredentials.clientSecret !== savedGoogleDriveCredentials.clientSecret ||
    googleDriveCredentials.redirectUri !== savedGoogleDriveCredentials.redirectUri;
  
  // Show save button if: not connected OR credentials have changed
  const showGoogleDriveSaveButton = !googleDriveConnected || googleDriveCredentialsChanged;
  
  // Role-based permissions management
  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [allPermissions, setAllPermissions] = useState<Array<{ key: string; label: string; description: string }>>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState(false);
  
  // Local state for Xero credentials (not auto-saving)
  const [xeroCredentials, setXeroCredentials] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  const [savedXeroCredentials, setSavedXeroCredentials] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  
  // Check if credentials have been modified
  const credentialsChanged = 
    xeroCredentials.clientId !== savedXeroCredentials.clientId ||
    xeroCredentials.clientSecret !== savedXeroCredentials.clientSecret ||
    xeroCredentials.redirectUri !== savedXeroCredentials.redirectUri;
  
  // Show save button if: not connected OR credentials have changed
  const showSaveButton = !xeroStatus?.connected || credentialsChanged;

  useEffect(() => {
    loadSettings();
    
    // Check for Google Drive OAuth callback parameters
    const params = new URLSearchParams(window.location.search);
    const googleDriveConnected = params.get('google_drive_connected');
    const googleDriveError = params.get('google_drive_error');
    
    if (googleDriveConnected === 'true') {
      toast.success('Google Drive connected successfully');
      setGoogleDriveConnected(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
    } else if (googleDriveError) {
      toast.error(`Google Drive connection failed: ${decodeURIComponent(googleDriveError)}`);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
    }
    
    if (user?.role === 'admin') {
      loadRolePermissions();
    }

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
      
      // Parse the error message (may contain newlines from backend)
      const errorLines = xeroErrorMsg ? xeroErrorMsg.split('\n').filter(line => line.trim()) : [message];
      
      // Show full error message with details
      toast.error(message, {
        duration: 20000, // Even longer for detailed errors
        description: (
          <div className="space-y-2 text-xs">
            {errorLines.map((line, idx) => (
              <div key={idx} className={idx === 0 ? 'font-semibold' : ''}>
                {line}
              </div>
            ))}
            {urlParams.get('client_id') && (
              <div className="mt-2 pt-2 border-t border-border">
                <div><strong>Client ID used:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">{urlParams.get('client_id')}</code></div>
              </div>
            )}
            {urlParams.get('redirect_uri') && (
              <div>
                <div><strong>Redirect URI used:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">{urlParams.get('redirect_uri')}</code></div>
              </div>
            )}
            {(xeroError === 'token_exchange_failed' || xeroError === 'unauthorized_client' || xeroError === 'invalid_client_id') && (
              <div className="mt-2 pt-2 border-t border-border">
                <a 
                  href="https://developer.xero.com/myapps" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-electric hover:underline"
                >
                  → Verify your Xero app settings
                </a>
              </div>
            )}
          </div>
        )
      });
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Check if we're returning from a successful Xero connection
    if (urlParams.get('xero_connected') === 'true') {
      toast.success('Successfully connected to Xero!');
      loadSettings();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  
  // Reload settings when Xero status changes (e.g., after disconnect)
  useEffect(() => {
    if (xeroStatus && !xeroStatus.connected && savedXeroCredentials.clientId) {
      // Connection was lost, show save button again
      console.log('[Xero] Connection lost, save button will be shown');
    }
  }, [xeroStatus?.connected]);

  const loadSettings = async () => {
    try {
      const settingsData = await api.getSettings();
      setSettings(settingsData);

      // Update favicon if available
      if (settingsData.company_favicon) {
        updateFavicon(settingsData.company_favicon);
      }

      // Always use current origin for redirect URI (never localhost in production)
      const currentRedirectUri = `${window.location.origin}/api/xero/callback`;
      const savedRedirectUri = settingsData.xero_redirect_uri;
      
      // Initialize Xero credentials from saved settings, but use current origin if saved URI is localhost
      let initialRedirectUri = savedRedirectUri || currentRedirectUri;
      if (initialRedirectUri.includes('localhost') && !window.location.hostname.includes('localhost')) {
        // If saved URI is localhost but we're on production, use current origin
        initialRedirectUri = currentRedirectUri;
        console.warn('[Xero] Saved redirect URI is localhost but we\'re on production. Using current origin.');
        // Update in database
        await api.updateSetting('xero_redirect_uri', currentRedirectUri, true);
        setSettings((prev: any) => ({ ...prev, xero_redirect_uri: currentRedirectUri }));
        toast.info('Redirect URI updated to match current domain', {
          description: `Updated from localhost to ${currentRedirectUri}`,
          duration: 5000
        });
      } else if (savedRedirectUri && savedRedirectUri !== currentRedirectUri) {
        // Check if the saved URI is from a different domain (but not localhost)
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
      
      setXeroCredentials({
        clientId: settingsData.xero_client_id || '',
        clientSecret: settingsData.xero_client_secret || '',
        redirectUri: initialRedirectUri
      });

      if (hasPermission('can_sync_xero')) {
        const xeroData = await api.getXeroStatus();
        setXeroStatus(xeroData);
      }

      // Load Google Drive status and credentials
      if (hasPermission('can_manage_users')) {
        try {
          const driveStatus = await api.getGoogleDriveStatus();
          setGoogleDriveConnected(driveStatus.connected);
        } catch (error) {
          setGoogleDriveConnected(false);
        }
        
        // Load Google Drive credentials from settings
        // Use same origin as frontend (API is proxied through Nginx)
        const googleDriveRedirectUri = settingsData.google_drive_redirect_uri || 
          `${window.location.origin}/api/backups/google-drive/callback`;
        
        setGoogleDriveCredentials({
          clientId: settingsData.google_drive_client_id || '',
          clientSecret: settingsData.google_drive_client_secret || '',
          redirectUri: googleDriveRedirectUri
        });
        
        setSavedGoogleDriveCredentials({
          clientId: settingsData.google_drive_client_id || '',
          clientSecret: settingsData.google_drive_client_secret || '',
          redirectUri: googleDriveRedirectUri
        });
      }
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleXeroConnect = async () => {
    // Check if credentials are saved in database
    if (!settings.xero_client_id || !settings.xero_client_secret) {
      toast.error('Please save your Xero credentials first using the "Save Credentials" button above.');
      return;
    }

    // Validate Client ID format (Xero Client IDs are typically 32 characters)
    if (settings.xero_client_id.length !== 32) {
      toast.warning('Client ID should be 32 characters. Please verify it matches your Xero app.');
    }

    try {
      // Always use current origin for redirect URI (never localhost in production)
      const currentRedirectUri = `${window.location.origin}/api/xero/callback`;
      const savedRedirectUri = settings.xero_redirect_uri;
      
      // Use current origin if saved URI is localhost but we're on production
      let redirectUri = savedRedirectUri || currentRedirectUri;
      if (redirectUri.includes('localhost') && !window.location.hostname.includes('localhost')) {
        redirectUri = currentRedirectUri;
        console.warn('[Xero] Saved redirect URI is localhost but we\'re on production. Updating to current origin.');
        // Update in database
        await api.updateSetting('xero_redirect_uri', redirectUri, true);
        setSettings((prev: any) => ({ ...prev, xero_redirect_uri: redirectUri }));
        toast.info('Redirect URI updated to match current domain', {
          description: `Updated to ${redirectUri}`,
          duration: 5000
        });
      }
      
      // Use saved credentials from database
      const clientId = settings.xero_client_id.trim();
      const clientSecret = settings.xero_client_secret.trim();
      
      console.log('[Xero] Connecting with credentials:', {
        clientId: `${clientId.substring(0, 8)}...`,
        redirectUri
      });
      
      // Small delay to ensure database write is committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now request the auth URL
      const response = await api.getXeroAuthUrl();
      if (response.url) {
        console.log('[Xero] Opening auth URL in popup:', {
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
          
          toast.info(`Opening Xero connection in popup...`, {
            duration: 5000,
            description: (
              <div className="space-y-1 text-xs">
                <div><strong>Client ID:</strong> {fullClientId}</div>
                <div><strong>Redirect URI:</strong> {response.redirectUri}</div>
                <div className="text-warning mt-1">⚠️ These must match your Xero app settings exactly</div>
              </div>
            )
          });
        }
        
        // Open Xero OAuth in a popup window
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const popup = window.open(
          response.url,
          'xero-oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );
        
        if (!popup) {
          toast.error('Popup blocked. Please allow popups for this site and try again.');
          return;
        }
        
        // Listen for messages from the popup
        const messageListener = (event: MessageEvent) => {
          // Verify origin for security
          if (event.origin !== window.location.origin) {
            return;
          }
          
          if (event.data.type === 'XERO_OAUTH_SUCCESS') {
            window.removeEventListener('message', messageListener);
            if (popup && !popup.closed) {
              popup.close();
            }
            toast.success('Successfully connected to Xero!');
            // Reload Xero status and refresh sidebar
            if (hasPermission('can_sync_xero')) {
              api.getXeroStatus().then((status) => {
                setXeroStatus(status);
                // Trigger sidebar refresh by dispatching custom event
                window.dispatchEvent(new CustomEvent('xero-status-updated'));
              }).catch(console.error);
            }
            loadSettings();
          } else if (event.data.type === 'XERO_OAUTH_ERROR') {
            window.removeEventListener('message', messageListener);
            if (popup && !popup.closed) {
              popup.close();
            }
            toast.error(event.data.message || 'Failed to connect to Xero');
          }
        };
        
        window.addEventListener('message', messageListener);
        
        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
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

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFavicon(true);
    try {
      const result = await api.uploadFavicon(file);
      setSettings((prev: any) => ({ ...prev, company_favicon: result.favicon_url }));
      toast.success('Favicon updated');
      
      // Update the favicon link in the document head
      updateFavicon(result.favicon_url);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setIsUploadingFavicon(false);
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

  const loadRolePermissions = async () => {
    setIsLoadingPermissions(true);
    try {
      const data = await api.getRolePermissions();
      setAllPermissions(data.permissions);
      setRolePermissions(data.rolePermissions);
    } catch (error: any) {
      toast.error('Failed to load role permissions');
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  const handleToggleRolePermission = (role: string, permissionKey: string) => {
    setRolePermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permissionKey]: !prev[role]?.[permissionKey]
      }
    }));
  };

  const handleSaveRolePermissions = async () => {
    setIsSavingRolePermissions(true);
    try {
      await api.updateRolePermissions(rolePermissions);
      toast.success('Role permissions updated successfully');
      loadRolePermissions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update role permissions');
    } finally {
      setIsSavingRolePermissions(false);
    }
  };

  const handleSaveXeroCredentials = async () => {
    const { clientId, clientSecret, redirectUri } = xeroCredentials;
    
    // Validate Client ID
    if (!clientId || !clientSecret) {
      toast.error('Please enter both Client ID and Client Secret');
      return;
    }
    
    if (clientId.includes('@')) {
      toast.error('Invalid Client ID: Email addresses cannot be used. Please enter your 32-character Xero Client ID.');
      return;
    }
    
    if (clientId.length !== 32) {
      toast.error(`Invalid Client ID format. Xero Client IDs must be exactly 32 characters (you entered ${clientId.length}).`);
      return;
    }
    
    if (!/^[0-9A-Fa-f]{32}$/.test(clientId)) {
      toast.warning('Client ID should contain only hexadecimal characters (0-9, A-F).');
    }
    
    setIsSavingCredentials(true);
    try {
      // Always use current origin for redirect URI (never use localhost in production)
      const currentRedirectUri = redirectUri.trim() || `${window.location.origin}/api/xero/callback`;
      
      // Warn if redirect URI contains localhost in production
      if (currentRedirectUri.includes('localhost') && !window.location.hostname.includes('localhost')) {
        toast.warning('Redirect URI contains localhost. Make sure this matches your Xero app settings.', {
          duration: 8000
        });
      }
      
      // Save all credentials at once
      await api.updateSetting('xero_client_id', clientId.trim(), true);
      await api.updateSetting('xero_client_secret', clientSecret.trim(), true);
      await api.updateSetting('xero_redirect_uri', currentRedirectUri, true);
      
      // Update settings state
      setSettings((prev: any) => ({
        ...prev,
        xero_client_id: clientId.trim(),
        xero_client_secret: clientSecret.trim(),
        xero_redirect_uri: currentRedirectUri
      }));
      
      // Update local credentials state to match
      const updatedCredentials = {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        redirectUri: currentRedirectUri
      };
      
      setXeroCredentials(updatedCredentials);
      // Update saved credentials to mark them as saved
      setSavedXeroCredentials(updatedCredentials);
      
      toast.success('Xero credentials saved successfully!', {
        description: xeroStatus?.connected 
          ? 'Credentials updated. Your Xero connection remains active.'
          : 'You can now connect to Xero using the "Connect to Xero" button.'
      });
      
      console.log('[Xero] Credentials saved:', {
        clientId: `${clientId.substring(0, 8)}...`,
        redirectUri: redirectUri || `${window.location.origin}/api/xero/callback`
      });
    } catch (error: any) {
      console.error('[Xero] Failed to save credentials:', error);
      toast.error(error.message || 'Failed to save credentials');
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const handleSaveGoogleDriveCredentials = async () => {
    const { clientId, clientSecret, redirectUri } = googleDriveCredentials;
    
    // Validate credentials
    if (!clientId || !clientSecret) {
      toast.error('Please enter both Client ID and Client Secret');
      return;
    }
    
    setIsSavingGoogleDriveCredentials(true);
    try {
      // Use provided redirect URI or default
      // Use same origin as frontend (API is proxied through Nginx)
      const currentRedirectUri = redirectUri.trim() || 
        `${window.location.origin}/api/backups/google-drive/callback`;
      
      // Warn if redirect URI contains localhost in production
      if (currentRedirectUri.includes('localhost') && !window.location.hostname.includes('localhost')) {
        toast.warning('Redirect URI contains localhost. Make sure this matches your Google OAuth app settings.', {
          duration: 8000
        });
      }
      
      // Save all credentials at once
      await api.updateSetting('google_drive_client_id', clientId.trim(), true);
      await api.updateSetting('google_drive_client_secret', clientSecret.trim(), true);
      await api.updateSetting('google_drive_redirect_uri', currentRedirectUri, true);
      
      // Update settings state
      setSettings((prev: any) => ({
        ...prev,
        google_drive_client_id: clientId.trim(),
        google_drive_client_secret: clientSecret.trim(),
        google_drive_redirect_uri: currentRedirectUri
      }));
      
      // Update local credentials state to match
      const updatedCredentials = {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        redirectUri: currentRedirectUri
      };
      
      setGoogleDriveCredentials(updatedCredentials);
      // Update saved credentials to mark them as saved
      setSavedGoogleDriveCredentials(updatedCredentials);
      
      toast.success('Google Drive credentials saved successfully!', {
        description: googleDriveConnected 
          ? 'Credentials updated. Your Google Drive connection remains active.'
          : 'You can now connect to Google Drive using the "Connect Google Drive" button.'
      });
      
      console.log('[Google Drive] Credentials saved:', {
        clientId: `${clientId.substring(0, 8)}...`,
        redirectUri: currentRedirectUri
      });
    } catch (error: any) {
      console.error('[Google Drive] Failed to save credentials:', error);
      toast.error(error.message || 'Failed to save credentials');
    } finally {
      setIsSavingGoogleDriveCredentials(false);
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

      <div className="p-8 max-w-[1000px] mx-auto">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className={cn(
            "grid w-full mb-6",
            user?.role === 'admin' ? "grid-cols-3" : "grid-cols-2"
          )}>
            <TabsTrigger value="general" className="flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Plug className="w-4 h-4" />
              Integrations
            </TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="permissions" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Permissions
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general" className="space-y-6">
        {/* Company Branding */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-4">Company Branding</h3>
          
          <div className="space-y-4">
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

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-muted/30 border-2 border-dashed border-muted flex items-center justify-center overflow-hidden">
                  {settings.company_favicon ? (
                    <img src={settings.company_favicon} alt="Favicon" className="w-full h-full object-contain" />
                  ) : (
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="favicon-upload"
                    accept=".ico,image/png,image/svg+xml,image/jpeg"
                    onChange={handleFaviconUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('favicon-upload')?.click()}
                    disabled={isUploadingFavicon}
                  >
                    {isUploadingFavicon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload Favicon'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">ICO, PNG, SVG. Max 2MB.</p>
                </div>
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
                value={settings.timezone || 'Pacific/Auckland'}
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
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
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
              
              {showSaveButton && (
                <>
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
                        {credentialsChanged ? 'Save Changes' : 'Save Credentials'}
                      </>
                    )}
                  </Button>
                  
                  {credentialsChanged && (
                    <p className="text-xs text-warning text-center">
                      ⚠️ Credentials have been modified. Click "Save Changes" to update.
                    </p>
                  )}
                </>
              )}
              
              {!showSaveButton && !credentialsChanged && (
                <p className="text-xs text-muted-foreground text-center">
                  ✓ Credentials saved and connected. Edit credentials above to make changes.
                </p>
              )}
              
              {(!xeroCredentials.clientId || !xeroCredentials.clientSecret) && (
                <p className="text-xs text-muted-foreground text-center">
                  Enter your credentials above and click "Save Credentials" before connecting
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Get your credentials from the <a href="https://developer.xero.com/myapps" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Xero Developer Portal</a>
              </p>
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
                {xeroCredentials.clientId && xeroCredentials.clientId.includes('@') && (
                  <p className="text-xs text-destructive mt-1">
                    ⚠️ Email addresses cannot be used as Client IDs
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
              
              <div className="space-y-3 pt-2">
                {showSaveButton && (
                  <Button
                    onClick={handleSaveXeroCredentials}
                    disabled={isSavingCredentials || !xeroCredentials.clientId || !xeroCredentials.clientSecret}
                    className="w-full bg-electric text-background hover:bg-electric/90 h-10"
                  >
                    {isSavingCredentials ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {credentialsChanged ? 'Save Changes' : 'Save Credentials'}
                      </>
                    )}
                  </Button>
                )}
                
                {credentialsChanged && showSaveButton && (
                  <p className="text-xs text-warning text-center py-1">
                    ⚠️ Credentials have been modified. Click "Save Changes" to update.
                  </p>
                )}
                
                {!showSaveButton && !credentialsChanged && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ✓ Credentials saved. Edit credentials above to make changes.
                  </p>
                )}
                
                {(!xeroCredentials.clientId || !xeroCredentials.clientSecret) && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    Enter your credentials above and click "Save Credentials" before connecting
                  </p>
                )}

                <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
                  Get your credentials from the <a href="https://developer.xero.com/myapps" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Xero Developer Portal</a>
                </p>
              </div>
            </div>

            <div className="text-center py-8 px-4">
              <div className="flex flex-col items-center space-y-4">
                <Link2 className="w-12 h-12 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Connect your Xero account
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Sync invoices, quotes, and contacts with your Xero accounting system
                  </p>
                </div>
                <Button 
                  onClick={handleXeroConnect}
                  className="bg-electric text-background hover:bg-electric/90 h-10 px-6 min-w-[180px]"
                  disabled={!settings.xero_client_id || !settings.xero_client_secret}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect to Xero
                </Button>
                {(!settings.xero_client_id || !settings.xero_client_secret) && (
                  <p className="text-xs text-warning">
                    Please save your credentials above first
                  </p>
                )}
              </div>
            </div>
          </div>
            )}
          </Card>
          )}

            {/* Google Drive Integration */}
            {hasPermission('can_manage_users') && (
            <Card className="p-6 bg-card border-border">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold mb-1">Google Drive Integration</h3>
              <p className="text-sm text-muted-foreground">Connect Google Drive for cloud backup storage</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                googleDriveConnected ? "bg-voltage animate-pulse" : "bg-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-mono",
                googleDriveConnected ? "text-voltage" : "text-muted-foreground"
              )}>
                {googleDriveConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
          </div>

          {googleDriveConnected ? (
            <div className="space-y-4">
              <div className="bg-muted/20 border border-border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Cloud className="w-5 h-5 text-voltage" />
                  <div>
                    <p className="text-sm font-medium">Google Drive Connected</p>
                    <p className="text-xs text-muted-foreground">Backups can be stored in Google Drive</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your backups will be automatically uploaded to Google Drive when you select "Google Drive" as the storage option.
                </p>
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  onClick={async () => {
                    try {
                      // Disconnect by clearing tokens (would need a disconnect endpoint)
                      toast.info('To disconnect, revoke access in your Google Account settings');
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to disconnect');
                    }
                  }}
                >
                  Manage Connection
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.open('/backups', '_blank')}
                >
                  <Cloud className="w-4 h-4 mr-2" />
                  Go to Backups
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Google Drive Credentials */}
              <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border">
                <h4 className="text-sm font-bold font-mono uppercase tracking-wider">Google Drive OAuth Credentials</h4>
                
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Client ID *
                  </Label>
                  <Input
                    value={googleDriveCredentials.clientId}
                    onChange={(e) => setGoogleDriveCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                    placeholder="Enter Google OAuth Client ID"
                    className="mt-2 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get this from Google Cloud Console → APIs & Services → Credentials
                  </p>
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Client Secret *
                  </Label>
                  <Input
                    type="password"
                    value={googleDriveCredentials.clientSecret}
                    onChange={(e) => setGoogleDriveCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                    placeholder="Enter Google OAuth Client Secret"
                    className="mt-2 font-mono text-sm"
                  />
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Redirect URI
                  </Label>
                  <Input
                    value={googleDriveCredentials.redirectUri}
                    onChange={(e) => setGoogleDriveCredentials(prev => ({ ...prev, redirectUri: e.target.value }))}
                    placeholder={`${window.location.origin}/api/backups/google-drive/callback`}
                    className="mt-2 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Must match exactly what's configured in Google Cloud Console
                  </p>
                </div>
                
                {showGoogleDriveSaveButton && (
                  <>
                    <Button
                      onClick={handleSaveGoogleDriveCredentials}
                      disabled={isSavingGoogleDriveCredentials || !googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret}
                      className="w-full bg-electric text-background hover:bg-electric/90"
                    >
                      {isSavingGoogleDriveCredentials ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {googleDriveCredentialsChanged ? 'Save Changes' : 'Save Credentials'}
                        </>
                      )}
                    </Button>
                    
                    {googleDriveCredentialsChanged && (
                      <p className="text-xs text-warning text-center">
                        ⚠️ Credentials have been modified. Click "Save Changes" to update.
                      </p>
                    )}
                  </>
                )}
                
                {!showGoogleDriveSaveButton && !googleDriveCredentialsChanged && (
                  <p className="text-xs text-muted-foreground text-center">
                    ✓ Credentials saved. Edit credentials above to make changes.
                  </p>
                )}
                
                {(!googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret) && (
                  <p className="text-xs text-muted-foreground text-center">
                    Enter your credentials above and click "Save Credentials" before connecting
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Get your credentials from the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Google Cloud Console</a>
                </p>
              </div>

              <Separator />

              <div className="bg-muted/20 border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your Google Drive account to enable cloud backup storage. Backups stored in Google Drive are accessible from anywhere and provide an additional layer of data protection.
                </p>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>• Backups are stored in a dedicated "AmpedFieldOps Backups" folder</p>
                  <p>• Only files created by this app will be accessible</p>
                  <p>• You can revoke access at any time from your Google Account</p>
                </div>
              </div>

              <Button 
                onClick={async () => {
                  if (!googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret) {
                    toast.error('Please save your Google Drive credentials first using the "Save Credentials" button above.');
                    return;
                  }

                  try {
                    setIsConnectingGoogleDrive(true);
                    const { url } = await api.getGoogleDriveAuthUrl();
                    const popup = window.open(url, 'google-drive-auth', 'width=600,height=700');
                    
                    // Poll for connection status
                    const checkInterval = setInterval(async () => {
                      try {
                        const status = await api.getGoogleDriveStatus();
                        if (status.connected) {
                          clearInterval(checkInterval);
                          setGoogleDriveConnected(true);
                          toast.success('Google Drive connected successfully');
                          if (popup) popup.close();
                        }
                      } catch (error) {
                        // Ignore errors during polling
                      }
                    }, 2000);

                    // Stop polling after 5 minutes
                    setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);

                    // Listen for popup close
                    const checkClosed = setInterval(() => {
                      if (popup?.closed) {
                        clearInterval(checkClosed);
                        clearInterval(checkInterval);
                        setIsConnectingGoogleDrive(false);
                      }
                    }, 500);
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to get Google Drive auth URL');
                  } finally {
                    setIsConnectingGoogleDrive(false);
                  }
                }}
                className="w-full bg-electric text-background hover:bg-electric/90"
                disabled={isConnectingGoogleDrive || !googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret}
              >
                {isConnectingGoogleDrive ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4 mr-2" />
                    Connect Google Drive
                  </>
                )}
              </Button>
              {(!googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret) && (
                <p className="text-xs text-warning text-center">
                  Please save your credentials above first
                </p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Google to authorize access. This app will only access files it creates.
              </p>
            </div>
          )}
          </Card>
          )}

            {/* Email Settings */}
            {user?.role === 'admin' && (
            <Card className="p-6 bg-card border-border">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold mb-1">Email Configuration</h3>
              <p className="text-sm text-muted-foreground">Configure SMTP settings for sending emails</p>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                SMTP Host *
              </Label>
              <Input
                value={settings.smtp_host || ''}
                onChange={(e) => handleSettingChange('smtp_host', e.target.value)}
                placeholder="smtp.gmail.com"
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                SMTP server hostname (e.g., smtp.gmail.com, smtp.sendgrid.net)
              </p>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                SMTP Port *
              </Label>
              <Input
                type="number"
                value={settings.smtp_port || ''}
                onChange={(e) => handleSettingChange('smtp_port', e.target.value)}
                placeholder="587"
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Common ports: 587 (TLS), 465 (SSL), 25 (legacy)
              </p>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                SMTP User *
              </Label>
              <Input
                value={settings.smtp_user || ''}
                onChange={(e) => handleSettingChange('smtp_user', e.target.value)}
                placeholder="your-email@gmail.com"
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Email address or username for SMTP authentication
              </p>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                SMTP Password *
              </Label>
              <Input
                type="password"
                value={settings.smtp_password || ''}
                onChange={(e) => handleSettingChange('smtp_password', e.target.value)}
                placeholder="Enter SMTP password or API key"
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Password or API key for SMTP authentication
              </p>
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                From Email Address
              </Label>
              <Input
                value={settings.smtp_from || ''}
                onChange={(e) => handleSettingChange('smtp_from', e.target.value)}
                placeholder="noreply@yourdomain.com"
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Email address to send from (defaults to SMTP User if not set)
              </p>
            </div>

            <Separator />

            <div className="bg-muted/20 border border-border rounded-lg p-4">
              <h4 className="text-sm font-bold font-mono uppercase tracking-wider mb-3">Test Email Configuration</h4>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="Enter email address to test"
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  onClick={async () => {
                    if (!testEmailAddress) {
                      toast.error('Please enter an email address');
                      return;
                    }
                    setIsSendingTestEmail(true);
                    try {
                      await api.sendTestEmail(testEmailAddress);
                      toast.success('Test email sent successfully!');
                      setTestEmailAddress('');
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to send test email');
                    } finally {
                      setIsSendingTestEmail(false);
                    }
                  }}
                  disabled={isSendingTestEmail || !testEmailAddress}
                  variant="outline"
                >
                  {isSendingTestEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test Email
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Send a test email to verify your SMTP configuration is working correctly
              </p>
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
              <Label className="font-mono text-xs uppercase tracking-wider text-warning flex items-center gap-2 mb-2">
                <span>⚠️</span> Important Notes
              </Label>
              <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                <li>• Settings are saved automatically when you change them</li>
                <li>• For Gmail, use an App Password (not your regular password)</li>
                <li>• For SendGrid, use "apikey" as the user and your API key as the password</li>
                <li>• Changes take effect immediately - no restart required</li>
                <li>• If not configured, password reset tokens will be logged to console only</li>
              </ul>
            </div>
          </div>
        </Card>
            )}
          </TabsContent>

          {user?.role === 'admin' && (
          <TabsContent value="permissions" className="space-y-6">
            {/* Role-Based Permissions */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-start justify-between mb-6">
              <div>
              <h3 className="text-lg font-bold mb-1">Role Permissions</h3>
              <p className="text-sm text-muted-foreground">Configure permissions for Admin, Manager, and User roles</p>
              </div>
            </div>

          {isLoadingPermissions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-electric" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Permissions Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Permission</th>
                      <th className="text-left p-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Description</th>
                      <th className="text-center p-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Admin</th>
                      <th className="text-center p-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Manager</th>
                      <th className="text-center p-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPermissions.map((perm) => (
                      <tr key={perm.key} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{perm.key}</code>
                        </td>
                        <td className="p-3 text-sm text-foreground">{perm.description || perm.label}</td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={rolePermissions.admin?.[perm.key] ?? false}
                            onCheckedChange={() => handleToggleRolePermission('admin', perm.key)}
                            disabled={isSavingRolePermissions}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={rolePermissions.manager?.[perm.key] ?? false}
                            onCheckedChange={() => handleToggleRolePermission('manager', perm.key)}
                            disabled={isSavingRolePermissions}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={rolePermissions.user?.[perm.key] ?? false}
                            onCheckedChange={() => handleToggleRolePermission('user', perm.key)}
                            disabled={isSavingRolePermissions}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {allPermissions.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No permissions found</p>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-border">
                <Button
                  onClick={handleSaveRolePermissions}
                  disabled={isSavingRolePermissions}
                  className="bg-electric text-background hover:bg-electric/90"
                >
                  {isSavingRolePermissions ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>
          </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
