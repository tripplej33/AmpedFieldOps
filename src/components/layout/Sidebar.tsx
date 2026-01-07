import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  Clock, 
  Settings, 
  Zap, 
  Menu, 
  X,
  DollarSign,
  UserCog,
  Activity,
  LogOut,
  User,
  Wrench,
  FolderOpen,
  Shield,
  HardDrive,
  Camera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission?: string;
  roles?: string[];
}

const mainNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: Briefcase },
  { name: 'Clients', href: '/clients', icon: Users },
  { name: 'Timesheets', href: '/timesheets', icon: Clock },
  { name: 'Files', href: '/files', icon: FolderOpen, permission: 'can_view_financials' },
  { name: 'Financials', href: '/financials', icon: DollarSign, permission: 'can_view_financials' },
  { name: 'Document Scan', href: '/document-scan', icon: Camera, permission: 'can_edit_projects' },
];

const adminNavigation: NavItem[] = [
  { name: 'Users', href: '/users', icon: UserCog, permission: 'can_manage_users' },
  { name: 'Activity Types', href: '/activity-types', icon: Activity, permission: 'can_edit_activity_types' },
  { name: 'Safety Documents', href: '/safety-documents', icon: Shield, permission: 'can_view_financials' },
  { name: 'Backups', href: '/backups', icon: HardDrive, permission: 'can_manage_users' },
  { name: 'Troubleshooter', href: '/troubleshooter', icon: Wrench, permission: 'can_manage_users' },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, hasPermission, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [xeroStatus, setXeroStatus] = useState<any>(null);
  const [branding, setBranding] = useState<{ company_name: string; company_logo: string | null }>({
    company_name: 'AmpedFieldOps',
    company_logo: null
  });

  useEffect(() => {
    loadBranding();
    if (hasPermission('can_sync_xero')) {
      loadXeroStatus();
    }

    // Listen for Xero status updates from other components
    const handleXeroStatusUpdate = () => {
      if (hasPermission('can_sync_xero')) {
        loadXeroStatus();
      }
    };
    window.addEventListener('xero-status-updated', handleXeroStatusUpdate);
    
    return () => {
      window.removeEventListener('xero-status-updated', handleXeroStatusUpdate);
    };
  }, [hasPermission]);

  const loadBranding = async () => {
    try {
      const data = await api.getBranding();
      setBranding(data);
    } catch (error) {
      // Use defaults
    }
  };

  const loadXeroStatus = async () => {
    try {
      const status = await api.getXeroStatus();
      setXeroStatus(status);
    } catch (error) {
      // Silently fail
    }
  };

  const filteredMainNav = mainNavigation.filter(item => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

  const filteredAdminNav = adminNavigation.filter(item => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        {branding.company_logo ? (
          <img 
            src={branding.company_logo} 
            alt={branding.company_name}
            className="w-10 h-10 rounded-lg object-contain"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-electric flex items-center justify-center">
            <Zap className="w-6 h-6 text-background" />
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold text-electric">{branding.company_name}</h1>
          <p className="text-xs font-mono text-muted-foreground">v2.0.0</p>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredMainNav.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-electric glow-primary'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}

        {/* Admin Section */}
        {filteredAdminNav.length > 0 && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Admin
              </p>
            </div>
            {filteredAdminNav.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-sidebar-accent text-electric glow-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User Info & Logout */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        {user && (
          <div className="px-3 py-2 rounded-lg bg-muted/30 mb-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}
        <Link
          to="/user-settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all mb-2',
            location.pathname === '/user-settings'
              ? 'bg-sidebar-accent text-electric'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
          )}
        >
          <User className="w-4 h-4" />
          User Settings
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Xero Sync Status */}
      {hasPermission('can_sync_xero') && xeroStatus && (
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="px-3 py-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-muted-foreground">XERO</span>
              <div className={cn(
                "w-2 h-2 rounded-full",
                xeroStatus.connected ? "bg-voltage animate-pulse" : "bg-muted-foreground"
              )}></div>
            </div>
            {xeroStatus.connected ? (
              <>
                <p className="text-xs font-mono text-foreground">
                  {xeroStatus.tenant_name || 'Connected'}
                </p>
                {xeroStatus.last_sync && (
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    Last sync: {new Date(xeroStatus.last_sync).toLocaleTimeString()}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs font-mono text-warning">Not connected</p>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 p-0 bg-sidebar border border-sidebar-border"
        variant="ghost"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-col h-screen w-60 bg-sidebar border-r border-sidebar-border">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <div
        className={cn(
          'lg:hidden fixed top-0 left-0 h-screen w-60 bg-sidebar border-r border-sidebar-border z-50 transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}
