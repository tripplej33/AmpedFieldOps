import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AppNotification, ErrorLogEntry, NotificationType } from '@/types';
import { setErrorLogCallback } from '@/lib/api';

interface NotificationContextType {
  notifications: AppNotification[];
  errorLogs: ErrorLogEntry[];
  unreadCount: number;
  addNotification: (notification: Omit<AppNotification, 'id' | 'read' | 'created_at'>) => void;
  notifySuccess: (title: string, message: string, action?: AppNotification['action']) => void;
  notifyWarning: (title: string, message: string, action?: AppNotification['action']) => void;
  notifyInfo: (title: string, message: string, action?: AppNotification['action']) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
  logError: (error: Omit<ErrorLogEntry, 'id' | 'created_at'>) => void;
  clearErrorLogs: () => void;
  exportErrorLogs: (format?: 'json' | 'csv') => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const NOTIFICATIONS_KEY = 'app_notifications';
const ERROR_LOGS_KEY = 'app_error_logs';
const MAX_NOTIFICATIONS = 50;
const MAX_ERROR_LOGS = 200;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>(() => {
    try {
      const stored = localStorage.getItem(ERROR_LOGS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist notifications
  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  }, [notifications]);

  // Persist error logs
  useEffect(() => {
    localStorage.setItem(ERROR_LOGS_KEY, JSON.stringify(errorLogs.slice(0, MAX_ERROR_LOGS)));
  }, [errorLogs]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'read' | 'created_at'>) => {
    const newNotification: AppNotification = {
      ...notification,
      id: crypto.randomUUID(),
      read: false,
      created_at: new Date().toISOString(),
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const notifySuccess = useCallback((title: string, message: string, action?: AppNotification['action']) => {
    addNotification({ type: 'success', title, message, action });
  }, [addNotification]);

  const notifyWarning = useCallback((title: string, message: string, action?: AppNotification['action']) => {
    addNotification({ type: 'warning', title, message, action });
  }, [addNotification]);

  const notifyInfo = useCallback((title: string, message: string, action?: AppNotification['action']) => {
    addNotification({ type: 'info', title, message, action });
  }, [addNotification]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const logError = useCallback((error: Omit<ErrorLogEntry, 'id' | 'created_at'>) => {
    const newError: ErrorLogEntry = {
      ...error,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setErrorLogs(prev => [newError, ...prev].slice(0, MAX_ERROR_LOGS));
    
    // Also add a notification for errors (but not for all API errors to avoid spam)
    if (error.type !== 'api' || error.message.includes('critical') || error.message.includes('failed')) {
      addNotification({
        type: 'error',
        title: error.type === 'network' ? 'Connection Error' : 'Error Occurred',
        message: error.message,
      });
    }
  }, [addNotification]);

  // Connect error logger to API client
  useEffect(() => {
    setErrorLogCallback(logError);
    return () => setErrorLogCallback(null);
  }, [logError]);

  const clearErrorLogs = useCallback(() => {
    setErrorLogs([]);
  }, []);

  const exportErrorLogs = useCallback((format: 'json' | 'csv' = 'json') => {
    let dataStr: string;
    let mimeType: string;
    let extension: string;

    if (format === 'csv') {
      // CSV export
      const headers = ['Date & Time', 'Type', 'Message', 'Endpoint', 'User', 'Details'];
      const rows = errorLogs.map(log => [
        new Date(log.created_at).toISOString(),
        log.type,
        `"${(log.message || '').replace(/"/g, '""')}"`,
        log.endpoint || '',
        log.user_name || '',
        `"${(log.details || '').replace(/"/g, '""')}"`,
      ]);
      dataStr = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      mimeType = 'text/csv';
      extension = 'csv';
    } else {
      // JSON export (created_at already includes timestamp as ISO string)
      dataStr = JSON.stringify(errorLogs, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }

    const dataUri = `data:${mimeType};charset=utf-8,` + encodeURIComponent(dataStr);
    // Format: error-logs-2024-01-15_14-30-45.json (readable with timestamp, UTC)
    const now = new Date();
    const isoString = now.toISOString(); // 2024-01-15T14:30:45.123Z
    const [dateStr, timeStr] = isoString.split('T');
    const timeWithoutMs = timeStr.split('.')[0].replace(/:/g, '-'); // 14-30-45
    const fileName = `error-logs-${dateStr}_${timeWithoutMs}.${extension}`;
    
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [errorLogs]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        errorLogs,
        unreadCount,
        addNotification,
        notifySuccess,
        notifyWarning,
        notifyInfo,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAllNotifications,
        logError,
        clearErrorLogs,
        exportErrorLogs,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
