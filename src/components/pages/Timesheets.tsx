import { useState } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockTimesheetEntries, mockProjects, mockClients } from '@/lib/mockData';
import { TimesheetEntry, ActivityType } from '@/types';
import { Plus, Calendar, Clock, Wrench, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const activityIcons: Record<ActivityType, React.ElementType> = {
  installation: Wrench,
  repair: Wrench,
  maintenance: CheckCircle,
  inspection: CheckCircle,
  consultation: Pencil,
};

const activityColors: Record<ActivityType, string> = {
  installation: 'text-electric border-electric/30 bg-electric/10',
  repair: 'text-warning border-warning/30 bg-warning/10',
  maintenance: 'text-voltage border-voltage/30 bg-voltage/10',
  inspection: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  consultation: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
};

export default function Timesheets() {
  const [entries] = useState<TimesheetEntry[]>(mockTimesheetEntries);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Group entries by date
  const groupedEntries = entries.reduce((acc, entry) => {
    const date = entry.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, TimesheetEntry[]>);

  const dates = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

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
              Total Hours: <span className="text-foreground font-bold">47.5</span>
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
              const totalHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
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
          {dates.map((date) => {
            const dateEntries = groupedEntries[date];
            const totalHours = dateEntries.reduce((sum, e) => sum + e.hours, 0);

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
                  {dateEntries.map((entry) => {
                    const ActivityIcon = activityIcons[entry.activityType];
                    return (
                      <Card
                        key={entry.id}
                        className="p-4 bg-card border-border hover:border-electric transition-all group"
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-lg border flex items-center justify-center',
                              activityColors[entry.activityType]
                            )}
                          >
                            <ActivityIcon className="w-5 h-5" />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-semibold text-foreground group-hover:text-electric transition-colors">
                                  {entry.projectName}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {entry.clientName} • {entry.userName}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono">
                                  {entry.costCenter}
                                </Badge>
                                <span className="text-lg font-bold font-mono text-electric">{entry.hours}h</span>
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground mb-3">{entry.notes}</p>

                            <div className="flex items-center justify-between">
                              <Badge className={cn('capitalize', activityColors[entry.activityType])}>
                                {entry.activityType}
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
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
