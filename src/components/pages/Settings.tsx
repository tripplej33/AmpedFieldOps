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
  const [isDisconnectingXero, setIsDisconnectingXero] = useState(false);
  
  // Local state for Google Drive credentials (not auto-saving)
  const [googleDriveCredentials, setGoogleDriveCredentials] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  
  // Storage Settings state (new unified storage abstraction)
  const [storageSettings, setStorageSettings] = useState<{
    driver: 'local' | 's3' | 'google-drive';
    basePath?: string;
    s3Bucket?: string;
    s3Region?: string;
    s3AccessKeyId?: string;
    s3SecretAccessKey?: string;
    s3Endpoint?: string;
    googleDriveFolderId?: string;
    googleDriveConnected?: boolean;
  }>({
    driver: 'local',
    basePath: 'uploads',
  });
  const [storageConnectionStatus, setStorageConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingStorage, setIsSavingStorage] = useState(false);
  const [isTestingStorageConnection, setIsTestingStorageConnection] = useState(false);
  
  // Legacy cloud storage state (for Google Drive - keep separate)
  const [cloudStorageProvider, setCloudStorageProvider] = useState<'local' | 's3' | 'google-drive'>('local');
  const [s3Config, setS3Config] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    bucket: ''
  });
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState('');
  const [isSavingCloudStorage, setIsSavingCloudStorage] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
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
    
    // Listen for Xero OAuth popup callbacks via postMessage
    const handleMessage = (event: MessageEvent) => {
      // Verify origin matches current window
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'XERO_OAUTH_SUCCESS') {
        console.log('[Xero] OAuth success message received:', event.data);
        toast.success('Xero connected successfully!');
        // Refresh Xero status
        if (hasPermission('can_sync_xero')) {
          api.getXeroStatus().then((status) => {
            setXeroStatus(status);
            // Trigger sidebar refresh
            window.dispatchEvent(new CustomEvent('xero-status-updated'));
          }).catch(console.error);
        }
        // Clean up URL if there are any Xero params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('xero_connected') || urlParams.get('xero_error')) {
          window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
        }
      } else if (event.data?.type === 'XERO_OAUTH_ERROR') {
        console.error('[Xero] OAuth error message received:', event.data);
        const errorMsg = event.data.message || 'Xero connection failed';
        toast.error('Xero connection failed', {
          description: errorMsg
        });
      }
    };

    window.addEventListener('message', handleMessage);
    
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

    // Check for Xero OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const xeroConnected = urlParams.get('xero_connected');
    const xeroError = urlParams.get('xero_error');
    const xeroErrorMsg = urlParams.get('xero_error_msg');
    
    if (xeroConnected === 'true') {
      toast.success('Xero connected successfully');
      if (hasPermission('can_sync_xero')) {
        api.getXeroStatus().then((status) => {
          setXeroStatus(status);
          // Trigger sidebar refresh by dispatching custom event
          window.dispatchEvent(new CustomEvent('xero-status-updated'));
        }).catch(console.error);
      }
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
      return; // Exit early, don't check for errors if connection succeeded
    }
    
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
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
    }

    // Cleanup message listener on unmount
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [hasPermission]);
  
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

      // Load storage settings
      try {
        const storageData = await api.getStorageSettings();
        setStorageSettings({
          ...storageData,
          // Ensure googleDriveConnected is set from API response
          googleDriveConnected: storageData.googleDriveConnected ?? false
        });
      } catch (error) {
        // Storage settings might not exist yet, use defaults
        console.log('Storage settings not found, using defaults');
      }

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

      // Load cloud storage settings
      if (user?.role === 'admin') {
        setCloudStorageProvider((settingsData.cloud_storage_provider || 'local') as 'local' | 's3' | 'google-drive');
        setS3Config({
          accessKeyId: settingsData.aws_access_key_id || '',
          secretAccessKey: settingsData.aws_secret_access_key || '',
          region: settingsData.aws_region || 'us-east-1',
          bucket: settingsData.aws_s3_bucket || ''
        });
        setGoogleDriveFolderId(settingsData.google_drive_folder_id || '');
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
          
        toast.info(`Redirecting to Xero...`, {
          duration: 3000
        });
        }
        
        // Redirect directly to Xero OAuth (no popup)
        window.location.href = response.url;
        
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
    setIsDisconnectingXero(true);
    try {
      await api.disconnectXero();
      setXeroStatus({ connected: false, configured: xeroStatus?.configured });
      toast.success('Xero disconnected');
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    } finally {
      setIsDisconnectingXero(false);
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

      <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className={cn(
            "grid w-full mb-6",
            user?.role === 'admin' ? "grid-cols-4" : "grid-cols-2"
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
              <>
                <TabsTrigger value="cloud-storage" className="flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  Cloud Storage
                </TabsTrigger>
                <TabsTrigger value="permissions" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Permissions
                </TabsTrigger>
              </>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Organization</Label>
                <p className="text-sm font-mono text-foreground mt-1">{xeroStatus?.tenant_name || 'Connected'}</p>
              </div>
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Last Sync</Label>
                <p className="text-sm font-mono text-foreground mt-1">
                  {xeroStatus?.last_sync 
                    ? new Date(xeroStatus.last_sync).toLocaleString() 
                    : 'Never'}
                </p>
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

            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={handlePullContacts}
                disabled={isSyncing}
              >
                <Download className="w-4 h-4 mr-2" />
                Pull Contacts
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={handlePushAllContacts}
                disabled={isSyncing}
              >
                <Upload className="w-4 h-4 mr-2" />
                Push Contacts
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={handleXeroSync}
                disabled={isSyncing}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync All'}
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={handleXeroDisconnect}
                disabled={isDisconnectingXero}
              >
                {isDisconnectingXero ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect'
                )}
              </Button>
            </div>
          </div>
          ) : (
          <div>
            {/* Xero Credentials */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
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
                      Should be 32 characters (currently {xeroCredentials.clientId.length})
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
              </div>
              
              <div className="flex gap-2">
                {showSaveButton && (
                  <Button
                    onClick={handleSaveXeroCredentials}
                    disabled={isSavingCredentials || !xeroCredentials.clientId || !xeroCredentials.clientSecret}
                    className="flex-1 bg-electric text-background hover:bg-electric/90"
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
                <Button 
                  onClick={handleXeroConnect}
                  className="flex-1 bg-electric text-background hover:bg-electric/90"
                  disabled={!settings.xero_client_id || !settings.xero_client_secret}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect to Xero
                </Button>
              </div>

              {credentialsChanged && showSaveButton && (
                <p className="text-xs text-warning text-center">
                  ⚠️ Save credentials before connecting
                </p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Get credentials from <a href="https://developer.xero.com/myapps" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Xero Developer Portal</a>
              </p>
            </div>
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

          {/* Permissions Tab */}
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

          {/* Cloud Storage Tab */}
          {user?.role === 'admin' && (
            <TabsContent value="cloud-storage" className="space-y-6">
              <Card className="p-6 bg-card border-border">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold mb-1">Storage Configuration</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure where files and images are stored. Choose between local filesystem, AWS S3-compatible storage, or Google Drive.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Connection Status */}
                  {storageConnectionStatus && (
                    <div className={cn(
                      "p-3 rounded-lg border flex items-center gap-2",
                      storageConnectionStatus.success 
                        ? "bg-voltage/10 border-voltage text-voltage" 
                        : "bg-destructive/10 border-destructive text-destructive"
                    )}>
                      {storageConnectionStatus.success ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XIcon className="w-4 h-4" />
                      )}
                      <span className="text-sm font-mono">{storageConnectionStatus.message}</span>
                    </div>
                  )}

                  {/* Provider Selection */}
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider mb-3 block">
                      Storage Driver
                    </Label>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        type="button"
                        onClick={() => setStorageSettings(prev => ({ ...prev, driver: 'local' }))}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all text-left",
                          storageSettings.driver === 'local'
                            ? "border-electric bg-electric/10"
                            : "border-border hover:border-electric/50"
                        )}
                      >
                        <div className="font-semibold mb-1">Local Filesystem</div>
                        <div className="text-xs text-muted-foreground">
                          Files stored on server disk
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStorageSettings(prev => ({ ...prev, driver: 's3' }))}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all text-left",
                          storageSettings.driver === 's3'
                            ? "border-electric bg-electric/10"
                            : "border-border hover:border-electric/50"
                        )}
                      >
                        <div className="font-semibold mb-1">Amazon S3</div>
                        <div className="text-xs text-muted-foreground">
                          Scalable cloud storage
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStorageSettings(prev => ({ ...prev, driver: 'google-drive' }))}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all text-left",
                          storageSettings.driver === 'google-drive'
                            ? "border-electric bg-electric/10"
                            : "border-border hover:border-electric/50"
                        )}
                      >
                        <div className="font-semibold mb-1">Google Drive</div>
                        <div className="text-xs text-muted-foreground">
                          Cloud storage via Google
                        </div>
                      </button>
                    </div>
                  </div>

                  <Separator />

                  {/* Base Path Configuration */}
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">
                      Base Path
                    </Label>
                    <Input
                      type="text"
                      value={storageSettings.basePath || 'uploads'}
                      onChange={(e) => setStorageSettings(prev => ({ ...prev, basePath: e.target.value }))}
                      placeholder="uploads"
                      className="mt-2 font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Base directory path for file storage (relative to storage root)
                    </p>
                  </div>

                  {/* Google Drive Configuration */}
                  {storageSettings.driver === 'google-drive' && (
                    <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border">
                      <h4 className="text-sm font-bold font-mono uppercase tracking-wider">Google Drive Configuration</h4>
                      
                      {/* Connection Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            storageSettings.googleDriveConnected ? "bg-voltage animate-pulse" : "bg-muted-foreground"
                          )} />
                          <span className={cn(
                            "text-sm font-mono",
                            storageSettings.googleDriveConnected ? "text-voltage" : "text-muted-foreground"
                          )}>
                            {storageSettings.googleDriveConnected ? 'Connected' : 'Not Connected'}
                          </span>
                        </div>
                      </div>

                      {/* OAuth Credentials */}
                      {!storageSettings.googleDriveConnected && (
                        <div className="space-y-4">
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
                              OAuth redirect URI (must match Google Cloud Console configuration)
                            </p>
                          </div>
                          
                          <div className="flex gap-2">
                            {showGoogleDriveSaveButton && (
                              <Button
                                onClick={handleSaveGoogleDriveCredentials}
                                disabled={isSavingGoogleDriveCredentials || !googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret}
                                className="flex-1 bg-electric text-background hover:bg-electric/90"
                              >
                                {isSavingGoogleDriveCredentials ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    {googleDriveCredentialsChanged ? 'Save Changes' : 'Save'}
                                  </>
                                )}
                              </Button>
                            )}
                            <Button 
                              onClick={async () => {
                                if (!googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret) {
                                  toast.error('Please save your Google Drive credentials first.');
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
                                        setStorageSettings(prev => ({ ...prev, googleDriveConnected: true }));
                                        toast.success('Google Drive connected successfully');
                                        if (popup) popup.close();
                                        // Reload storage settings to get updated connection status
                                        const storageData = await api.getStorageSettings();
                                        setStorageSettings(prev => ({ ...prev, googleDriveConnected: storageData.googleDriveConnected ?? true }));
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
                              className="flex-1 bg-electric text-background hover:bg-electric/90"
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
                                  Connect
                                </>
                              )}
                            </Button>
                          </div>

                          {googleDriveCredentialsChanged && showGoogleDriveSaveButton && (
                            <p className="text-xs text-warning text-center">
                              ⚠️ Save credentials before connecting
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground text-center">
                            Get credentials from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Google Cloud Console</a>
                          </p>
                        </div>
                      )}

                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Folder ID (Optional)
                        </Label>
                        <Input
                          type="text"
                          value={storageSettings.googleDriveFolderId || ''}
                          onChange={(e) => setStorageSettings(prev => ({ ...prev, googleDriveFolderId: e.target.value }))}
                          placeholder="Leave empty to use basePath folder"
                          className="mt-2 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Specific Google Drive folder ID to use as root. If empty, files will be stored in a folder matching the base path ({storageSettings.basePath || 'uploads'}).
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            setIsTestingStorageConnection(true);
                            setStorageConnectionStatus(null);
                            try {
                              const result = await api.testStorageConnection(storageSettings);
                              setStorageConnectionStatus(result);
                              if (result.success) {
                                toast.success('Google Drive connection successful!');
                              } else {
                                toast.error(result.message || 'Connection test failed');
                              }
                            } catch (error: any) {
                              const errorMsg = error.message || 'Connection test failed';
                              setStorageConnectionStatus({ success: false, message: errorMsg });
                              toast.error(errorMsg);
                            } finally {
                              setIsTestingStorageConnection(false);
                            }
                          }}
                          disabled={isTestingStorageConnection || !storageSettings.googleDriveConnected}
                          variant="outline"
                        >
                          {isTestingStorageConnection ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Test Connection
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* S3 Configuration */}
                  {storageSettings.driver === 's3' && (
                    <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border">
                      <h4 className="text-sm font-bold font-mono uppercase tracking-wider">S3 Configuration</h4>
                      
                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Bucket Name *
                        </Label>
                        <Input
                          type="text"
                          value={storageSettings.s3Bucket || ''}
                          onChange={(e) => setStorageSettings(prev => ({ ...prev, s3Bucket: e.target.value }))}
                          placeholder="my-bucket-name"
                          className="mt-2 font-mono text-sm"
                        />
                      </div>

                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Region *
                        </Label>
                        <Input
                          type="text"
                          value={storageSettings.s3Region || 'us-east-1'}
                          onChange={(e) => setStorageSettings(prev => ({ ...prev, s3Region: e.target.value }))}
                          placeholder="us-east-1"
                          className="mt-2 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          AWS region where your bucket is located (e.g., us-east-1, eu-west-1)
                        </p>
                      </div>

                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Access Key ID *
                        </Label>
                        <Input
                          type="password"
                          value={storageSettings.s3AccessKeyId || ''}
                          onChange={(e) => setStorageSettings(prev => ({ ...prev, s3AccessKeyId: e.target.value }))}
                          placeholder="AKIAIOSFODNN7EXAMPLE"
                          className="mt-2 font-mono text-sm"
                        />
                      </div>

                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Secret Access Key *
                        </Label>
                        <Input
                          type="password"
                          value={storageSettings.s3SecretAccessKey || ''}
                          onChange={(e) => setStorageSettings(prev => ({ ...prev, s3SecretAccessKey: e.target.value }))}
                          placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                          className="mt-2 font-mono text-sm"
                        />
                      </div>

                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Endpoint (Optional)
                        </Label>
                        <Input
                          type="text"
                          value={storageSettings.s3Endpoint || ''}
                          onChange={(e) => setStorageSettings(prev => ({ ...prev, s3Endpoint: e.target.value }))}
                          placeholder="https://s3.amazonaws.com (leave empty for AWS)"
                          className="mt-2 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          For S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            setIsTestingStorageConnection(true);
                            setStorageConnectionStatus(null);
                            try {
                              const result = await api.testStorageConnection(storageSettings);
                              setStorageConnectionStatus(result);
                              if (result.success) {
                                toast.success('Storage connection successful!');
                              } else {
                                toast.error(result.message || 'Connection test failed');
                              }
                            } catch (error: any) {
                              const errorMsg = error.message || 'Connection test failed';
                              setStorageConnectionStatus({ success: false, message: errorMsg });
                              toast.error(errorMsg);
                            } finally {
                              setIsTestingStorageConnection(false);
                            }
                          }}
                          disabled={isTestingStorageConnection || 
                            (storageSettings.driver === 's3' && (!storageSettings.s3Bucket || !storageSettings.s3AccessKeyId || !storageSettings.s3SecretAccessKey))}
                          variant="outline"
                        >
                          {isTestingStorageConnection ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Test Connection
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Legacy Google Drive Configuration (kept for backward compatibility) */}
                  {cloudStorageProvider === 'google-drive' && (
                    <div className="space-y-4">
                      {/* Connection Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border">
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
                        {googleDriveConnected && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                toast.info('To disconnect, revoke access in your Google Account settings');
                              } catch (error: any) {
                                toast.error(error.message || 'Failed to disconnect');
                              }
                            }}
                          >
                            Manage
                          </Button>
                        )}
                      </div>

                      {/* OAuth Credentials */}
                      {!googleDriveConnected && (
                        <div className="space-y-4">
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
                          </div>
                          
                          <div className="flex gap-2">
                            {showGoogleDriveSaveButton && (
                              <Button
                                onClick={handleSaveGoogleDriveCredentials}
                                disabled={isSavingGoogleDriveCredentials || !googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret}
                                className="flex-1 bg-electric text-background hover:bg-electric/90"
                              >
                                {isSavingGoogleDriveCredentials ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    {googleDriveCredentialsChanged ? 'Save Changes' : 'Save'}
                                  </>
                                )}
                              </Button>
                            )}
                            <Button 
                              onClick={async () => {
                                if (!googleDriveCredentials.clientId || !googleDriveCredentials.clientSecret) {
                                  toast.error('Please save your Google Drive credentials first.');
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
                              className="flex-1 bg-electric text-background hover:bg-electric/90"
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
                                  Connect
                                </>
                              )}
                            </Button>
                          </div>

                          {googleDriveCredentialsChanged && showGoogleDriveSaveButton && (
                            <p className="text-xs text-warning text-center">
                              ⚠️ Save credentials before connecting
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground text-center">
                            Get credentials from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">Google Cloud Console</a>
                          </p>
                        </div>
                      )}

                      {/* Folder ID Configuration */}
                      <div>
                        <Label className="font-mono text-xs uppercase tracking-wider">
                          Folder ID (Optional)
                        </Label>
                        <Input
                          type="text"
                          value={googleDriveFolderId}
                          onChange={(e) => setGoogleDriveFolderId(e.target.value)}
                          placeholder="Leave empty to use default folder"
                          className="mt-2 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Specific Google Drive folder ID. If empty, files will be stored in AmpedFieldOps/Timesheets folder.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Local Storage Info */}
                  {storageSettings.driver === 'local' && (
                    <div className="p-4 rounded-lg bg-muted/20 border border-border">
                      <p className="text-sm text-muted-foreground">
                        Files will be stored on the server's local filesystem at <code className="bg-muted px-1 py-0.5 rounded text-xs">/{storageSettings.basePath || 'uploads'}</code>.
                        This is suitable for small deployments but may not scale well.
                      </p>
                    </div>
                  )}

                  {/* Google Drive Storage Info */}
                  {storageSettings.driver === 'google-drive' && storageSettings.googleDriveConnected && (
                    <div className="p-4 rounded-lg bg-muted/20 border border-border">
                      <p className="text-sm text-muted-foreground">
                        Files will be stored in Google Drive. The folder structure will match your application paths (e.g., <code className="bg-muted px-1 py-0.5 rounded text-xs">{storageSettings.basePath || 'uploads'}/projects/...</code>).
                        {storageSettings.googleDriveFolderId && (
                          <> Using folder ID: <code className="bg-muted px-1 py-0.5 rounded text-xs">{storageSettings.googleDriveFolderId}</code></>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end gap-2 pt-4 border-t border-border">
                    <Button
                      onClick={async () => {
                        // Test connection before saving if S3 or Google Drive
                        if (storageSettings.driver === 's3' || storageSettings.driver === 'google-drive') {
                          setIsTestingStorageConnection(true);
                          try {
                            const testResult = await api.testStorageConnection(storageSettings);
                            if (!testResult.success) {
                              toast.error('Connection test failed. Please fix configuration before saving.');
                              setStorageConnectionStatus(testResult);
                              return;
                            }
                            setStorageConnectionStatus(testResult);
                          } catch (error: any) {
                            toast.error(error.message || 'Connection test failed');
                            return;
                          } finally {
                            setIsTestingStorageConnection(false);
                          }
                        }

                        // Validate Google Drive connection
                        if (storageSettings.driver === 'google-drive' && !storageSettings.googleDriveConnected) {
                          toast.error('Google Drive not connected. Please connect in the Integrations tab first.');
                          return;
                        }

                        setIsSavingStorage(true);
                        try {
                          await api.updateStorageSettings(storageSettings);
                          toast.success('Storage configuration saved successfully!');
                          // Reload settings to get updated values
                          await loadSettings();
                        } catch (error: any) {
                          toast.error(error.message || 'Failed to save configuration');
                        } finally {
                          setIsSavingStorage(false);
                        }
                      }}
                      disabled={isSavingStorage || isTestingStorageConnection || 
                        (storageSettings.driver === 's3' && (!storageSettings.s3Bucket || !storageSettings.s3AccessKeyId || !storageSettings.s3SecretAccessKey)) ||
                        (storageSettings.driver === 'google-drive' && !storageSettings.googleDriveConnected)}
                      className="bg-electric text-background hover:bg-electric/90"
                    >
                      {isSavingStorage ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Save Configuration
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
