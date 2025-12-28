import { useState } from 'react';
import { AlertCircle, Download, Trash2, ChevronDown, ChevronUp, Bug, Network, Lock, Server, HelpCircle, FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useNotifications } from '@/contexts/NotificationContext';
import { ErrorLogEntry } from '@/types';
import { cn } from '@/lib/utils';

const errorTypeIcons = {
  api: Server,
  client: Bug,
  auth: Lock,
  network: Network,
  unknown: HelpCircle,
};

const errorTypeColors = {
  api: 'bg-red-500/10 text-red-500 border-red-500/30',
  client: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  auth: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  network: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
  unknown: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
};

function ErrorLogItem({ error }: { error: ErrorLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = errorTypeIcons[error.type];

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-AU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-start gap-3 p-3 hover:bg-muted/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn('flex-shrink-0 p-1.5 rounded-md border', errorTypeColors[error.type])}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-[10px] uppercase', errorTypeColors[error.type])}>
              {error.type}
            </Badge>
            {error.endpoint && (
              <span className="text-[10px] font-mono text-muted-foreground truncate">
                {error.endpoint}
              </span>
            )}
          </div>
          <p className="text-sm mt-1 line-clamp-2">{error.message}</p>
          <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
            {formatDate(error.created_at)}
            {error.user_name && ` • ${error.user_name}`}
          </p>
        </div>
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-2 overflow-x-auto">
            {error.details && (
              <div>
                <span className="text-muted-foreground">Details:</span>
                <pre className="mt-1 whitespace-pre-wrap break-all">{error.details}</pre>
              </div>
            )}
            {error.stack && (
              <div>
                <span className="text-muted-foreground">Stack Trace:</span>
                <pre className="mt-1 whitespace-pre-wrap break-all text-destructive/80">{error.stack}</pre>
              </div>
            )}
            {!error.details && !error.stack && (
              <span className="text-muted-foreground">No additional details available</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ErrorLogPanel() {
  const [open, setOpen] = useState(false);
  const { errorLogs, clearErrorLogs, exportErrorLogs } = useNotifications();

  const errorCount = errorLogs.length;
  const recentErrorCount = errorLogs.filter(
    (e) => new Date().getTime() - new Date(e.created_at).getTime() < 3600000
  ).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <AlertCircle className="w-5 h-5" />
          {recentErrorCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {recentErrorCount > 99 ? '99+' : recentErrorCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:w-[500px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Error Log
              {errorCount > 0 && (
                <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-mono">
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              )}
            </SheetTitle>
          </div>
          {errorCount > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportErrorLogs('json')}
                className="text-xs"
              >
                <FileJson className="w-3 h-3 mr-1" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportErrorLogs('csv')}
                className="text-xs"
              >
                <FileSpreadsheet className="w-3 h-3 mr-1" />
                Export CSV
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear Error Logs</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to clear all error logs? This action cannot be undone.
                      Consider exporting the logs first.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={clearErrorLogs}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1">
          {errorCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">No errors logged</p>
              <p className="text-xs mt-1">The system is running smoothly</p>
            </div>
          ) : (
            <div>
              {errorLogs.map((error) => (
                <ErrorLogItem key={error.id} error={error} />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
