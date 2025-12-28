import { useState, useEffect, useRef } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { DashboardMetrics, QuickStats, TimesheetEntry, Project } from '@/types';
import { TrendingUp, TrendingDown, Briefcase, Clock, DollarSign, Activity, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [recentTimesheets, setRecentTimesheets] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { notifyInfo } = useNotifications();
  const { user } = useAuth();
  const welcomeShownRef = useRef(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Show welcome notification once per session
  useEffect(() => {
    if (user && !welcomeShownRef.current) {
      welcomeShownRef.current = true;
      const lastVisit = localStorage.getItem('last_dashboard_visit');
      const now = new Date().toISOString();
      localStorage.setItem('last_dashboard_visit', now);
      
      // Only show if it's been more than 4 hours since last visit
      if (!lastVisit || new Date(now).getTime() - new Date(lastVisit).getTime() > 4 * 60 * 60 * 1000) {
        notifyInfo(
          `Welcome back, ${user.name?.split(' ')[0] || 'User'}!`,
          'Your dashboard is ready. Check your notifications for any updates.',
        );
      }
    }
  }, [user, notifyInfo]);

  const loadDashboardData = async () => {
    try {
      const [metricsData, statsData, timesheetsData, projectsData] = await Promise.all([
        api.getDashboardMetrics().catch(() => null),
        api.getQuickStats().catch(() => null),
        api.getRecentTimesheets(5).catch(() => []),
        api.getActiveProjects(5).catch(() => [])
      ]);
      setMetrics(metricsData || {
        total_revenue: 0,
        total_hours: 0,
        active_projects: 0,
        pending_invoices: 0,
        revenue_trend: 0,
        hours_trend: 0,
        projects_trend: 0,
        invoices_trend: 0
      });
      setQuickStats(statsData);
      setRecentTimesheets(Array.isArray(timesheetsData) ? timesheetsData : []);
      setActiveProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setMetrics({
        total_revenue: 0,
        total_hours: 0,
        active_projects: 0,
        pending_invoices: 0,
        revenue_trend: 0,
        hours_trend: 0,
        projects_trend: 0,
        invoices_trend: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Command Center" subtitle="Real-time project and resource overview" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  if (!metrics) {
    return (
      <>
        <Header title="Command Center" subtitle="Real-time project and resource overview" />
        <div className="p-8 text-center text-muted-foreground">
          <p>Unable to load dashboard data. Please try again.</p>
        </div>
      </>
    );
  }

  const MetricCard = ({
    title,
    value,
    trend,
    icon: Icon,
    suffix = '',
  }: {
    title: string;
    value: string | number;
    trend: number;
    icon: React.ElementType;
    suffix?: string;
  }) => {
    const isPositive = trend > 0;
    return (
      <Card className="p-6 bg-card border-border hover:border-electric transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">{title}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <h3 className="text-4xl font-bold text-foreground font-mono">{value}</h3>
              <span className="text-lg text-muted-foreground font-mono">{suffix}</span>
            </div>
            <div className="mt-3 flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-voltage" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
              <span
                className={cn(
                  'text-sm font-mono font-medium',
                  isPositive ? 'text-voltage' : 'text-destructive'
                )}
              >
                {isPositive ? '+' : ''}
                {trend}%
              </span>
              <span className="text-sm text-muted-foreground font-mono ml-1">vs last month</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-lg bg-electric/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-electric" />
          </div>
        </div>
      </Card>
    );
  };

  return (
    <>
      <Header title="Command Center" subtitle="Real-time project and resource overview" />
      
      <div className="p-8 space-y-8 max-w-[1400px] mx-auto">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Active Projects"
            value={metrics.activeProjects}
            trend={metrics.projectsTrend}
            icon={Briefcase}
          />
          <MetricCard
            title="Total Hours"
            value={metrics.totalHours.toLocaleString()}
            trend={metrics.hoursTrend}
            icon={Clock}
            suffix="hrs"
          />
          <MetricCard
            title="Revenue (YTD)"
            value={`$${(metrics.totalRevenue / 1000).toFixed(0)}k`}
            trend={metrics.revenueTrend}
            icon={DollarSign}
          />
          <MetricCard
            title="Team Active"
            value={8}
            trend={0}
            icon={Activity}
            suffix="techs"
          />
        </div>

        {/* Activity Chart & Recent Entries */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity Sparkline */}
          <Card className="lg:col-span-2 p-6 bg-card border-border">
            <h3 className="text-lg font-bold mb-4">Hours This Week</h3>
            <div className="flex items-end justify-between h-40 gap-2">
              {metrics.recentActivity.map((day, i) => {
                const maxHours = Math.max(...metrics.recentActivity.map((d) => d.hours));
                const height = (day.hours / maxHours) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-electric rounded-t-sm transition-all hover:bg-electric/80 cursor-pointer glow-primary"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-bold mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-mono text-muted-foreground">Budget Utilization</span>
                  <span className="text-sm font-bold font-mono text-foreground">{quickStats?.budgetUtilization || 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-electric" style={{ width: `${quickStats?.budgetUtilization || 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-mono text-muted-foreground">Projects On Track</span>
                  <span className="text-sm font-bold font-mono text-voltage">{quickStats?.projectsOnTrack || 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-voltage" style={{ width: `${quickStats?.projectsOnTrack || 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-mono text-muted-foreground">Overdue Projects</span>
                  <span className="text-sm font-bold font-mono text-warning">{quickStats?.overdueProjects || 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-warning" style={{ width: `${quickStats?.overdueProjects || 0}%` }} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Activity & Projects */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Timesheet Entries */}
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-bold mb-4">Recent Timesheet Entries</h3>
            <div className="space-y-3">
              {recentTimesheets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent timesheets</p>
              ) : (
                recentTimesheets.map((entry) => (
                <div key={entry.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{entry.project_name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {entry.user_name} • {entry.activity_type_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono text-electric">{entry.hours}h</p>
                    <p className="text-xs text-muted-foreground font-mono">{entry.date}</p>
                  </div>
                </div>
              )))}
            </div>
          </Card>

          {/* Active Projects */}
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-bold mb-4">Active Projects</h3>
            <div className="space-y-3">
              {activeProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active projects</p>
              ) : (
                activeProjects.map((project) => {
                  const progress = project.budget > 0 ? (project.actual_cost / project.budget) * 100 : 0;
                  return (
                    <div key={project.id} className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-foreground">{project.name}</p>
                        <span className="text-xs font-mono text-muted-foreground">{project.code}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{project.client_name}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              progress > 90 ? 'bg-warning' : progress > 70 ? 'bg-electric' : 'bg-voltage'
                            )}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-medium text-foreground">{Math.round(progress)}%</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
