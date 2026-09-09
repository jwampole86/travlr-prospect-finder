'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AppNotification {
  id: string;
  type: 'email_sent' | 'sync_health' | 'failed_cadence' | 'new_lead' | 'info' | 'warning' | 'error' | 'workflow_send' | 'stage_change' | 'sync_failure' | 'manual_recovery' | 'sync_complete_portfolio' | 'enrichment_stage2_complete' | 'enrichment_stage3_complete';
  alert_type?: string | null;
  title: string;
  message: string;
  read: boolean;
  archived?: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  addNotification: (n: Omit<AppNotification, 'id' | 'read' | 'created_at'>) => Promise<void>;
  clearAll: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

const ICONS: Record<string, string> = {
  email_sent: '✉️',
  sync_health: '🔄',
  failed_cadence: '⚠️',
  new_lead: '🎯',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  sync_complete_portfolio: '✅',
  enrichment_stage2_complete: '🔬',
  enrichment_stage3_complete: '🏆',
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const initialLoadDone = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('app_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) {
      setNotifications(data as AppNotification[]);
      initialLoadDone.current = true;
    }
  }, [user, supabase]);

  // Initial load
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription — replaces polling
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => {
            // Avoid duplicates
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });
          // Only toast after initial load is done (avoid toasting on mount)
          if (initialLoadDone.current) {
            toast(newNotif.title, {
              description: newNotif.message,
              icon: ICONS[newNotif.type] || 'ℹ️',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as AppNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'app_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  const addNotification = useCallback(async (n: Omit<AppNotification, 'id' | 'read' | 'created_at'>) => {
    if (!user) return;
    // Insert only — the realtime subscription will pick it up and update state + show toast
    await supabase.from('app_notifications').insert({
      user_id: user.id,
      type: n.type,
      title: n.title,
      message: n.message,
      metadata: n.metadata || null,
      read: false,
    });
  }, [user, supabase]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from('app_notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, [supabase]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase.from('app_notifications').update({ read: true }).eq('user_id', user.id).eq('read', false).eq('archived', false);
    setNotifications((prev) => prev.map((n) => (!n.archived ? { ...n, read: true } : n)));
  }, [user, supabase]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await supabase.from('app_notifications').delete().eq('user_id', user.id);
    setNotifications([]);
  }, [user, supabase]);

  const unreadCount = notifications.filter((n) => !n.read && !n.archived).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, drawerOpen, setDrawerOpen, markAllRead, markRead, addNotification, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}
