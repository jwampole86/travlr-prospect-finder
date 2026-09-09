'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Phone, Clock, TrendingUp, Users, PhoneCall, PhoneMissed, PhoneOff, Voicemail, RefreshCw, Calendar, BarChart2, Wifi, WifiOff, Mail, Settings, Plus, Trash2, CheckCircle, X, Send } from 'lucide-react';
import { callSessionService, type CallSession, type CallOutcome } from '@/lib/services/callSessionService';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange = '7d' | '30d' | '90d';
type TrendView = 'daily' | 'weekly';

interface AgentMetric {
  agentName: string;
  totalCalls: number;
  avgDuration: number;
  interested: number;
  callback: number;
  notInterested: number;
  voicemail: number;
  noAnswer: number;
  conversionRate: number;
}

interface OutcomeCount {
  name: string;
  value: number;
  color: string;
}

interface DailyVolume {
  date: string;
  calls: number;
  interested: number;
  callback: number;
}

interface WeeklyVolume {
  week: string;
  calls: number;
  interested: number;
  callback: number;
  conversionRate: number;
}

interface ExportScheduleConfig {
  id: string;
  name: string;
  frequency: 'weekly' | 'monthly';
  recipients: string;
  reportType: 'call_analytics' | 'system_health' | 'both';
  conversionThreshold: number;
  volumeThreshold: number;
  enabled: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDurationLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  interested: { label: 'Interested', color: '#22c55e', icon: PhoneCall },
  callback: { label: 'Callback', color: '#3b82f6', icon: PhoneCall },
  not_interested: { label: 'Not Interested', color: '#ef4444', icon: PhoneOff },
  voicemail: { label: 'Voicemail', color: '#f59e0b', icon: Voicemail },
  no_answer: { label: 'No Answer', color: '#94a3b8', icon: PhoneMissed },
  other: { label: 'Other', color: '#a855f7', icon: Phone },
};

// ─── Mock data fallback ────────────────────────────────────────────────────────

