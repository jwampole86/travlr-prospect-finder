'use client';

import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { runScheduledSyncs, ensureSyncSchedules } from '@/lib/services/syncSchedulerService';

/**
 * Invisible component that runs in AppLayout.
 * Initializes sync schedules and runs the 4-hour automated sync loop.
 */
export default function SyncSchedulerRunner() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!user || ranRef.current) return;
    ranRef.current = true;

    async function init() {
      try {
        await ensureSyncSchedules(user.id);
        await runScheduledSyncs(user.id, (type, title, message) => {
          addNotification({ type: type as any, title, message });
        });
      } catch {
        // silent — don't break the app if sync fails
      }
    }

    init();

    // Re-run every 15 minutes to check if any source is due
    const interval = setInterval(() => {
      runScheduledSyncs(user.id, (type, title, message) => {
        addNotification({ type: type as any, title, message });
      }).catch(() => {});
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, addNotification]);

  return null;
}
