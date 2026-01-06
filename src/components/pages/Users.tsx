import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { User, Permission } from '@/types';
import { Plus, Edit, Trash2, Shield, UserCircle, Mail, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Permissions will be loaded from the database

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [allPermissions, setAllPermissions] = useState<Array<{ key: string; label: string; description: string }>>([]);

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'manager' | 'user'>('user');

  // Permissions
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadUsers();
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const perms = await api.getPermissions();
      // Filter to only active permissions and format for display
      setAllPermissions(
        perms
          .filter((p: any) => p.is_active)
          .map((p: any) => ({
            key: p.key,
            label: p.label,
            description: p.description || ''
          }))
      );
    } catch (error) {
      console.error('Failed to load permissions:', error);
      // Fallback to empty array if permissions can't be loaded
      setAllPermissions([]);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      if (error?.message !== 'Failed to fetch') {
        toast.error('Failed to load users');
      }
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newName) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSaving(true);
    try {
      await api.createUser({
        email: newEmail,
        password: newPassword,
        name: newName,
        role: newRole
      });
      toast.success('User created successfully');
      setShowCreateModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('user');
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPermissions = (user: User) => {
    setSelectedUser(user);
    const perms: Record<string, boolean> = {};
    user.permissions.forEach(p => {
      if (typeof p === 'string') {
        perms[p] = true;
      } else {
        perms[(p as Permission).permission] = (p as Permission).granted;
      }
    });
    setUserPermissions(perms);
    setShowPermissionsModal(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;

    setIsSaving(true);
    try {
      const permissions = Object.entries(userPermissions).map(([permission, granted]) => ({
        permission,
        granted
      }));
      await api.updateUserPermissions(selectedUser.id, permissions);
      toast.success('Permissions updated');
      setShowPermissionsModal(false);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      toast.success(user.is_active ? 'User deactivated' : 'User activated');
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.name}?`)) return;

    try {
      await api.deleteUser(user.id);
      toast.success('User deleted');
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user');
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-voltage/20 text-voltage border-voltage/30',
      manager: 'bg-electric/20 text-electric border-electric/30',
      user: 'bg-muted text-muted-foreground'
    };
    return <Badge className={cn('capitalize', colors[role] || colors.user)}>{role}</Badge>;
  };

  return (
    <>
      <Header title="User Management" subtitle="Manage team members and permissions" />

      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {users.length} total users
          </p>
          <Button 
            className="bg-electric text-background hover:bg-electric/90"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* Users Table */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[600px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                    User
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                    Role
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-xs font-mono font-bold text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase">
                    Created
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <UserCircle className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge className={user.is_active 
                        ? 'bg-voltage/20 text-voltage border-voltage/30' 
                        : 'bg-muted text-muted-foreground'
                      }>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPermissions(user)}
                        >
                          <Shield className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(user)}
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteUser(user)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="font-mono text-xs uppercase">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="John Smith"
                className="mt-2"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="john@company.com"
                className="mt-2"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-2"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">Role</Label>
              <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User (Technician)</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateUser}
              disabled={isSaving}
              className="w-full bg-electric text-background hover:bg-electric/90"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Modal */}
      <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Permissions for {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {selectedUser?.role === 'admin' ? (
              <p className="text-sm text-muted-foreground">
                Admins have all permissions by default.
              </p>
            ) : (
              allPermissions.map((perm) => (
                <div key={perm.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium text-sm">{perm.label}</p>
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  </div>
                  <Switch
                    checked={userPermissions[perm.key] || false}
                    onCheckedChange={(checked) => 
                      setUserPermissions(prev => ({ ...prev, [perm.key]: checked }))
                    }
                  />
                </div>
              ))
            )}
          </div>
          {selectedUser?.role !== 'admin' && (
            <Button
              onClick={handleSavePermissions}
              disabled={isSaving}
              className="w-full bg-electric text-background hover:bg-electric/90"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Permissions'}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
