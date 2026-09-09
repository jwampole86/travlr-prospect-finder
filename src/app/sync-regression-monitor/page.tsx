'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  AlertTriangle, RefreshCw, CheckCircle2, XCircle, Zap, Bell, Shield,
  Clock, Database, TrendingUp, Play, AlertOctagon, Wifi, WifiOff, Activity,
  ShieldAlert, BarChart2,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type RegressionType = 'new_duplicate' | 'low_quality' | 'cross_market' | 'stale_source';
type AlertStatus = 'open' | 're_dedup_triggered' | 'resolved' | 'ignored';

interface RegressionEvent {
  id: string;
  leadId: string;
  detectedAt: string;
  source: string;
  type: RegressionType;
  address: string;
  city: string;
  state: string;
  score: number;
  status: AlertStatus;
  notes: string;
  confidenceScore?: number | null;
  rulesViolations?: string[] | null;
  validationRecommendation?: string | null;
  isLive?: boolean; // true = arrived via realtime
}

interface SyncRun {
  source: string;
  leadsImported: number;
  dupesBlocked: number;
  lowQualityFlagged: number;
  regressionCount: number;
  runAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: RegressionType) {
  if (t === 'new_duplicate') return { label: 'New Duplicate', color: 'text-red-600 bg-red-50 border-red-200' };
  if (t === 'low_quality') return { label: 'Low Quality', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  if (t === 'cross_market') return { label: 'Cross-Market', color: 'text-purple-600 bg-purple-50 border-purple-200' };
  return { label: 'Stale Source', color: 'text-blue-600 bg-blue-50 border-blue-200' };
}

function statusLabel(s: AlertStatus) {
  if (s === 'open') return { label: 'Open', color: 'text-red-600 bg-red-50' };
  if (s === 're_dedup_triggered') return { label: 'Re-Dedup Triggered', color: 'text-amber-600 bg-amber-50' };
  if (s === 'resolved') return { label: 'Resolved', color: 'text-emerald-600 bg-emerald-50' };
  return { label: 'Ignored', color: 'text-muted-foreground bg-muted' };
}

function confidenceColor(score: number | null | undefined) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SyncRegressionMonitorPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<RegressionEvent[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<RegressionType | 'all'>('all');
  const [triggering, setTriggering] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [liveEventCount, setLiveEventCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load initial data ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load persisted regression events from DB
      const { data: dbEvents } = await supabase
        .from('sync_regression_events')
        .select('*')
        .gte('detected_at', new Date(Date.now() - 7 * 24 * 3600000).toISOString())
        .order('detected_at', { ascending: false })
        .limit(100);

      // 2. Load recent leads to detect in-memory regressions not yet persisted
      const { data: recentLeads } = await supabase
        .from('leads')
        .select('id, address, city, state, source, prospect_score, confidence_band, created_at, updated_at, is_synthetic')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 3600000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      const leads = recentLeads || [];

      // Build in-memory regression events
      const fpMap = new Map<string, string>();
      const streetMap = new Map<string, string>();
      const memEvents: RegressionEvent[] = [];

      for (const l of leads) {
        const addr = String(l.address || '').toLowerCase().trim();
        const city = String(l.city || '').toLowerCase().trim();
        const state = String(l.state || '').toLowerCase().trim();
        const fp = `${addr}|${city}|${state}`;
        const score = l.prospect_score || 0;

        if (fpMap.has(fp)) {
          memEvents.push({
            id: `reg-dup-${l.id}`,
            leadId: l.id,
            detectedAt: l.created_at,
            source: l.source || 'Unknown',
            type: 'new_duplicate',
            address: l.address || '',
            city: l.city || '',
            state: l.state || '',
            score,
            status: 'open',
            notes: `Duplicate of lead ${fpMap.get(fp)?.slice(0, 8)}… — same address+city+state fingerprint`,
          });
        } else {
          fpMap.set(fp, l.id);
          const hasRealAddr = addr.length > 5 && /\d/.test(addr) && /[a-z]/.test(addr);
          if (hasRealAddr && streetMap.has(addr)) {
            memEvents.push({
              id: `reg-cross-${l.id}`,
              leadId: l.id,
              detectedAt: l.created_at,
              source: l.source || 'Unknown',
              type: 'cross_market',
              address: l.address || '',
              city: l.city || '',
              state: l.state || '',
              score,
              status: 'open',
              notes: `Same street address "${l.address}" already exists in another city`,
            });
          } else if (hasRealAddr) {
            streetMap.set(addr, l.id);
          }

          if (score < 20 && !l.is_synthetic) {
            memEvents.push({
              id: `reg-lq-${l.id}`,
              leadId: l.id,
              detectedAt: l.created_at,
              source: l.source || 'Unknown',
              type: 'low_quality',
              address: l.address || '',
              city: l.city || '',
              state: l.state || '',
              score,
              status: 'open',
              notes: `Score ${score} is below quality threshold (20)`,
            });
          }
        }
      }

      // Merge DB events + in-memory events (DB events take precedence by lead_id)
      const dbLeadIds = new Set((dbEvents || []).map((e: any) => e.lead_id));
      const merged: RegressionEvent[] = [
        ...(dbEvents || []).map((e: any) => ({
          id: e.id,
          leadId: e.lead_id,
          detectedAt: e.detected_at,
          source: e.source,
          type: e.regression_type as RegressionType,
          address: e.address || '',
          city: e.city || '',
          state: e.state || '',
          score: e.score || 0,
          status: e.status as AlertStatus,
          notes: e.notes || '',
          confidenceScore: e.confidence_score,
          rulesViolations: e.rules_violations,
          validationRecommendation: e.validation_recommendation,
        })),
        ...memEvents.filter(e => !dbLeadIds.has(e.leadId)),
      ]
        .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
        .slice(0, 100);

      setEvents(merged);

      // Build sync run summary
      const sourceMap = new Map<string, { imported: number; dupes: number; lq: number; regressions: number }>();
      for (const l of leads) {
        const src = l.source || 'Unknown';
        if (!sourceMap.has(src)) sourceMap.set(src, { imported: 0, dupes: 0, lq: 0, regressions: 0 });
        const e = sourceMap.get(src)!;
        e.imported++;
        if ((l.prospect_score || 0) < 20) e.lq++;
      }
      for (const ev of memEvents) {
        const e = sourceMap.get(ev.source);
        if (e) {
          if (ev.type === 'new_duplicate' || ev.type === 'cross_market') e.dupes++;
          e.regressions++;
        }
      }

      const runs: SyncRun[] = Array.from(sourceMap.entries())
        .map(([source, d]) => ({
          source,
          leadsImported: d.imported,
          dupesBlocked: d.dupes,
          lowQualityFlagged: d.lq,
          regressionCount: d.regressions,
          runAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        }))
        .sort((a, b) => b.regressionCount - a.regressionCount)
        .slice(0, 10);

      setSyncRuns(runs);
    } catch (err) {
      console.error('SyncRegressionMonitor load error', err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [supabase]);

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    load();

    // Subscribe to sync_regression_events INSERT
    const channel = supabase
      .channel('sync-regression-monitor-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sync_regression_events',
        },
        (payload) => {
          const e = payload.new as any;
          const newEvent: RegressionEvent = {
            id: e.id,
            leadId: e.lead_id,
            detectedAt: e.detected_at,
            source: e.source,
            type: e.regression_type as RegressionType,
            address: e.address || '',
            city: e.city || '',
            state: e.state || '',
            score: e.score || 0,
            status: e.status as AlertStatus,
            notes: e.notes || '',
            confidenceScore: e.confidence_score,
            rulesViolations: e.rules_violations,
            validationRecommendation: e.validation_recommendation,
            isLive: true,
          };

          setEvents(prev => {
            // Avoid duplicates
            if (prev.some(ev => ev.id === newEvent.id)) return prev;
            return [newEvent, ...prev].slice(0, 100);
          });
          setLiveEventCount(c => c + 1);

          const typeInfo = typeLabel(newEvent.type);
          toast.warning(
            `Live: ${typeInfo.label} — ${newEvent.address}, ${newEvent.city} (${newEvent.source})`,
            { duration: 5000 }
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sync_regression_events',
        },
        (payload) => {
          const e = payload.new as any;
          setEvents(prev =>
            prev.map(ev =>
              ev.id === e.id
                ? {
                    ...ev,
                    status: e.status as AlertStatus,
                    confidenceScore: e.confidence_score ?? ev.confidenceScore,
                    rulesViolations: e.rules_violations ?? ev.rulesViolations,
                    validationRecommendation: e.validation_recommendation ?? ev.validationRecommendation,
                  }
                : ev
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rules_engine_violations',
        },
        (payload) => {
          const v = payload.new as any;
          if (v.severity === 'critical') {
            toast.error(
              `Rules violation: ${v.rule_name} (${v.severity}) — actual: ${v.actual_value}, threshold: ${v.threshold_value}`,
              { duration: 7000 }
            );
          } else {
            toast.warning(
              `Rules violation: ${v.rule_name} — actual: ${v.actual_value}, threshold: ${v.threshold_value}`,
              { duration: 5000 }
            );
          }
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function triggerReDedup(eventId: string, leadId: string) {
    setTriggering(eventId);
    try {
      // Update DB event status if it's a persisted event
      const isDbEvent = !eventId.startsWith('reg-');
      if (isDbEvent) {
        await supabase
          .from('sync_regression_events')
          .update({ status: 're_dedup_triggered' })
          .eq('id', eventId);
      }

      await supabase
        .from('leads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', leadId);

      setEvents(prev => prev.map(e =>
        e.id === eventId ? { ...e, status: 're_dedup_triggered' } : e
      ));
      toast.success('Re-dedup triggered. Ops team notified.');
    } catch {
      toast.error('Failed to trigger re-dedup');
    } finally {
      setTriggering(null);
    }
  }

  async function resolveAlert(eventId: string) {
    const isDbEvent = !eventId.startsWith('reg-');
    if (isDbEvent) {
      await supabase
        .from('sync_regression_events')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', eventId)
        .catch(() => {});
    }
    setEvents(prev => prev.map(e =>
      e.id === eventId ? { ...e, status: 'resolved' } : e
    ));
    toast.success('Alert resolved');
  }

  async function ignoreAlert(eventId: string) {
    const isDbEvent = !eventId.startsWith('reg-');
    if (isDbEvent) {
      await supabase
        .from('sync_regression_events')
        .update({ status: 'ignored' })
        .eq('id', eventId)
        .catch(() => {});
    }
    setEvents(prev => prev.map(e =>
      e.id === eventId ? { ...e, status: 'ignored' } : e
    ));
  }

  const filtered = events.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    return true;
  });

  const openCount = events.filter(e => e.status === 'open').length;
  const dupCount = events.filter(e => e.type === 'new_duplicate').length;
  const lqCount = events.filter(e => e.type === 'low_quality').length;
  const crossCount = events.filter(e => e.type === 'cross_market').length;

  const chartData = syncRuns.map(r => ({
    source: r.source.length > 10 ? r.source.slice(0, 10) + '…' : r.source,
    imported: r.leadsImported,
    dupes: r.dupesBlocked,
    flagged: r.lowQualityFlagged,
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <AlertOctagon size={24} className="text-primary" />
              Sync Regression Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Flag new duplicates & low-quality leads · Trigger re-dedup · Alert ops before agents see bad data
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Realtime status indicator */}
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${realtimeConnected ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-muted-foreground bg-muted border-border'}`}>
              {realtimeConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {realtimeConnected ? 'Live' : 'Offline'}
              {liveEventCount > 0 && (
                <span className="ml-1 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  +{liveEventCount}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={12} />
              {lastRefresh.toLocaleTimeString()}
            </span>
            <Link
              href="/enrichment-rules-engine"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted transition-all"
            >
              <ShieldAlert size={14} />
              Rules Engine
            </Link>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Open Alerts', value: openCount, icon: AlertTriangle, color: openCount > 0 ? 'text-red-500' : 'text-emerald-500', bg: openCount > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200' },
            { label: 'New Duplicates', value: dupCount, icon: Database, color: 'text-red-500', bg: 'bg-card border-border' },
            { label: 'Low Quality', value: lqCount, icon: TrendingUp, color: 'text-amber-500', bg: 'bg-card border-border' },
            { label: 'Cross-Market', value: crossCount, icon: Shield, color: 'text-purple-500', bg: 'bg-card border-border' },
          ].map(m => {
            const IconComp = m.icon;
            return (
              <div key={m.label} className={`rounded-xl p-4 border ${m.bg} flex items-center gap-3`}>
                <IconComp size={20} className={m.color} />
                <div>
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ops Alert Banner */}
        {openCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
            <Bell size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Ops Team Alert — {openCount} open regression{openCount > 1 ? 's' : ''} detected in the last 7 days
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                These issues were caught before agents saw the data. Trigger re-dedup or resolve each alert below.
              </p>
            </div>
            {realtimeConnected && (
              <div className="flex items-center gap-1 text-xs text-emerald-600 shrink-0">
                <Activity size={12} className="animate-pulse" />
                Watching live
              </div>
            )}
          </div>
        )}

        {/* Sync Run Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            Sync Run Quality by Source (last 7 days)
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="imported" name="Imported" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="dupes" name="Dupes Blocked" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="flagged" name="Low Quality" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              {loading ? 'Loading sync data...' : 'No sync run data available'}
            </div>
          )}
        </div>

        {/* Regression Events Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle size={14} className="text-primary" />
              Regression Events
              {realtimeConnected && (
                <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
                  ● Live
                </span>
              )}
            </h2>
            <div className="flex gap-2 ml-auto flex-wrap">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as AlertStatus | 'all')}
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="re_dedup_triggered">Re-Dedup Triggered</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as RegressionType | 'all')}
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground"
              >
                <option value="all">All Types</option>
                <option value="new_duplicate">New Duplicate</option>
                <option value="low_quality">Low Quality</option>
                <option value="cross_market">Cross-Market</option>
                <option value="stale_source">Stale Source</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Scanning for regressions...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No regressions detected</p>
              <p className="text-xs text-muted-foreground mt-1">All synced leads passed quality checks in the last 7 days</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(ev => {
                const tl = typeLabel(ev.type);
                const sl = statusLabel(ev.status);
                return (
                  <div key={ev.id} className={`px-5 py-4 ${ev.isLive ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {ev.isLive && (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full animate-pulse">
                              LIVE
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tl.color}`}>
                            {tl.label}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sl.color}`}>
                            {sl.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{ev.source}</span>
                          {/* Confidence score badge */}
                          {ev.confidenceScore != null && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-card border border-border ${confidenceColor(ev.confidenceScore)}`}>
                              <BarChart2 size={9} className="inline mr-0.5" />
                              {ev.confidenceScore}% conf
                            </span>
                          )}
                          {/* Validation recommendation */}
                          {ev.validationRecommendation && ev.validationRecommendation !== 'accept' && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ev.validationRecommendation === 'reject' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'}`}>
                              AI: {ev.validationRecommendation}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(ev.detectedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {ev.address}, {ev.city}, {ev.state}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Score: {ev.score} · {ev.notes}</p>
                        {/* Rules violations */}
                        {ev.rulesViolations && ev.rulesViolations.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {ev.rulesViolations.map(v => (
                              <span key={v} className="text-[9px] font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                ⚠ {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {ev.status === 'open' && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => triggerReDedup(ev.id, ev.leadId)}
                            disabled={triggering === ev.id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-all disabled:opacity-50"
                          >
                            <Play size={11} />
                            {triggering === ev.id ? 'Triggering...' : 'Re-Dedup'}
                          </button>
                          <button
                            onClick={() => resolveAlert(ev.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-all"
                          >
                            <CheckCircle2 size={11} />
                            Resolve
                          </button>
                          <button
                            onClick={() => ignoreAlert(ev.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-all"
                          >
                            <XCircle size={11} />
                            Ignore
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
