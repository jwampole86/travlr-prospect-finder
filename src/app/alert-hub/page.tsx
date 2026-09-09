'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { XCircle, RefreshCw, Shield, Zap, ChevronDown, ChevronRight, RotateCcw, ExternalLink, Loader2, CheckCircle, Bell, Filter, Radio } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertCategory = 'batch_failure' | 'delivery_error' | 'sync_issue' | 'tcpa_violation' | 'webhook_error';

interface AlertHubItem {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  summary: string;
  affected_count: number;
  affected_leads: { id: string; name: string; phone?: string }[];
  portfolio?: string;
  agent?: string;
  sequence?: string;
  error_code?: string;
  retryable: boolean;
  retried: boolean;
  resolved: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const CATEGORY_CONFIG: Record<AlertCategory, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  batch_failure: { label: 'Batch Failure', icon: <Zap size={13} />, color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  delivery_error: { label: 'Delivery Error', icon: <XCircle size={13} />, color: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  sync_issue: { label: 'Sync Issue', icon: <RefreshCw size={13} />, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  tcpa_violation: { label: 'TCPA Violation', icon: <Shield size={13} />, color: 'text-purple-600', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  webhook_error: { label: 'Webhook Error', icon: <Radio size={13} />, color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

const SEVERITY_CONFIG: Record<AlertSeverity, { label: string; dot: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500' },
  warning: { label: 'Warning', dot: 'bg-amber-500' },
  info: { label: 'Info', dot: 'bg-blue-500' },
};

// Valid AlertCategory values for type-guard
const VALID_CATEGORIES: AlertCategory[] = ['batch_failure', 'delivery_error', 'sync_issue', 'tcpa_violation', 'webhook_error'];

/**
 * Maps a DB notification type value to an AlertCategory.
 * Priority: use the dedicated `category` column if present and valid,
 * otherwise derive from the `type` column.
 */
function mapToAlertCategory(dbType: string, dbCategory?: string | null): AlertCategory {
  // Use the dedicated category column if it's a valid AlertCategory
  if (dbCategory && VALID_CATEGORIES.includes(dbCategory as AlertCategory)) {
    return dbCategory as AlertCategory;
  }
  // Fall back to type-based mapping
  switch (dbType) {
    case 'sync_failure': case'sync_error': case'sync_stalled':
      return 'sync_issue';
    case 'batch_failure': case'batch_error':
      return 'batch_failure';
    case 'tcpa_violation': case'tcpa_warning':
      return 'tcpa_violation';
    case 'webhook_error': case'webhook_failure':
      return 'webhook_error';
    case 'error': case'failed_cadence': case'delivery_error': case'sms_failed': case'manual_recovery':
    default:
      return 'delivery_error';
  }
}

/**
 * Derives a severity from the notification type/category.
 */
function mapToSeverity(dbType: string, category: AlertCategory): AlertSeverity {
  if (category === 'tcpa_violation') return 'critical';
  if (category === 'batch_failure') return 'critical';
  if (dbType === 'error' || dbType === 'sync_failure') return 'warning';
  return 'warning';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface AlertCardProps {
  alert: AlertHubItem;
  onRetry: (id: string) => void;
  onResolve: (id: string) => void;
  retrying: boolean;
}

function AlertCard({ alert, onRetry, onResolve, retrying }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CONFIG[alert.category];
  const sev = SEVERITY_CONFIG[alert.severity];

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${alert.resolved ? 'opacity-60 border-border' : `border-l-4 ${cat.border} border-t border-r border-b border-border`}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cat.bg}`}>
          <span className={cat.color}>{cat.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cat.bg} ${cat.color}`}>
              {cat.label}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            {alert.resolved && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                <CheckCircle size={10} /> Resolved
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(alert.created_at)}</span>
          </div>
          <p className="text-sm font-semibold text-foreground mt-1">{alert.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{alert.summary}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {alert.affected_count > 0 && (
              <span className="text-[10px] text-muted-foreground">{alert.affected_count} affected lead{alert.affected_count !== 1 ? 's' : ''}</span>
            )}
            {alert.portfolio && <span className="text-[10px] text-muted-foreground">· {alert.portfolio}</span>}
            {alert.agent && <span className="text-[10px] text-muted-foreground">· {alert.agent}</span>}
            {alert.error_code && <span className="text-[10px] font-mono text-muted-foreground">· Code {alert.error_code}</span>}
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {alert.affected_leads.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Affected Leads</p>
              <div className="space-y-1.5">
                {alert.affected_leads.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-xs font-medium text-foreground">{lead.name}</p>
                      {lead.phone && <p className="text-[10px] text-muted-foreground">{lead.phone}</p>}
                    </div>
                    <Link
                      href={`/lead-profile?id=${lead.id}`}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      View <ExternalLink size={10} />
                    </Link>
                  </div>
                ))}
                {alert.affected_count > alert.affected_leads.length && (
                  <p className="text-[10px] text-muted-foreground px-1">+{alert.affected_count - alert.affected_leads.length} more leads</p>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Details</p>
            <p className="text-xs text-foreground/80">{alert.summary}</p>
          </div>

          {!alert.resolved && (
            <div className="flex items-center gap-2 pt-1">
              {alert.retryable && (
                <button
                  onClick={() => onRetry(alert.id)}
                  disabled={retrying || alert.retried}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {retrying ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  {alert.retried ? 'Retried' : 'Retry Now'}
                </button>
              )}
              <button
                onClick={() => onResolve(alert.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <CheckCircle size={11} />
                Mark Resolved
              </button>
              {alert.sequence && (
                <Link
                  href="/sms-delivery"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  <ExternalLink size={11} />
                  SMS Delivery
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type CategoryFilter = 'all' | AlertCategory;

const FILTER_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'batch_failure', label: 'Batch Failures' },
  { value: 'delivery_error', label: 'Delivery Errors' },
  { value: 'sync_issue', label: 'Sync Issues' },
  { value: 'tcpa_violation', label: 'TCPA Violations' },
  { value: 'webhook_error', label: 'Webhook Errors' },
];

export default function AlertHubPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertHubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      if (user) {
        const { data, error: dbError } = await supabase
          .from('app_notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (dbError) throw dbError;

        if (data && data.length > 0) {
          // Map DB notifications to AlertHubItem shape using proper category mapping
          const mapped: AlertHubItem[] = data.map((n: Record<string, unknown>) => {
            const dbType = String(n.type || '');
            const dbCategory = n.category ? String(n.category) : null;
            const category = mapToAlertCategory(dbType, dbCategory);
            const severity = mapToSeverity(dbType, category);
            const metadata = (n.metadata as Record<string, unknown>) || {};

            return {
              id: String(n.id),
              category,
              severity,
              title: String(n.title || ''),
              summary: String(n.message || ''),
              affected_count: Number(metadata.affected_count || 0),
              affected_leads: Array.isArray(metadata.affected_leads)
                ? (metadata.affected_leads as { id: string; name: string; phone?: string }[])
                : [],
              portfolio: metadata.portfolio ? String(metadata.portfolio) : undefined,
              agent: metadata.agent ? String(metadata.agent) : undefined,
              sequence: metadata.sequence ? String(metadata.sequence) : undefined,
              error_code: metadata.error_code ? String(metadata.error_code) : undefined,
              retryable: category === 'delivery_error' || category === 'batch_failure' || category === 'sync_issue',
              retried: Boolean(metadata.retried),
              resolved: Boolean(n.archived),
              created_at: String(n.created_at),
            };
          });
          setAlerts(mapped);
        } else {
          setAlerts([]);
        }
      } else {
        setAlerts([]);
      }
    } catch {
      toast.error('Failed to load alerts — check your connection');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = alerts.filter(a => {
    if (!showResolved && a.resolved) return false;
    if (filter === 'all') return true;
    return a.category === filter;
  });

  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const supabase = createClient();
      // Mark the notification as retried in metadata
      await supabase
        .from('app_notifications')
        .update({ metadata: { retried: true, retried_at: new Date().toISOString() } })
        .eq('id', id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, retried: true } : a));
      toast.success('Retry queued — messages will be re-dispatched shortly');
    } catch {
      toast.error('Failed to queue retry');
    } finally {
      setRetryingId(null);
    }
  }

  async function handleResolve(id: string) {
    try {
      const supabase = createClient();
      await supabase
        .from('app_notifications')
        .update({ archived: true })
        .eq('id', id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
      toast.success('Alert marked as resolved');
    } catch {
      toast.error('Failed to resolve alert');
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <Bell size={16} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-semibold text-foreground">Alert Hub</h1>
                {criticalCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 font-bold animate-pulse">
                    {criticalCount} critical
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">Batch failures, delivery errors, sync issues, and TCPA violations</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowResolved(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${showResolved ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <CheckCircle size={12} />
              <span className="hidden sm:inline">{showResolved ? 'Hide resolved' : 'Show resolved'}</span>
            </button>
            <button
              onClick={load}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex items-center gap-4 px-4 sm:px-6 py-3 border-b border-border bg-card/50 shrink-0 overflow-x-auto">
          {[
            { label: 'Unresolved', value: unresolvedCount, color: 'text-foreground' },
            { label: 'Critical', value: alerts.filter(a => a.severity === 'critical' && !a.resolved).length, color: 'text-red-600' },
            { label: 'TCPA', value: alerts.filter(a => a.category === 'tcpa_violation' && !a.resolved).length, color: 'text-purple-600' },
            { label: 'Batch', value: alerts.filter(a => a.category === 'batch_failure' && !a.resolved).length, color: 'text-red-600' },
            { label: 'Delivery', value: alerts.filter(a => a.category === 'delivery_error' && !a.resolved).length, color: 'text-orange-600' },
            { label: 'Sync', value: alerts.filter(a => a.category === 'sync_issue' && !a.resolved).length, color: 'text-amber-600' },
          ].map(kpi => (
            <div key={kpi.label} className="flex flex-col items-center shrink-0 min-w-[48px]">
              <span className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{kpi.label}</span>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-border bg-card/30 shrink-0 overflow-x-auto">
          <Filter size={12} className="text-muted-foreground shrink-0" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                filter === opt.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <CheckCircle size={20} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-foreground">No active alerts</p>
              <p className="text-xs text-muted-foreground">All systems operating normally</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-3">
              {filtered.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onRetry={handleRetry}
                  onResolve={handleResolve}
                  retrying={retryingId === alert.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