function buildMockSessions(): CallSession[] {
  const agents = ['Sarah M.', 'James T.', 'Priya K.', 'Carlos R.', 'Dana L.'];
  const outcomes: CallOutcome[] = ['interested', 'callback', 'not_interested', 'voicemail', 'no_answer'];
  const sessions: CallSession[] = [];
  const now = Date.now();
  for (let i = 0; i < 120; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const started = new Date(now - daysAgo * 86400000 - Math.random() * 28800000).toISOString();
    const dur = Math.floor(Math.random() * 480) + 30;
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    sessions.push({
      id: `mock-${i}`,
      user_id: 'mock',
      lead_id: null,
      lead_address: null,
      lead_state: null,
      agent_name: agents[Math.floor(Math.random() * agents.length)],
      contact_name: null,
      phone_number: null,
      call_sid: null,
      portfolio_state: null,
      base_script_variant: 'initial_outreach',
      consent_acknowledged: false,
      started_at: started,
      ended_at: new Date(new Date(started).getTime() + dur * 1000).toISOString(),
      duration_seconds: dur,
      transcript: [],
      suggestions_count: 0,
      outcome: outcome,
      call_outcome: outcome,
      disposition_notes: null,
      notes: null,
      call_summary: null,
      summary_generated_at: null,
      is_in_progress: false,
      created_at: started,
      updated_at: started,
    });
  }
  return sessions;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Export Schedule Modal ────────────────────────────────────────────────────

function ExportScheduleModal({
  onClose,
  onSave,
  existing,
}: {
  onClose: () => void;
  onSave: (cfg: ExportScheduleConfig) => void;
  existing?: ExportScheduleConfig | null;
}) {
  const [name, setName] = useState(existing?.name ?? 'Weekly Call Analytics Report');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(existing?.frequency ?? 'weekly');
  const [recipients, setRecipients] = useState(existing?.recipients ?? '');
  const [reportType, setReportType] = useState<ExportScheduleConfig['reportType']>(existing?.reportType ?? 'call_analytics');
  const [convThreshold, setConvThreshold] = useState(existing?.conversionThreshold ?? 20);
  const [volThreshold, setVolThreshold] = useState(existing?.volumeThreshold ?? 10);

  const handleSave = () => {
    if (!name.trim() || !recipients.trim()) return;
    onSave({
      id: existing?.id ?? `sched-${Date.now()}`,
      name: name.trim(),
      frequency,
      recipients: recipients.trim(),
      reportType,
      conversionThreshold: convThreshold,
      volumeThreshold: volThreshold,
      enabled: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Mail size={16} className="text-primary" />
            {existing ? 'Edit Export Schedule' : 'New Export Schedule'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Schedule Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Weekly Call Analytics for Execs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Frequency</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as 'weekly' | 'monthly')}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Report Type</label>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value as ExportScheduleConfig['reportType'])}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none"
              >
                <option value="call_analytics">Call Analytics</option>
                <option value="system_health">System Health SLA</option>
                <option value="both">Both Reports</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Recipients (comma-separated emails)</label>
            <input
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="partner@company.com, exec@company.com"
            />
          </div>
          <div className="bg-muted/40 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Thresholds (alert if below)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Min Conversion Rate %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={convThreshold}
                  onChange={e => setConvThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Min Daily Call Volume</label>
                <input
                  type="number"
                  min={0}
                  value={volThreshold}
                  onChange={e => setVolThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !recipients.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {existing ? 'Save Changes' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallAnalyticsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [trendView, setTrendView] = useState<TrendView>('daily');
  const [usingMock, setUsingMock] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Export schedule state
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ExportScheduleConfig | null>(null);
  const [schedules, setSchedules] = useState<ExportScheduleConfig[]>([]);
  const [sendingNow, setSendingNow] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const dateFrom = new Date(Date.now() - days * 86400000).toISOString();
      const data = await callSessionService.getRecent({ limit: 500, dateFrom });
      if (data.length === 0) {
        const mockDays = days;
        setSessions(buildMockSessions().filter((s) => {
          return new Date(s.started_at).getTime() > Date.now() - mockDays * 86400000;
        }));
        setUsingMock(true);
      } else {
        setSessions(data);
        setUsingMock(false);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isLive) {
      intervalRef.current = setInterval(() => { loadSessions(); }, 60000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLive, loadSessions]);

  // Load schedules from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('call_analytics_export_schedules');
      if (stored) setSchedules(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveSchedules = (updated: ExportScheduleConfig[]) => {
    setSchedules(updated);
    try { localStorage.setItem('call_analytics_export_schedules', JSON.stringify(updated)); } catch { /* ignore */ }
  };

  // ── Derived metrics ──────────────────────────────────────────────────────────

  const totalCalls = sessions.length;
  const completedCalls = sessions.filter((s) => s.duration_seconds && s.duration_seconds > 0);
  const avgDuration = completedCalls.length
    ? Math.round(completedCalls.reduce((acc, s) => acc + (s.duration_seconds ?? 0), 0) / completedCalls.length)
    : 0;

  const outcomeCounts: Record<string, number> = {};
  sessions.forEach((s) => {
    const o = s.call_outcome ?? 'other';
    outcomeCounts[o] = (outcomeCounts[o] ?? 0) + 1;
  });

  const interestedCount = outcomeCounts['interested'] ?? 0;
  const callbackCount = outcomeCounts['callback'] ?? 0;
  const voicemailCount = outcomeCounts['voicemail'] ?? 0;
  const connectedCount = interestedCount + callbackCount + (outcomeCounts['not_interested'] ?? 0);
  const conversionRate = totalCalls > 0 ? Math.round(((interestedCount + callbackCount) / totalCalls) * 100) : 0;

  const outcomeData: OutcomeCount[] = Object.entries(outcomeCounts)
    .map(([key, value]) => ({
      name: OUTCOME_CONFIG[key]?.label ?? key,
      value,
      color: OUTCOME_CONFIG[key]?.color ?? '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);

  const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
  const dailyMap: Record<string, { calls: number; interested: number; callback: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyMap[key] = { calls: 0, interested: 0, callback: 0 };
  }
  sessions.forEach((s) => {
    const key = new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (dailyMap[key]) {
      dailyMap[key].calls += 1;
      if (s.call_outcome === 'interested') dailyMap[key].interested += 1;
      if (s.call_outcome === 'callback') dailyMap[key].callback += 1;
    }
  });
  const dailyVolume: DailyVolume[] = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v }));
  const labelStep = days > 30 ? 7 : days > 14 ? 3 : 1;

  const weeklyMap: Record<string, { calls: number; interested: number; callback: number }> = {};
  sessions.forEach((s) => {
    const d = new Date(s.started_at);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!weeklyMap[key]) weeklyMap[key] = { calls: 0, interested: 0, callback: 0 };
    weeklyMap[key].calls += 1;
    if (s.call_outcome === 'interested') weeklyMap[key].interested += 1;
    if (s.call_outcome === 'callback') weeklyMap[key].callback += 1;
  });
  const weeklyVolume: WeeklyVolume[] = Object.entries(weeklyMap)
    .map(([week, v]) => ({
      week,
      ...v,
      conversionRate: v.calls > 0 ? Math.round(((v.interested + v.callback) / v.calls) * 100) : 0,
    }))
    .sort((a, b) => new Date(`${a.week} 2026`).getTime() - new Date(`${b.week} 2026`).getTime())
    .slice(-12);

  const agentMap: Record<string, AgentMetric> = {};
  sessions.forEach((s) => {
    const name = s.agent_name ?? 'Unknown';
    if (!agentMap[name]) {
      agentMap[name] = { agentName: name, totalCalls: 0, avgDuration: 0, interested: 0, callback: 0, notInterested: 0, voicemail: 0, noAnswer: 0, conversionRate: 0 };
    }
    const a = agentMap[name];
    a.totalCalls += 1;
    a.avgDuration = Math.round((a.avgDuration * (a.totalCalls - 1) + (s.duration_seconds ?? 0)) / a.totalCalls);
    if (s.call_outcome === 'interested') a.interested += 1;
    if (s.call_outcome === 'callback') a.callback += 1;
    if (s.call_outcome === 'not_interested') a.notInterested += 1;
    if (s.call_outcome === 'voicemail') a.voicemail += 1;
    if (s.call_outcome === 'no_answer') a.noAnswer += 1;
  });
  const agentMetrics = Object.values(agentMap)
    .map((a) => ({
      ...a,
      conversionRate: a.totalCalls > 0 ? Math.round(((a.interested + a.callback) / a.totalCalls) * 100) : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate);

  // ── Export helpers ────────────────────────────────────────────────────────────

  const buildAnalyticsPayload = () => ({
    summary: {
      totalCalls,
      avgDuration,
      conversionRate,
      interested: interestedCount,
      callback: callbackCount,
      voicemail: voicemailCount,
      noAnswer: outcomeCounts['no_answer'] ?? 0,
    },
    agents: agentMetrics,
    daily: dailyVolume,
  });

  const handleSendNow = async (schedule: ExportScheduleConfig) => {
    setSendingNow(schedule.id);
    setSendResult(null);
    try {
      const recipientEmails = schedule.recipients.split(',').map(e => e.trim()).filter(Boolean);
      const analyticsData = buildAnalyticsPayload();

      const sendReport = async (type: 'call_analytics' | 'system_health') => {
        const body: Record<string, unknown> = {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          recipientEmails,
          frequency: schedule.frequency,
          reportType: type,
        };
        if (type === 'call_analytics') body.analyticsData = analyticsData;
        if (type === 'system_health') {
          body.healthData = {
            services: [
              { name: 'REST API', status: 'operational', uptime30d: 99.94, uptime90d: 99.87, slaTarget: 99.9, responseTime: 142 },
              { name: 'Database', status: 'operational', uptime30d: 99.98, uptime90d: 99.96, slaTarget: 99.9, responseTime: 8 },
              { name: 'SMS Delivery', status: 'operational', uptime30d: 99.72, uptime90d: 99.61, slaTarget: 99.5, responseTime: 210 },
              { name: 'Email Delivery', status: 'degraded', uptime30d: 98.84, uptime90d: 99.21, slaTarget: 99.5, responseTime: 380 },
            ],
            thresholds: [
              { service: 'Email Delivery', threshold: 99.5, current: 98.84, triggered: true },
              { service: 'Webhook Endpoints', threshold: 99.0, current: 97.40, triggered: true },
            ],
          };
        }
        return fetch('/api/send-scheduled-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      };

      let ok = true;
      if (schedule.reportType === 'both') {
        const [r1, r2] = await Promise.all([sendReport('call_analytics'), sendReport('system_health')]);
        ok = r1.ok && r2.ok;
      } else {
        const r = await sendReport(schedule.reportType);
        ok = r.ok;
      }

      setSendResult({ id: schedule.id, success: ok, msg: ok ? 'Report sent successfully!' : 'Send failed — check API key.' });
    } catch {
      setSendResult({ id: schedule.id, success: false, msg: 'Network error.' });
    } finally {
      setSendingNow(null);
    }
  };

  const handleSaveSchedule = (cfg: ExportScheduleConfig) => {
    const updated = editingSchedule
      ? schedules.map(s => s.id === cfg.id ? cfg : s)
      : [...schedules, cfg];
    saveSchedules(updated);
    setShowScheduleModal(false);
    setEditingSchedule(null);
  };

  const handleDeleteSchedule = (id: string) => {
    saveSchedules(schedules.filter(s => s.id !== id));
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart2 size={18} className="text-primary" />
              Call Analytics
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time call volume, outcomes, conversion rates, and agent performance
              {usingMock && <span className="ml-2 text-amber-500 font-medium">(demo data — no real sessions yet)</span>}
              {lastRefresh && !usingMock && (
                <span className="ml-2 text-muted-foreground">· Updated {lastRefresh.toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSchedulePanel(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                showSchedulePanel
                  ? 'bg-primary/10 text-primary border-primary/30' :'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              <Mail size={12} />
              Scheduled Exports
              {schedules.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                  {schedules.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsLive(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isLive
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :'bg-muted text-muted-foreground border-border'
              }`}
            >
              {isLive ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isLive ? 'Live' : 'Paused'}
            </button>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['7d', '30d', '90d'] as DateRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    dateRange === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>
            <button
              onClick={loadSessions}
              disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Scheduled Export Panel */}
        {showSchedulePanel && (
          <div className="border-b border-border bg-muted/30 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Mail size={14} className="text-primary" />
                Scheduled PDF/CSV Exports
                <span className="text-xs text-muted-foreground font-normal">— auto-emailed to partners & execs</span>
              </h2>
              <button
                onClick={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <Plus size={12} />
                New Schedule
              </button>
            </div>
            {schedules.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Mail size={24} className="mx-auto mb-2 opacity-20" />
                No export schedules yet. Create one to auto-email reports to partners and execs.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {schedules.map((sched) => (
                  <div key={sched.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{sched.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {sched.frequency === 'weekly' ? '📅 Weekly' : '📆 Monthly'} ·{' '}
                          {sched.reportType === 'call_analytics' ? '📊 Call Analytics'
                            : sched.reportType === 'system_health'? '🏥 System Health' :'📊🏥 Both'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingSchedule(sched); setShowScheduleModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                          title="Edit"
                        >
                          <Settings size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(sched.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-3 truncate">
                      📧 {sched.recipients}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-3">
                      <span className="bg-muted px-2 py-0.5 rounded-full">Conv ≥{sched.conversionThreshold}%</span>
                      <span className="bg-muted px-2 py-0.5 rounded-full">Vol ≥{sched.volumeThreshold}/day</span>
                    </div>
                    {sendResult?.id === sched.id && (
                      <div className={`flex items-center gap-1.5 text-[11px] mb-2 px-2 py-1 rounded-lg ${
                        sendResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {sendResult.success ? <CheckCircle size={11} /> : <X size={11} />}
                        {sendResult.msg}
                      </div>
                    )}
                    <button
                      onClick={() => handleSendNow(sched)}
                      disabled={sendingNow === sched.id}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {sendingNow === sched.id ? (
                        <><RefreshCw size={11} className="animate-spin" />Sending…</>
                      ) : (
                        <><Send size={11} />Send Now</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 p-6 space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard label="Total Calls" value={totalCalls.toLocaleString()} sub={`Last ${dateRange}`} icon={Phone} color="bg-blue-500/10 text-blue-600" />
            <KPICard label="Avg Duration" value={fmtDuration(avgDuration)} sub={fmtDurationLabel(avgDuration)} icon={Clock} color="bg-purple-500/10 text-purple-600" />
            <KPICard label="Conversion Rate" value={`${conversionRate}%`} sub="Interested + Callback" icon={TrendingUp} color="bg-emerald-500/10 text-emerald-600" />
            <KPICard label="Connected" value={connectedCount.toLocaleString()} sub={`${totalCalls > 0 ? Math.round((connectedCount / totalCalls) * 100) : 0}% of calls`} icon={PhoneCall} color="bg-green-500/10 text-green-600" />
            <KPICard label="Voicemail" value={voicemailCount.toLocaleString()} sub={`${totalCalls > 0 ? Math.round((voicemailCount / totalCalls) * 100) : 0}% of calls`} icon={Voicemail} color="bg-amber-500/10 text-amber-600" />
          </div>

          {/* Outcome breakdown strip */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <PhoneCall size={12} />Conversion by Outcome
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => {
                const count = outcomeCounts[key] ?? 0;
                const pct = totalCalls > 0 ? Math.round((count / totalCalls) * 100) : 0;
                return (
                  <div key={key} className="text-center">
                    <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center" style={{ background: `${cfg.color}20` }}>
                      <cfg.icon size={14} style={{ color: cfg.color }} />
                    </div>
                    <p className="text-lg font-bold text-foreground">{count}</p>
                    <p className="text-[10px] text-muted-foreground">{cfg.label}</p>
                    <p className="text-[10px] font-semibold" style={{ color: cfg.color }}>{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar size={12} />Call Volume Trend
                </h2>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                  {(['daily', 'weekly'] as TrendView[]).map(v => (
                    <button
                      key={v}
                      onClick={() => setTrendView(v)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all capitalize ${
                        trendView === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {loading ? (
                <div className="h-52 flex items-center justify-center">
                  <RefreshCw size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : trendView === 'daily' ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyVolume} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v, i) => (i % labelStep === 0 ? v : '')} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="calls" name="Total Calls" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="interested" name="Interested" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="callback" name="Callback" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={weeklyVolume} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} unit="%" />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="calls" name="Total Calls" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="left" type="monotone" dataKey="interested" name="Interested" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conv. Rate %" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
                <PhoneCall size={12} />Outcome Distribution
              </h2>
              {loading ? (
                <div className="h-52 flex items-center justify-center">
                  <RefreshCw size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={outcomeData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                        {outcomeData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {outcomeData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                          <span className="text-xs text-muted-foreground">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{item.value}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {totalCalls > 0 ? Math.round((item.value / totalCalls) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Agent Leaderboard */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users size={12} />Agent Performance Leaderboard
              </h2>
              <span className="text-[10px] text-muted-foreground">{agentMetrics.length} agents · ranked by conversion rate</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : agentMetrics.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Phone size={28} className="mx-auto mb-2 opacity-20" />
                No call data for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Agent</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Calls</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Avg Dur.</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-green-600">Interested</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-blue-600">Callback</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-red-500">Not Int.</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-amber-500">Voicemail</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Conv. Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentMetrics.map((agent, idx) => (
                      <tr key={agent.agentName} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-4 py-3 text-muted-foreground font-bold">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                              {agent.agentName.charAt(0)}
                            </div>
                            <span className="font-medium text-foreground">{agent.agentName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-foreground">{agent.totalCalls}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground">{fmtDuration(agent.avgDuration)}</td>
                        <td className="px-3 py-3 text-right"><span className="text-green-600 font-semibold">{agent.interested}</span></td>
                        <td className="px-3 py-3 text-right"><span className="text-blue-600 font-semibold">{agent.callback}</span></td>
                        <td className="px-3 py-3 text-right"><span className="text-red-500">{agent.notInterested}</span></td>
                        <td className="px-3 py-3 text-right"><span className="text-amber-500">{agent.voicemail}</span></td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            agent.conversionRate >= 30 ? 'bg-emerald-500/10 text-emerald-600'
                              : agent.conversionRate >= 15 ? 'bg-blue-500/10 text-blue-600' : 'bg-muted text-muted-foreground'
                          }`}>
                            {agent.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Conversion Rate by Agent bar chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <TrendingUp size={12} />Conversion Rate by Agent
            </h2>
            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <RefreshCw size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={agentMetrics.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} unit="%" domain={[0, 100]} />
                  <YAxis type="category" dataKey="agentName" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={55} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Conversion Rate']} />
                  <Bar dataKey="conversionRate" name="Conversion Rate" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Export Schedule Modal */}
      {showScheduleModal && (
        <ExportScheduleModal
          onClose={() => { setShowScheduleModal(false); setEditingSchedule(null); }}
          onSave={handleSaveSchedule}
          existing={editingSchedule}
        />
      )}
    </AppLayout>
  );
}
