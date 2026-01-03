import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { api } from '@/lib/api';
import { CostCenter, Project, TimesheetEntry, User } from '@/types';
import { Download, Filter, TrendingUp, Loader2, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface CostCenterMetric extends CostCenter {
  totalHours: number;
  totalBudget: number;
  totalActual: number;
  utilization: number;
  projectCount: number;
}

export default function Reports() {
  const [costCenterMetrics, setCostCenterMetrics] = useState<CostCenterMetric[]>([]);
  const [allCostCenters, setAllCostCenters] = useState<CostCenter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('month');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadReportData();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadReportData = async () => {
    try {
      const [costCenters, projectsResponse, timesheetsResponse] = await Promise.all([
        api.getCostCenters(),
        api.getProjects({ limit: 100 }),
        api.getTimesheets({ limit: 1000 }),
      ]);

      // Handle paginated responses
      const projects = projectsResponse.data || (Array.isArray(projectsResponse) ? projectsResponse : []);
      const timesheets = timesheetsResponse.data || (Array.isArray(timesheetsResponse) ? timesheetsResponse : []);

      setAllCostCenters(costCenters);

      const metrics = costCenters.map((cc: CostCenter) => {
        const ccProjects = projects.filter((p: Project) => 
          (p.cost_center_codes || []).includes(cc.code)
        );
        const ccEntries = timesheets.filter((e: TimesheetEntry) => e.cost_center_code === cc.code);
        const totalHours = ccEntries.reduce((sum: number, e: TimesheetEntry) => sum + parseFloat(String(e.hours)), 0);
        const totalBudget = ccProjects.reduce((sum: number, p: Project) => sum + (p.budget || 0), 0);
        const totalActual = ccProjects.reduce((sum: number, p: Project) => sum + (p.actual_cost || 0), 0);
        const utilization = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

        return {
          ...cc,
          totalHours,
          totalBudget,
          totalActual,
          utilization,
          projectCount: ccProjects.length,
        };
      });

      setCostCenterMetrics(metrics);
    } catch (error) {
      console.error('Failed to load report data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter the metrics based on selection
  const filteredMetrics = costCenterMetrics.filter(cc => {
    if (selectedCostCenter !== 'all' && cc.id !== selectedCostCenter) return false;
    return true;
  });

  // Export to CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const headers = ['Cost Center Code', 'Cost Center Name', 'Projects', 'Hours', 'Budget', 'Actual', 'Utilization %'];
      const rows = filteredMetrics.map(cc => [
        cc.code,
        cc.name,
        cc.projectCount,
        cc.totalHours,
        cc.totalBudget,
        cc.totalActual,
        Math.round(cc.utilization),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `cost-center-report-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Report exported successfully');
    } catch (error: any) {
      toast.error('Failed to export report');
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    const now = new Date();
    if (range === 'week') {
      setDateFrom(new Date(now.setDate(now.getDate() - 7)));
      setDateTo(new Date());
    } else if (range === 'month') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1));
      setDateTo(new Date());
    } else if (range === 'quarter') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth() - 3, 1));
      setDateTo(new Date());
    } else if (range === 'year') {
      setDateFrom(new Date(now.getFullYear(), 0, 1));
      setDateTo(new Date());
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Cost Center Reports" subtitle="Financial and resource allocation analysis" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Cost Center Reports" subtitle="Financial and resource allocation analysis" />

      <div className="p-8 max-w-[1400px] mx-auto">
        {/* Filter Bar */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={dateRange} onValueChange={handleDateRangeChange}>
              <SelectTrigger className="w-[140px]">
                <CalendarIcon className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Cost Centers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cost Centers</SelectItem>
                {allCostCenters.filter(cc => cc.id).map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.code} - {cc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team Members</SelectItem>
                {users.filter(user => user.id).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </>
            )}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Total Budget</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              ${filteredMetrics.reduce((sum, cc) => sum + cc.totalBudget, 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-voltage" />
              <span className="text-xs font-mono text-voltage">+12.5%</span>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Actual Cost</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              ${filteredMetrics.reduce((sum, cc) => sum + cc.totalActual, 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-electric" />
              <span className="text-xs font-mono text-electric">+8.3%</span>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Total Hours</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              {filteredMetrics.reduce((sum, cc) => sum + cc.totalHours, 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-voltage" />
              <span className="text-xs font-mono text-voltage">+15.2%</span>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Avg Utilization</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              {filteredMetrics.length > 0 ? Math.round(
                filteredMetrics.reduce((sum, cc) => sum + cc.utilization, 0) / filteredMetrics.length
              ) : 0}
              %
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-warning" />
              <span className="text-xs font-mono text-warning">+3.7%</span>
            </div>
          </Card>
        </div>

        {/* Cost Center Matrix */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    Cost Center
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    Hours
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    Budget
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    Actual
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    Utilization
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMetrics.map((cc) => (
                  <tr key={cc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-mono font-semibold text-foreground">{cc.code}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{cc.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-foreground">{cc.projectCount}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono font-medium text-electric">{cc.totalHours}h</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono text-foreground">${cc.totalBudget.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono text-foreground">${cc.totalActual.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              cc.utilization > 90
                                ? 'bg-warning'
                                : cc.utilization > 70
                                ? 'bg-electric'
                                : 'bg-voltage'
                            )}
                            style={{ width: `${Math.min(cc.utilization, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono font-medium text-foreground w-12 text-right">
                          {Math.round(cc.utilization)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Budget Burn Chart */}
        <Card className="mt-8 p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-6">Budget Burn Rate</h3>
          <div className="space-y-4">
            {filteredMetrics.slice(0, 5).map((cc) => (
              <div key={cc.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono text-foreground">{cc.code}</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    ${cc.totalActual.toLocaleString()} / ${cc.totalBudget.toLocaleString()}
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      cc.utilization > 90 ? 'bg-warning' : cc.utilization > 70 ? 'bg-electric' : 'bg-voltage'
                    )}
                    style={{ width: `${Math.min(cc.utilization, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
