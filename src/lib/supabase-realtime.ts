/**
 * Supabase Realtime Utilities
 * 
 * Provides hooks and utilities for subscribing to real-time database changes
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeSubscriptionOptions {
  table: string;
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time changes on a Supabase table
 */
export function useRealtimeSubscription(options: RealtimeSubscriptionOptions) {
  const {
    table,
    filter,
    onInsert,
    onUpdate,
    onDelete,
    enabled = true,
  } = options;

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Create channel name
    const channelName = filter 
      ? `${table}:${filter.replace(/[^a-zA-Z0-9]/g, '_')}`
      : `realtime:${table}`;

    // Create subscription
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: filter,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && onInsert) {
            onInsert(payload);
          } else if (payload.eventType === 'UPDATE' && onUpdate) {
            onUpdate(payload);
          } else if (payload.eventType === 'DELETE' && onDelete) {
            onDelete(payload);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, filter, enabled, onInsert, onUpdate, onDelete]);

  return channelRef.current;
}

/**
 * Hook to subscribe to timesheets changes
 */
export function useTimesheetsRealtime(
  onUpdate?: (timesheet: any) => void,
  filters?: { project_id?: string; user_id?: string }
) {
  const filter = filters?.project_id 
    ? `project_id=eq.${filters.project_id}`
    : filters?.user_id
    ? `user_id=eq.${filters.user_id}`
    : undefined;

  return useRealtimeSubscription({
    table: 'timesheets',
    filter,
    onInsert: onUpdate,
    onUpdate,
    onDelete: (payload) => {
      // Handle delete if needed
      console.log('Timesheet deleted:', payload.old);
    },
  });
}

/**
 * Hook to subscribe to projects changes
 */
export function useProjectsRealtime(
  onUpdate?: (project: any) => void,
  filters?: { client_id?: string; status?: string }
) {
  const filter = filters?.client_id
    ? `client_id=eq.${filters.client_id}`
    : filters?.status
    ? `status=eq.${filters.status}`
    : undefined;

  return useRealtimeSubscription({
    table: 'projects',
    filter,
    onInsert: onUpdate,
    onUpdate,
    onDelete: (payload) => {
      console.log('Project deleted:', payload.old);
    },
  });
}

/**
 * Hook to subscribe to clients changes
 */
export function useClientsRealtime(onUpdate?: (client: any) => void) {
  return useRealtimeSubscription({
    table: 'clients',
    onInsert: onUpdate,
    onUpdate,
    onDelete: (payload) => {
      console.log('Client deleted:', payload.old);
    },
  });
}

/**
 * Hook to subscribe to xero_invoices changes (for sync status)
 */
export function useXeroInvoicesRealtime(
  onUpdate?: (invoice: any) => void,
  filters?: { client_id?: string; sync_status?: string }
) {
  const filter = filters?.client_id
    ? `client_id=eq.${filters.client_id}`
    : filters?.sync_status
    ? `sync_status=eq.${filters.sync_status}`
    : undefined;

  return useRealtimeSubscription({
    table: 'xero_invoices',
    filter,
    onInsert: onUpdate,
    onUpdate,
  });
}

/**
 * Subscribe to a specific invoice's sync status changes
 */
export function useInvoiceSyncStatusRealtime(
  invoiceId: string,
  onStatusChange: (status: string) => void
) {
  return useRealtimeSubscription({
    table: 'xero_invoices',
    filter: `id=eq.${invoiceId}`,
    onUpdate: (payload) => {
      const newStatus = payload.new?.sync_status;
      if (newStatus) {
        onStatusChange(newStatus);
      }
    },
  });
}
