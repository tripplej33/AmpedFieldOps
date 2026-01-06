import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Download, Trash2, RefreshCw, HardDrive, Cloud, Database, FileArchive, Calendar, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Backup } from '@/types';

export default function Backups() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState<string | null>(null);
  const [backupType, setBackupType] = useState<'full' | 'database' | 'files'>('full');
  const [storageType, setStorageType] = useState<'local' | 'google_drive'>('local');
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [schedule, setSchedule] = useState<{
    enabled: boolean;
    frequency: string;
    retention_days: number;
    backup_type: 'full' | 'database' | 'files';
    storage_type: 'local' | 'google_drive';
  } | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  useEffect(() => {
    loadBackups();
    loadGoogleDriveStatus();
    loadSchedule();
  }, []);

  const loadBackups = async () => {
    try {
      setIsLoading(true);
      const data = await api.getBackups();
      setBackups(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load backups');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGoogleDriveStatus = async () => {
    try {
      const status = await api.getGoogleDriveStatus();
      setGoogleDriveConnected(status.connected);
    } catch (error) {
      setGoogleDriveConnected(false);
    }
  };

  const loadSchedule = async () => {
    try {
      const data = await api.getBackupSchedule();
      setSchedule(data);
    } catch (error) {
      // Use defaults if schedule not found
      setSchedule({
        enabled: false,
        frequency: 'daily',
        retention_days: 30,
        backup_type: 'full',
        storage_type: 'local'
      });
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsCreating(true);
      await api.createBackup({ type: backupType, storage_type: storageType });
      toast.success('Backup created successfully');
      setCreateModalOpen(false);
      loadBackups();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create backup');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownloadBackup = async (backup: Backup) => {
    try {
      const blob = await api.downloadBackup(backup.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${backup.id}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Backup download started');
    } catch (error: any) {
      toast.error(error.message || 'Failed to download backup');
    }
  };

  const handleDeleteBackup = async (id: string) => {
    try {
      setIsDeleting(id);
      await api.deleteBackup(id);
      toast.success('Backup deleted successfully');
      loadBackups();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete backup');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleRestoreBackup = async (id: string) => {
    try {
      setIsRestoring(id);
      await api.restoreBackup(id, true);
      toast.success('Backup restored successfully. Please refresh the page.');
      setRestoreModalOpen(null);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore backup');
    } finally {
      setIsRestoring(null);
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      const { url } = await api.getGoogleDriveAuthUrl();
      window.open(url, 'google-drive-auth', 'width=600,height=700');
      
      // Poll for connection status
      const checkInterval = setInterval(async () => {
        try {
          const status = await api.getGoogleDriveStatus();
          if (status.connected) {
            clearInterval(checkInterval);
            setGoogleDriveConnected(true);
            toast.success('Google Drive connected successfully');
          }
        } catch (error) {
          // Ignore errors during polling
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to get Google Drive auth URL');
    }
  };

  const handleUpdateSchedule = async () => {
    if (!schedule) return;
    
    try {
      await api.updateBackupSchedule(schedule);
      toast.success('Backup schedule updated');
      setScheduleModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update schedule');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getBackupTypeIcon = (type: string) => {
    switch (type) {
      case 'database':
        return <Database className="w-4 h-4" />;
      case 'files':
        return <FileArchive className="w-4 h-4" />;
      default:
        return <HardDrive className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
      <Header title="Backups" subtitle="Manage database and file backups" />
      
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Create Backup Card */}
        <Card>
          <CardHeader>
            <CardTitle>Create Backup</CardTitle>
            <CardDescription>Create a new backup of your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Backup Type</Label>
              <Select value={backupType} onValueChange={(v: any) => setBackupType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Backup</SelectItem>
                  <SelectItem value="database">Database Only</SelectItem>
                  <SelectItem value="files">Files Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Storage Location</Label>
              <Select value={storageType} onValueChange={(v: any) => setStorageType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Storage</SelectItem>
                  <SelectItem value="google_drive" disabled={!googleDriveConnected}>
                    Google Drive {!googleDriveConnected && '(Not Connected)'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!googleDriveConnected && storageType === 'google_drive' && (
              <Button onClick={handleConnectGoogleDrive} variant="outline" className="w-full">
                <Cloud className="w-4 h-4 mr-2" />
                Connect Google Drive
              </Button>
            )}
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" disabled={storageType === 'google_drive' && !googleDriveConnected}>
                  Create Backup
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Backup</DialogTitle>
                  <DialogDescription>
                    This will create a {backupType} backup and store it {storageType === 'local' ? 'locally' : 'on Google Drive'}.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateBackup} disabled={isCreating}>
                    {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Backup
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Schedule Card */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Backups</CardTitle>
            <CardDescription>Configure automatic backups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {schedule && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Enable Scheduled Backups</Label>
                  <Switch
                    checked={schedule.enabled}
                    onCheckedChange={(checked) => setSchedule({ ...schedule, enabled: checked })}
                  />
                </div>
                {schedule.enabled && (
                  <>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={schedule.frequency} onValueChange={(v) => setSchedule({ ...schedule, frequency: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Retention (days)</Label>
                      <Input
                        type="number"
                        value={schedule.retention_days}
                        onChange={(e) => setSchedule({ ...schedule, retention_days: parseInt(e.target.value) || 30 })}
                      />
                    </div>
                  </>
                )}
                <Button onClick={() => setScheduleModalOpen(true)} variant="outline" className="w-full">
                  <Calendar className="w-4 h-4 mr-2" />
                  Configure Schedule
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Backups List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Backup History</CardTitle>
              <CardDescription>View and manage your backups</CardDescription>
            </div>
            <Button onClick={loadBackups} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No backups found. Create your first backup above.
            </div>
          ) : (
            <div className="space-y-4">
              {backups.map((backup) => (
                <div key={backup.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="p-2 bg-muted rounded">
                      {getBackupTypeIcon(backup.backup_type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium capitalize">{backup.backup_type} Backup</span>
                        {getStatusBadge(backup.status)}
                        <Badge variant="outline">
                          {backup.storage_type === 'local' ? <HardDrive className="w-3 h-3 mr-1" /> : <Cloud className="w-3 h-3 mr-1" />}
                          {backup.storage_type === 'local' ? 'Local' : 'Google Drive'}
                        </Badge>
                        {backup.status === 'completed' && (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Ready to Restore
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatFileSize(backup.file_size)} • {new Date(backup.created_at).toLocaleString()}
                        {backup.created_by_name && ` • Created by ${backup.created_by_name}`}
                      </div>
                      {backup.error_message && (
                        <div className="text-sm text-destructive mt-1">{backup.error_message}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {backup.status === 'completed' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadBackup(backup)}
                          title="Download backup"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setRestoreModalOpen(backup.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          title="Restore this backup"
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Restore
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteBackup(backup.id)}
                      disabled={isDeleting === backup.id}
                      title="Delete backup"
                    >
                      {isDeleting === backup.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Modal */}
      <Dialog open={restoreModalOpen !== null} onOpenChange={(open) => !open && setRestoreModalOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription className="space-y-2">
              <p className="font-semibold text-destructive">⚠️ Warning: This action cannot be undone!</p>
              <p>This will restore the backup and may overwrite existing data including:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Database records (if restoring database or full backup)</li>
                <li>Uploaded files (if restoring files or full backup)</li>
                <li>All current data will be replaced with the backup data</li>
              </ul>
              <p className="mt-2 text-sm">Are you sure you want to proceed?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreModalOpen(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => restoreModalOpen && handleRestoreBackup(restoreModalOpen)}
              disabled={isRestoring === restoreModalOpen}
            >
              {isRestoring === restoreModalOpen ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Confirm Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Configuration Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Backup Schedule</DialogTitle>
            <DialogDescription>
              Set up automatic backups to run on a schedule
            </DialogDescription>
          </DialogHeader>
          {schedule && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Backup Type</Label>
                <Select value={schedule.backup_type} onValueChange={(v: any) => setSchedule({ ...schedule, backup_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Backup</SelectItem>
                    <SelectItem value="database">Database Only</SelectItem>
                    <SelectItem value="files">Files Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Storage Location</Label>
                <Select value={schedule.storage_type} onValueChange={(v: any) => setSchedule({ ...schedule, storage_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local Storage</SelectItem>
                    <SelectItem value="google_drive" disabled={!googleDriveConnected}>
                      Google Drive {!googleDriveConnected && '(Not Connected)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateSchedule}>Save Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

