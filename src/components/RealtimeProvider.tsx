'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { subscribeToAll, type RealtimeUpdate } from '@/lib/realtime/leadsRealtime';

interface RealtimeContextValue {
  isConnected: boolean;
  lastUpdate: RealtimeUpdate | null;
  recentUpdates: RealtimeUpdate[];
  clearUpdates: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  isConnected: false,
  lastUpdate: null,
  recentUpdates: [],
  clearUpdates: () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

const MAX_RECENT = 20;

export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<RealtimeUpdate[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);

  const handleUpdate = useCallback(
    (update: RealtimeUpdate) => {
      setLastUpdate(update);
      setRecentUpdates((prev) => [update, ...prev].slice(0, MAX_RECENT));

      // Surface meaningful notifications
      switch (update.type) {
        case 'new_lead': {
          const address = String(update.record?.address ?? 'Unknown address');
          const source = String(update.record?.source ?? '');
          addNotification({
            type: 'new_lead',
            title: 'New lead arrived',
            message: `${address}${source ? ` from ${source}` : ''} just added.`,
          });
          break;
        }
        case 'lead_stage_change': {
          const addr = String(update.record?.address ?? 'A lead');
          const from = String(update.oldRecord?.stage ?? '');
          const to = String(update.record?.stage ?? '');
          if (from && to && from !== to) {
            addNotification({
              type: 'info',
              title: 'Lead stage changed',
              message: `${addr} moved from "${from}" to "${to}".`,
            });
          }
          break;
        }
        case 'workflow_trigger': {
          const wfName = String(update.record?.workflow_name ?? update.record?.name ?? 'Workflow');
          addNotification({
            type: 'info',
            title: 'Workflow triggered',
            message: `${wfName} activity logged.`,
          });
          break;
        }
        case 'new_contact': {
          addNotification({
            type: 'info',
            title: 'Contact activity',
            message: 'New contact history entry recorded.',
          });
          break;
        }
        case 'interview_reminder': {
          const candidate = String(update.record?.candidate_name ?? 'A candidate');
          const role = String(update.record?.role_title ?? '');
          const status = String(update.record?.status ?? '');
          const oldStatus = String(update.oldRecord?.status ?? '');

          if (!update.oldRecord) {
            // New interview scheduled
            addNotification({
              type: 'info',
              title: '📅 Interview Scheduled',
              message: `${candidate}${role ? ` for ${role}` : ''} has been scheduled.`,
            });
          } else if (status !== oldStatus) {
            const statusLabels: Record<string, string> = {
              in_progress: '▶️ Interview Started',
              completed: '✅ Interview Completed',
              cancelled: '❌ Interview Cancelled',
            };
            const title = statusLabels[status] || '🔔 Interview Updated';
            addNotification({
              type: status === 'cancelled' ? 'error' : 'info',
              title,
              message: `${candidate}${role ? ` — ${role}` : ''}.`,
            });
          }
          break;
        }
        case 'deal_alert': {
          const dealAddr = String(update.record?.address ?? update.record?.property_address ?? 'A property');
          const dealStatus = String(update.record?.status ?? '');
          const oldDealStatus = String(update.oldRecord?.status ?? '');

          if (!update.oldRecord) {
            addNotification({
              type: 'info',
              title: '🏠 Deal Closed',
              message: `New closed deal recorded for ${dealAddr}.`,
            });
          } else if (dealStatus !== oldDealStatus) {
            addNotification({
              type: 'info',
              title: '🔔 Deal Updated',
              message: `${dealAddr} status changed to "${dealStatus}".`,
            });
          }
          break;
        }
        case 'task_update': {
          const taskTitle = String(update.record?.title ?? 'A task');
          const taskStatus = String(update.record?.status ?? '');
          const oldTaskStatus = String(update.oldRecord?.status ?? '');

          if (!update.oldRecord) {
            addNotification({
              type: 'info',
              title: '📋 New Task Assigned',
              message: `"${taskTitle}" has been assigned to you.`,
            });
          } else if (taskStatus !== oldTaskStatus) {
            const isDone = taskStatus === 'completed' || taskStatus === 'done';
            addNotification({
              type: isDone ? 'info' : 'info',
              title: isDone ? '✅ Task Completed' : '🔔 Task Updated',
              message: `"${taskTitle}" is now ${taskStatus}.`,
            });
          }
          break;
        }
        default:
          break;
      }
    },
    [addNotification]
  );

  useEffect(() => {
    if (!user?.id) return;

    // Clean up previous subscription
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    const unsub = subscribeToAll(user.id, handleUpdate);
    unsubRef.current = unsub;
    setIsConnected(true);

    return () => {
      unsub();
      unsubRef.current = null;
      setIsConnected(false);
    };
  }, [user?.id, handleUpdate]);

  const clearUpdates = useCallback(() => {
    setRecentUpdates([]);
    setLastUpdate(null);
  }, []);

  return (
    <RealtimeContext.Provider value={{ isConnected, lastUpdate, recentUpdates, clearUpdates }}>
      {children}
    </RealtimeContext.Provider>
  );
}
