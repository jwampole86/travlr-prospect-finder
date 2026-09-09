'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X, CheckCheck, Trash2, Mail, RefreshCw, AlertTriangle, Target, Info, CheckCircle, FlaskConical, Trophy } from 'lucide-react';
import { useNotifications, AppNotification } from '@/contexts/NotificationContext';
import { useRouter } from 'next/navigation';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function NotifIcon({ type }: { type: AppNotification['type'] }) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center shrink-0';
  if (type === 'email_sent') return <div className={`${base} bg-blue-500/10`}><Mail size={14} className="text-blue-500" /></div>;
  if (type === 'sync_health') return <div className={`${base} bg-success/10`}><RefreshCw size={14} className="text-success" /></div>;
  if (type === 'sync_complete_portfolio') return <div className={`${base} bg-emerald-500/10`}><CheckCircle size={14} className="text-emerald-500" /></div>;
  if (type === 'enrichment_stage2_complete') return <div className={`${base} bg-violet-500/10`}><FlaskConical size={14} className="text-violet-500" /></div>;
  if (type === 'enrichment_stage3_complete') return <div className={`${base} bg-amber-500/10`}><Trophy size={14} className="text-amber-500" /></div>;
  if (type === 'failed_cadence') return <div className={`${base} bg-warning/10`}><AlertTriangle size={14} className="text-warning" /></div>;
  if (type === 'new_lead') return <div className={`${base} bg-primary/10`}><Target size={14} className="text-primary" /></div>;
  if (type === 'error') return <div className={`${base} bg-danger/10`}><AlertTriangle size={14} className="text-danger" /></div>;
  return <div className={`${base} bg-muted`}><Info size={14} className="text-muted-foreground" /></div>;
}

export function BellButton() {
  const { unreadCount, setDrawerOpen } = useNotifications();
  return (
    <button
      onClick={() => setDrawerOpen(true)}
      className="relative flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
      title="Notifications"
    >
      <Bell size={16} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-danger text-[9px] font-bold text-white flex items-center justify-center leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default function NotificationDrawer() {
  const { notifications, drawerOpen, setDrawerOpen, markAllRead, markRead, clearAll, unreadCount } = useNotifications();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (drawerOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  function handleNotifClick(n: AppNotification) {
    if (!n.read) markRead(n.id);
    const link = n.metadata?.link as string | undefined;
    if (link) {
      setDrawerOpen(false);
      router.push(link);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setDrawerOpen(false)}
      />
      {/* Drawer */}
      <div className={`fixed right-0 top-0 bottom-0 z-50 w-[380px] bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-220 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20 font-semibold">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Mark all read"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-danger hover:bg-danger/5 transition-all"
                title="Clear all"
              >
                <Trash2 size={12} />
              </button>
            )}
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Bell size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground">Email confirmations, sync alerts, and new leads will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const hasLink = !!(n.metadata?.link as string | undefined);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 ${!n.read ? 'bg-primary/3' : ''} ${hasLink ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <NotifIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      {hasLink && (
                        <p className="text-[10px] text-primary mt-1 font-medium">View assigned leads →</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            {notifications.length} total · {unreadCount} unread
          </p>
        </div>
      </div>
    </>
  );
}
