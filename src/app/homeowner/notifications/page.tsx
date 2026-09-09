'use client';

import React, { useState, useEffect } from 'react';
import HomeownerLayout from '../layout';
import { Bell, CheckCheck, DollarSign, FileText, MessageSquare, Home, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  payout_processed: <DollarSign size={14} className="text-success" />,
  payout_failed: <DollarSign size={14} className="text-danger" />,
  statement_ready: <FileText size={14} className="text-primary" />,
  request_status_change: <MessageSquare size={14} className="text-blue-500" />,
  booking_confirmed: <Home size={14} className="text-success" />,
  booking_cancelled: <Home size={14} className="text-danger" />,
  document_signed: <FileText size={14} className="text-emerald-600" />,
  info: <Bell size={14} className="text-primary" />,
  warning: <Bell size={14} className="text-warning" />,
  success: <Bell size={14} className="text-success" />,
};

const TYPE_BG: Record<string, string> = {
  payout_processed: 'bg-success/10',
  payout_failed: 'bg-danger/10',
  statement_ready: 'bg-primary/10',
  request_status_change: 'bg-blue-50',
  booking_confirmed: 'bg-success/10',
  booking_cancelled: 'bg-danger/10',
  document_signed: 'bg-emerald-50',
  info: 'bg-primary/10',
  warning: 'bg-warning/10',
  success: 'bg-success/10',
};

export default function HomeownerNotificationsPage() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { setLoading(false); return; }

    // Query app_notifications (the actual table name in this project)
    const { data } = await supabase
      .from('app_notifications')
      .select('*')
      .eq('user_id', userRes.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setNotifications(data);
    setLoading(false);
  }

  async function markAllRead() {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return;
    await supabase
      .from('app_notifications')
      .update({ read: true })
      .eq('user_id', userRes.user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await supabase.from('app_notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <HomeownerLayout>
      <div className="p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary text-white">{unreadCount}</span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Payout updates, booking alerts, and request status changes</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg hover:bg-muted transition-all">
              <RefreshCw size={14} className="text-muted-foreground" />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {(['all', 'unread'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${
                filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'unread' ? `Unread (${unreadCount})` : 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 sm:p-12 text-center">
            <Bell size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              You will be notified here when payouts are processed, bookings change, or requests are updated.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(n => {
              const iconBg = TYPE_BG[n.type] || 'bg-muted';
              const icon = TYPE_ICON[n.type] || <Bell size={14} className="text-muted-foreground" />;
              return (
                <div
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`bg-card border rounded-xl p-4 flex items-start gap-3 cursor-pointer transition-all hover:bg-muted/30 ${
                    n.read ? 'border-border opacity-70' : 'border-primary/20 bg-primary/2'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</p>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </div>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </HomeownerLayout>
  );
}
