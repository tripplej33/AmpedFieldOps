import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { mockProjects, mockCostCenters, mockTimesheetEntries } from '@/lib/mockData';
import { Download, Filter, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Reports() {
  // Calculate cost center metrics
  const costCenterMetrics = mockCostCenters.map((cc) => {
    const ccProjects = mockProjects.filter((p) => p.costCenters.includes(cc.id));
    const ccEntries = mockTimesheetEntries.filter((e) => e.costCenter === cc.code);
    const totalHours = ccEntries.reduce((sum, e) => sum + e.hours, 0);
    const totalBudget = ccProjects.reduce((sum, p) => sum + p.budget, 0);
    const totalActual = ccProjects.reduce((sum, p) => sum + p.actualCost, 0);
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

  return (
    <>
      <Header title="Cost Center Reports" subtitle="Financial and resource allocation analysis" />

      <div className="p-8 max-w-[1400px] mx-auto">
        {/* Filter Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              This Month
            </Button>
            <Button variant="outline" size="sm">
              All Cost Centers
            </Button>
          </div>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Total Budget</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              ${costCenterMetrics.reduce((sum, cc) => sum + cc.totalBudget, 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-voltage" />
              <span className="text-xs font-mono text-voltage">+12.5%</span>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Actual Cost</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              ${costCenterMetrics.reduce((sum, cc) => sum + cc.totalActual, 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-electric" />
              <span className="text-xs font-mono text-electric">+8.3%</span>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Total Hours</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              {costCenterMetrics.reduce((sum, cc) => sum + cc.totalHours, 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-voltage" />
              <span className="text-xs font-mono text-voltage">+15.2%</span>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2">Avg Utilization</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              {Math.round(
                costCenterMetrics.reduce((sum, cc) => sum + cc.utilization, 0) / costCenterMetrics.length
              )}
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
                {costCenterMetrics.map((cc) => (
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
            {costCenterMetrics.slice(0, 5).map((cc) => (
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
