import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { TimesheetEntry } from '@/types';
import { Plus, Calendar, Clock, Wrench, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Timesheets() {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTimesheets();
  }, []);

  const loadTimesheets = async () => {
    try {
      const data = await api.getTimesheets();
      setEntries(data);
    } catch (error) {
      console.error('Failed to load timesheets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group entries by date
  const groupedEntries = entries.reduce((acc, entry) => {
    const date = entry.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, TimesheetEntry[]>);

  const dates = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const totalHoursThisWeek = entries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

  if (isLoading) {
    return (
      <>
        <Header title="Timesheet Management" subtitle="Track and manage team hours and activities" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Timesheet Management" subtitle="Track and manage team hours and activities" />

      <div className="p-8 max-w-[1400px] mx-auto">
        {/* Actions Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              This Week
            </Button>
            <div className="text-sm font-mono text-muted-foreground">
              Total Hours: <span className="text-foreground font-bold">{totalHoursThisWeek.toFixed(1)}</span>
            </div>
          </div>
          <Button className="bg-electric text-background hover:bg-electric/90 glow-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Entry
          </Button>
        </div>

        {/* Weekly Calendar View */}
        <Card className="p-6 bg-card border-border mb-6">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="text-center">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{day}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - date.getDay() + i + 1);
              const dateStr = date.toISOString().split('T')[0];
              const dayEntries = groupedEntries[dateStr] || [];
              const totalHours = dayEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border transition-all cursor-pointer',
                    isToday
                      ? 'bg-electric/10 border-electric'
                      : dayEntries.length > 0
                      ? 'bg-muted/30 border-border hover:border-electric'
                      : 'bg-muted/10 border-border hover:border-muted'
                  )}
                >
                  <p className="text-lg font-bold font-mono text-center mb-1">{date.getDate()}</p>
                  {totalHours > 0 && (
                    <p className="text-xs font-mono text-center text-electric">{totalHours}h</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Timesheet Entries */}
        <div className="space-y-6">
          {dates.length === 0 && (
            <Card className="p-8 bg-card border-border">
              <p className="text-center text-muted-foreground">No timesheet entries found</p>
            </Card>
          )}
          {dates.map((date) => {
            const dateEntries = groupedEntries[date];
            const totalHours = dateEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold">
                    {new Date(date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-electric" />
                    <span className="font-mono font-bold text-electric">{totalHours}h total</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {dateEntries.map((entry) => (
                    <Card
                      key={entry.id}
                      className="p-4 bg-card border-border hover:border-electric transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center bg-electric/20 border-electric text-electric">
                          <Wrench className="w-5 h-5" />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-foreground group-hover:text-electric transition-colors">
                                {entry.project_name}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {entry.client_name} • {entry.user_name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {entry.cost_center_code}
                              </Badge>
                              <span className="text-lg font-bold font-mono text-electric">{entry.hours}h</span>
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground mb-3">{entry.notes}</p>

                          <div className="flex items-center justify-between">
                            <Badge className="capitalize bg-electric/20 text-electric border-electric/30">
                              {entry.activity_type_name}
                            </Badge>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-8">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
