'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { Inbox, Mail, RefreshCw, AlertTriangle, Target, Info, CheckCheck, Archive, Trash2, Filter, Loader2, Bell, X, RotateCcw,  } from 'lucide-react';
import { toast } from 'sonner';

interface AlertItem {
  id: string;
  type: string;
  alert_type: string | null;
  title: string;
  message: string;
  read: boolean;
  archived: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

type AlertFilter = 'all' | 'unread' | 'workflow_send' | 'stage_change' | 'sync_failure' | 'manual_recovery' | 'archived';

const FILTER_OPTIONS: { value: AlertFilter; label: string }[] = [
  { value: 'all', label: 'All Alerts' },
  { value: 'unread', label: 'Unread' },
  { value: 'workflow_send', label: 'Workflow Sends' },
  { value: 'stage_change', label: 'Stage Changes' },
  { value: 'sync_failure', label: 'Sync Failures' },
  { value: 'manual_recovery', label: 'Recovery Needed' },
  { value: 'archived', label: 'Archived' },
];

function AlertIcon({ type, alertType }: { type: string; alertType: string | null }) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center shrink-0';
  const t = alertType ?? type;
  if (t === 'workflow_send' || t === 'email_sent') return <div className={`${base} bg-blue-500/10`}><Mail size={14} className="text-blue-500" /></div>;
  if (t === 'stage_change') return <div className={`${base} bg-primary/10`}><Target size={14} className="text-primary" /></div>;
  if (t === 'sync_failure' || t === 'sync_health') return <div className={`${base} bg-warning/10`}><RefreshCw size={14} className="text-warning" /></div>;
  if (t === 'manual_recovery' || t === 'failed_cadence') return <div className={`${base} bg-danger/10`}><AlertTriangle size={14} className="text-danger" /></div>;
  if (t === 'new_lead') return <div className={`${base} bg-success/10`}><Target size={14} className="text-success" /></div>;
  if (t === 'error') return <div className={`${base} bg-danger/10`}><AlertTriangle size={14} className="text-danger" /></div>;
  return <div className={`${base} bg-muted`}><Info size={14} className="text-muted-foreground" /></div>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsInboxPage() {
  const { user } = useAuth();
  const { loadNotifications: refreshCtx } = useNotifications() as unknown as { loadNotifications?: () => void };
  const supabase = createClient();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('app_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setAlerts((data || []) as AlertItem[]);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = alerts.filter((a) => {
    if (filter === 'archived') return a.archived;
    if (a.archived) return false;
    if (filter === 'unread') return !a.read;
    if (filter === 'all') return true;
    const t = a.alert_type ?? a.type;
    return t === filter;
  });

  const unreadCount = alerts.filter((a) => !a.read && !a.archived).length;

  async function markRead(id: string) {
    await supabase.from('app_notifications').update({ read: true }).eq('id', id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
  }

  async function archiveAlert(id: string) {
    await supabase.from('app_notifications').update({ archived: true, read: true }).eq('id', id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, archived: true, read: true } : a));
    toast.success('Alert archived');
  }

  async function unarchiveAlert(id: string) {
    await supabase.from('app_notifications').update({ archived: false }).eq('id', id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, archived: false } : a));
    toast.success('Alert restored');
  }

  async function deleteAlert(id: string) {
    await supabase.from('app_notifications').delete().eq('id', id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from('app_notifications').update({ read: true }).eq('user_id', user.id).eq('read', false).eq('archived', false);
    setAlerts((prev) => prev.map((a) => (!a.archived ? { ...a, read: true } : a)));
    toast.success('All alerts marked as read');
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkArchive() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    await supabase.from('app_notifications').update({ archived: true, read: true }).in('id', ids);
    setAlerts((prev) => prev.map((a) => ids.includes(a.id) ? { ...a, archived: true, read: true } : a));
    setSelectedIds(new Set());
    toast.success(`${ids.length} alert(s) archived`);
    setBulkLoading(false);
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    await supabase.from('app_notifications').delete().in('id', ids);
    setAlerts((prev) => prev.filter((a) => !ids.includes(a.id)));
    setSelectedIds(new Set());
    toast.success(`${ids.length} alert(s) deleted`);
    setBulkLoading(false);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Inbox size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Alerts Inbox</h1>
              <p className="text-xs text-muted-foreground">Real-time alerts for workflow sends, stage changes, sync failures, and recovery actions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20 font-semibold">
                {unreadCount} unread
              </span>
            )}
            <button
              onClick={load}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border bg-card/50 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setFilter(opt.value); setSelectedIds(new Set()); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                  filter === opt.value
                    ? 'bg-primary text-white' :'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border bg-primary/5 shrink-0">
            <span className="text-xs font-medium text-foreground">{selectedIds.size} selected</span>
            <button onClick={bulkArchive} disabled={bulkLoading} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-xs text-foreground hover:bg-muted/80 transition-all disabled:opacity-50">
              {bulkLoading ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
              Archive
            </button>
            <button onClick={bulkDelete} disabled={bulkLoading} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-danger/10 text-xs text-danger hover:bg-danger/20 transition-all disabled:opacity-50">
              <Trash2 size={11} />
              Delete
            </button>
            <button onClick={clearSelection} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Bell size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {filter === 'archived' ? 'No archived alerts' : 'No alerts'}
              </p>
              <p className="text-xs text-muted-foreground">
                {filter === 'all' ?'Workflow sends, stage changes, sync failures, and recovery alerts will appear here.'
                  : `No ${FILTER_OPTIONS.find((o) => o.value === filter)?.label?.toLowerCase()} alerts found.`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Select all row */}
              {filtered.length > 1 && (
                <div className="flex items-center gap-3 px-6 py-2 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length}
                    onChange={() => selectedIds.size === filtered.length ? clearSelection() : selectAll()}
                    className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer"
                  />
                  <span className="text-[11px] text-muted-foreground">Select all {filtered.length}</span>
                </div>
              )}
              {filtered.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex gap-3 px-6 py-4 transition-colors hover:bg-muted/30 ${!alert.read && !alert.archived ? 'bg-primary/3' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(alert.id)}
                    onChange={() => toggleSelect(alert.id)}
                    className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer mt-1 shrink-0"
                  />
                  <div
                    className="cursor-pointer"
                    onClick={() => !alert.read && markRead(alert.id)}
                  >
                    <AlertIcon type={alert.type} alertType={alert.alert_type} />
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !alert.read && markRead(alert.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!alert.read && !alert.archived ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                        {alert.title}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!alert.read && !alert.archived && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                        <span className="text-[10px] text-muted-foreground/70">{timeAgo(alert.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.message}</p>
                    {(alert.alert_type ?? alert.type) && (
                      <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                        {(alert.alert_type ?? alert.type).replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!alert.archived ? (
                      <button
                        onClick={() => archiveAlert(alert.id)}
                        title="Archive"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                      >
                        <Archive size={13} />
                      </button>
                    ) : (
                      <button
                        onClick={() => unarchiveAlert(alert.id)}
                        title="Restore"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      title="Delete"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/5 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-border bg-muted/20 shrink-0">
          <p className="text-[11px] text-muted-foreground">
            {alerts.filter((a) => !a.archived).length} active · {alerts.filter((a) => a.archived).length} archived · {unreadCount} unread
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
