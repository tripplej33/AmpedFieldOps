import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, X, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useNotifications } from '@/contexts/NotificationContext';
import { AppNotification } from '@/types';
import { cn } from '@/lib/utils';

const notificationIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

const notificationColors = {
  info: 'text-electric',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
};

function NotificationItem({
  notification,
  onMarkRead,
  onClear,
}: {
  notification: AppNotification;
  onMarkRead: () => void;
  onClear: () => void;
}) {
  const navigate = useNavigate();
  const Icon = notificationIcons[notification.type];
  const colorClass = notificationColors[notification.type];

  const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead();
    }
    if (notification.action?.href) {
      navigate(notification.action.href);
    } else if (notification.action?.onClick) {
      notification.action.onClick();
    }
  };

  return (
    <div
      className={cn(
        'relative p-3 border-b border-border hover:bg-muted/30 transition-colors cursor-pointer',
        !notification.read && 'bg-muted/20'
      )}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        <div className={cn('flex-shrink-0 mt-0.5', colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', !notification.read && 'font-semibold')}>
            {notification.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
            {timeAgo(notification.created_at)}
          </p>
          {notification.action && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 mt-1 text-electric text-xs"
            >
              {notification.action.label}
            </Button>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col gap-1">
          {!notification.read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead();
              }}
            >
              <Check className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {!notification.read && (
        <span className="absolute top-3 right-3 w-2 h-2 bg-electric rounded-full" />
      )}
    </div>
  );
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
  } = useNotifications();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-warning text-background text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:w-[400px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-bold flex items-center gap-2">
              <Bell className="w-5 h-5 text-electric" />
              Notifications
              {unreadCount > 0 && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono">
                  {unreadCount} new
                </span>
              )}
            </SheetTitle>
          </div>
          {notifications.length > 0 && (
            <div className="flex gap-2 mt-2">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs"
                >
                  <CheckCheck className="w-3 h-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllNotifications}
                className="text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear all
              </Button>
            </div>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">No notifications</p>
              <p className="text-xs mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={() => markAsRead(notification.id)}
                  onClear={() => clearNotification(notification.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
