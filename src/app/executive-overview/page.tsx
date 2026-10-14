'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DetailDrawer, { type Drill } from './DetailDrawer';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, CalendarClock, ChevronDown, ChevronRight, Download,
  Flame, Info, Loader2, MapPin, MessageSquare, RefreshCw, Send, Users, X, Zap,
} from 'lucide-react';

// ─── Types (shape of /api/executive/overview) ────────────────────────────────

type MetricKey = 'sent' | 'delivered' | 'replies' | 'opens' | 'submitted' | 'newLeads';
interface Kpi { key: string; label: string; value: number; prev: number | null; format: 'int' | 'pct' | 'usd'; metric: MetricKey | null; hint: string; href: string; inverse?: boolean }
interface FunnelStep { key: string; label: string; count: number; pctOfTexted: number; pctOfPrevious: number }
interface DayPoint { date: string; sent: number; delivered: number; replies: number; opens: number; submitted: number; newLeads: number }
interface Campaign { batch: string; audience: string | null; texts: number; sent: number; delivered: number; deliveredPct: number; undelivered: number; replies: number; yes: number; no: number; stop: number; opened: number; viewed: number; submitted: number; hot: number; queued: number; firstSend: string | null; lastSend: string | null; status: 'scheduled' | 'sending' | 'complete' }
interface StateRow { state: string; leads: number; texted: number; delivered: number; replies: number; yes: number; hot: number; queued: number }
interface HotLead { leadId: string; temperature: string; score: number; address: string; owner: string | null; why: string; at: string | null; pipeline: string | null; batch: string }
interface Attention { level: 'high' | 'medium' | 'info'; title: string; detail: string; href: string; drill: Drill }
interface Overview {
  params: { days: number; state: string | null }; kpis: Kpi[]; funnel: FunnelStep[]; daily: DayPoint[]; campaigns: Campaign[]; states: StateRow[];
  pipeline: Array<{ key: string; label: string; count: number }>; tiers: { total: number; untouched: number; luxury: number; highScore: number };
  hot: HotLead[]; queue: { total: number; byDay: Array<{ date: string; count: number; batches: Record<string, number> }> };
  cohost: { listings: number; stages: Array<{ stage: string; count: number }>; emails: { total: number; sent: number; opened: number; replied: number; bounced: number }; offerPages: { viewed: number; requested: number; optedOut: number } };
  attention: Attention[]; totals: { leads: number; textsAllTime: number }; updatedAt: string; queryMs: number; cached: boolean;
}

const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: 'sent', label: 'Texts sent', color: '#6366f1' }, { key: 'delivered', label: 'Delivered', color: '#10b981' },
  { key: 'replies', label: 'Replies', color: '#f59e0b' }, { key: 'opens', label: 'Link opens', color: '#0ea5e9' },
  { key: 'submitted', label: 'Forms and callbacks', color: '#ec4899' }, { key: 'newLeads', label: 'New leads', color: '#94a3b8' },
];
const DEFAULT_METRICS: MetricKey[] = ['sent', 'delivered', 'replies', 'opens'];
const RANGES: Array<{ days: number; label: string }> = [{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'All time' }];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const int = (n: number) => Math.round(n).toLocaleString();
const fmtValue = (v: number, f: Kpi['format']) => (f === 'pct' ? `${v}%` : f === 'usd' ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : int(v));
const shortDay = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');
const ago = (iso: string | null) => { if (!iso) return ''; const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

function Delta({ kpi }: { kpi: Kpi }) {
  if (kpi.prev == null) return null;
  if (kpi.prev === 0) return <span className="text-[11px] text-muted-foreground">Nothing in the previous period</span>;
  const diff = kpi.format === 'pct' ? kpi.value - kpi.prev : ((kpi.value - kpi.prev) / kpi.prev) * 100;
  if (Math.abs(diff) < 0.05) return <span className="text-[11px] text-muted-foreground">Same as the previous period</span>;
  const up = diff > 0; const good = kpi.inverse ? !up : up;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[11px] font-medium', good ? 'text-emerald-600' : 'text-red-500')}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {kpi.format === 'pct' ? `${Math.abs(Math.round(diff * 10) / 10)} pts` : `${Math.abs(Math.round(diff))}%`}
      <span className="font-normal text-muted-foreground">vs previous</span>
    </span>
  );
}

// Clicking anywhere on a panel that is not itself a control opens its details.
const INTERACTIVE = 'a,button,input,select,label,th,[data-no-panel]';
function Panel({ title, icon, right, children, className, onOpen }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; onOpen?: () => void }) {
  return (
    <section onClick={onOpen ? e => { if (!(e.target as HTMLElement).closest(INTERACTIVE)) onOpen(); } : undefined}
      className={cx('rounded-xl border border-border bg-card p-5 transition-colors', onOpen && 'cursor-pointer hover:border-primary/40', className)}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">{icon}<h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{right}{onOpen && <button onClick={onOpen} aria-label={`Details: ${title}`} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">Details<ChevronRight size={11} /></button>}</div></div>
      {children}
    </section>
  );
}

function SortHead<K extends string>({ label, k, sort, onSort, right }: { label: string; k: K; sort: { key: K; dir: 1 | -1 }; onSort: (k: K) => void; right?: boolean }) {
  return (
    <th className={cx('py-2 px-2 font-medium select-none', right && 'text-right')} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(k)} className={cx('inline-flex items-center gap-0.5 hover:text-foreground', sort.key === k && 'text-foreground')}>
        {label}{sort.key === k && <ChevronDown size={11} className={sort.dir === 1 ? 'rotate-180' : ''} />}
      </button>
    </th>
  );
}

const statusChip = (s: Campaign['status']) => s === 'scheduled' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : s === 'sending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
const levelStyle = (l: Attention['level']) => l === 'high' ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : l === 'medium' ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300';

function csv(rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]); const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

const TOOLTIP_STYLE = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutiveOverviewPage() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState('');
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [metrics, setMetrics] = useState<MetricKey[]>(DEFAULT_METRICS);
  const [chart, setChart] = useState<'area' | 'bar'>('area');
  const [campSort, setCampSort] = useState<{ key: keyof Campaign; dir: 1 | -1 }>({ key: 'firstSend', dir: -1 });
  const [stateSort, setStateSort] = useState<{ key: keyof StateRow; dir: 1 | -1 }>({ key: 'leads', dir: -1 });
  const [drill, setDrill] = useState<Drill | null>(null);
  const [stateSearch, setStateSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [allStates, setAllStates] = useState<string[]>([]);

  // Filters live in the URL so a view can be shared or bookmarked.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = Number(q.get('days')); if (q.has('days') && [0, 1, 7, 30, 90].includes(d)) setDays(d);
    const s = q.get('state'); if (s && /^[A-Za-z]{2}$/.test(s)) setState(s.toUpperCase());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(); q.set('days', String(days)); if (state) q.set('state', state);
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
  }, [days, state, ready]);

  const load = useCallback(async (fresh = false) => {
    abortRef.current?.abort(); const ctl = new AbortController(); abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/overview?days=${days}${state ? `&state=${state}` : ''}${fresh ? '&fresh=1' : ''}`, { cache: 'no-store', signal: ctl.signal });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 403 ? 'The Executive Overview is for leadership accounts.' : j.error || `Request failed (${res.status})`);
      setData(j as Overview); setError(null);
      if (!state) setAllStates((j as Overview).states.map(s => s.state).filter(s => s !== '??'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally { if (abortRef.current === ctl) setLoading(false); }
  }, [days, state]);

  useEffect(() => { if (ready) load(); }, [ready, load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => clearInterval(t);
  }, [auto, load]);

  const toggleMetric = (k: MetricKey) => setMetrics(m => (m.includes(k) ? (m.length > 1 ? m.filter(x => x !== k) : m) : [...m, k]));
  const focusMetric = (k: MetricKey | null) => { if (k) setMetrics(m => (m.length === 1 && m[0] === k ? DEFAULT_METRICS : [k])); };

  const campaigns = useMemo(() => [...(data?.campaigns ?? [])].sort((a, b) => {
    const x = a[campSort.key], y = b[campSort.key];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))) * campSort.dir;
  }), [data, campSort]);
  const stateRows = useMemo(() => [...(data?.states ?? [])].filter(s => !stateSearch || s.state.toLowerCase().includes(stateSearch.toLowerCase())).sort((a, b) => {
    const x = a[stateSort.key], y = b[stateSort.key];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * stateSort.dir;
  }), [data, stateSort, stateSearch]);
  const maxLeads = Math.max(1, ...(data?.states ?? []).map(s => s.leads));
  const sortCamp = (k: keyof Campaign) => setCampSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }));
  const sortState = (k: keyof StateRow) => setStateSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }));

  const exportCsv = () => {
    if (!data) return;
    const day = data.updatedAt.slice(0, 10);
    download(`executive-overview-campaigns-${day}.csv`, csv(data.campaigns.map(c => ({ campaign: c.batch, audience: c.audience, status: c.status, first_send: c.firstSend, texts: c.texts, sent: c.sent, delivered: c.delivered, delivered_pct: c.deliveredPct, failed: c.undelivered, replies: c.replies, yes: c.yes, no: c.no, stop: c.stop, opened: c.opened, saw_estimate: c.viewed, submitted: c.submitted, hot: c.hot, queued: c.queued }))));
    download(`executive-overview-states-${day}.csv`, csv(data.states.map(s => ({ state: s.state, leads: s.leads, texted: s.texted, delivered: s.delivered, replies: s.replies, yes: s.yes, hot: s.hot, queued: s.queued }))));
  };

  const stateOptions = useMemo(() => { const s = new Set<string>(allStates); if (state) s.add(state); return [...s].sort(); }, [allStates, state]);
  const chartData = useMemo(() => (data?.daily ?? []).map(d => ({ ...d, label: shortDay(d.date) })), [data]);
  const visibleChart = chartData.slice(-(days === 1 || days === 7 ? 14 : chartData.length));
  const funnelMax = Math.max(1, ...(data?.funnel ?? []).map(f => f.count));
  const shown = METRICS.filter(m => metrics.includes(m.key));
  const dayClick = (s: unknown) => { const date = (s as { activePayload?: Array<{ payload?: { date?: string } }> } | null)?.activePayload?.[0]?.payload?.date; if (date) setDrill({ kind: 'day', id: date }); };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header and controls */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Executive Overview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">How outreach is converting across the company. Click any card, bar or row to dig in.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs" role="group" aria-label="Date range">
              {RANGES.map(r => <button key={r.days} onClick={() => setDays(r.days)} aria-pressed={days === r.days} className={cx('px-2.5 py-1 rounded-md', days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{r.label}</button>)}
            </div>
            <label className="sr-only" htmlFor="ov-state">State</label>
            <select id="ov-state" value={state} onChange={e => setState(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs">
              <option value="">All states</option>{stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {state && <button onClick={() => setState('')} className="h-8 px-2 rounded-lg border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"><X size={12} /> Clear {state}</button>}
            <button onClick={() => setAuto(a => !a)} aria-pressed={auto} title="Refresh every minute while this tab is open" className={cx('h-8 px-2.5 rounded-lg border text-xs inline-flex items-center gap-1', auto ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground')}><Zap size={12} /> Live</button>
            <button onClick={exportCsv} disabled={!data} className="h-8 px-2.5 rounded-lg border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"><Download size={12} /> Export</button>
            <button onClick={() => load(true)} disabled={loading} className="h-8 px-2.5 rounded-lg border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50">{loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh</button>
          </div>
        </div>

        {error && <div role="alert" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm"><AlertCircle size={15} />{error}<button onClick={() => load(true)} className="ml-auto underline text-xs">Try again</button></div>}

        {!data && loading && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 10 }, (_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>}

        {data && (
          <div className={cx('space-y-6 transition-opacity', loading && 'opacity-60')}>
            {/* Needs attention */}
            {data.attention.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {data.attention.map((a, i) => (
                  <div key={i} role="button" tabIndex={0} onClick={() => setDrill(a.drill)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrill(a.drill); } }} className={cx('rounded-xl border px-4 py-3 flex items-start gap-2.5 cursor-pointer hover:shadow-sm transition-shadow', levelStyle(a.level))}>
                    {a.level === 'info' ? <Info size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
                    <div className="min-w-0"><p className="text-sm font-medium">{a.title}</p><p className="text-xs opacity-80 mt-0.5">{a.detail}</p></div>
                    <Link href={a.href} onClick={e => e.stopPropagation()} className="ml-auto mt-0.5 shrink-0 text-[11px] underline opacity-80 hover:opacity-100">Open page</Link>
                  </div>
                ))}
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {data.kpis.map(k => {
                const active = !!k.metric && metrics.length === 1 && metrics[0] === k.metric;
                return (
                  <div key={k.key} onClick={e => { if (!(e.target as HTMLElement).closest(INTERACTIVE)) setDrill({ kind: 'kpi', id: k.key }); }} className={cx('rounded-xl border bg-card p-4 flex flex-col gap-1.5 transition-all cursor-pointer', active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40')}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => focusMetric(k.metric)} disabled={!k.metric} title={k.metric ? 'Show this on the trend chart' : undefined} className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-left disabled:cursor-default hover:text-foreground">{k.label}</button>
                      <Link href={k.href} aria-label={`Open ${k.label}`} className="text-muted-foreground hover:text-primary"><ChevronRight size={14} /></Link>
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{fmtValue(k.value, k.format)}</p>
                    <Delta kpi={k} />
                    <p className="text-[11px] text-muted-foreground leading-snug">{k.hint}</p>
                    <button onClick={() => setDrill({ kind: 'kpi', id: k.key })} className="mt-auto pt-1 text-left text-[11px] text-primary hover:underline">See who and why</button>
                  </div>
                );
              })}
            </div>

            {/* Trend and funnel */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <Panel className="xl:col-span-3" title="Daily activity" icon={<MessageSquare size={15} className="text-primary" />} onOpen={() => setDrill({ kind: 'days', id: '' })}
                right={<div className="inline-flex rounded-lg border border-border p-0.5 text-[11px]">{(['area', 'bar'] as const).map(c => <button key={c} onClick={() => setChart(c)} aria-pressed={chart === c} className={cx('px-2 py-0.5 rounded-md', chart === c ? 'bg-muted text-foreground' : 'text-muted-foreground')}>{c === 'area' ? 'Area' : 'Bars'}</button>)}</div>}>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {METRICS.map(m => { const on = metrics.includes(m.key); return <button key={m.key} onClick={() => toggleMetric(m.key)} aria-pressed={on} className={cx('px-2 py-0.5 rounded-full border text-[11px]', on ? 'border-transparent text-white' : 'border-border text-muted-foreground')} style={on ? { background: m.color } : undefined}>{m.label}</button>; })}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  {chart === 'area' ? (
                    <AreaChart data={visibleChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} onClick={dayClick} style={{ cursor: 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} /><Legend wrapperStyle={{ fontSize: 11 }} />
                      {shown.map(m => <Area key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} fill={m.color} fillOpacity={0.12} strokeWidth={2} />)}
                    </AreaChart>
                  ) : (
                    <BarChart data={visibleChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} onClick={dayClick} style={{ cursor: 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} /><Legend wrapperStyle={{ fontSize: 11 }} />
                      {shown.map(m => <Bar key={m.key} dataKey={m.key} name={m.label} fill={m.color} radius={[3, 3, 0, 0]} />)}
                    </BarChart>
                  )}
                </ResponsiveContainer>
                <p className="text-[11px] text-muted-foreground mt-2">Days are Mountain time. Click a day to see what happened.</p>
              </Panel>

              <Panel className="xl:col-span-2" title="Conversion funnel" icon={<Send size={15} className="text-blue-500" />} onOpen={() => setDrill({ kind: 'funnel', id: '' })} right={<span className="text-[11px] text-muted-foreground">Texts sent in this period</span>}>
                <div className="space-y-2.5">
                  {data.funnel.map((f, i) => (
                    <button key={f.key} onClick={() => setDrill({ kind: 'funnel', id: f.key })} className="block group w-full text-left">
                      <div className="flex items-baseline justify-between text-xs mb-1"><span className="font-medium text-foreground">{f.label}</span><span className="tabular-nums text-muted-foreground"><b className="text-foreground">{int(f.count)}</b>{i > 0 && <> · {f.pctOfPrevious}% of previous · {f.pctOfTexted}% of texted</>}</span></div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary/80 group-hover:bg-primary transition-all" style={{ width: `${Math.max((f.count / funnelMax) * 100, f.count ? 2 : 0)}%` }} /></div>
                    </button>
                  ))}
                </div>
                {data.funnel[3].count > 0 && data.funnel[4].count === 0 && (
                  <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300 rounded-lg bg-amber-500/10 px-2.5 py-2">Everyone who saw an estimate left before starting the form. Compare what the text promised with what the page showed (Campaigns, Estimate check).</p>
                )}
              </Panel>
            </div>

            {/* Campaigns */}
            <Panel title="Campaigns" icon={<Send size={15} className="text-primary" />} onOpen={() => setDrill({ kind: 'campaigns', id: '' })} right={<Link href="/campaigns" className="text-xs text-primary hover:underline">Open Campaigns</Link>}>
              {campaigns.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No campaigns for this filter.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs"><thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <SortHead label="Campaign" k="batch" sort={campSort} onSort={sortCamp} /><SortHead label="Status" k="status" sort={campSort} onSort={sortCamp} />
                    <SortHead label="Texts" k="texts" sort={campSort} onSort={sortCamp} right /><SortHead label="Delivered" k="deliveredPct" sort={campSort} onSort={sortCamp} right />
                    <SortHead label="Replies" k="replies" sort={campSort} onSort={sortCamp} right /><SortHead label="YES" k="yes" sort={campSort} onSort={sortCamp} right />
                    <SortHead label="Opened" k="opened" sort={campSort} onSort={sortCamp} right /><SortHead label="Saw estimate" k="viewed" sort={campSort} onSort={sortCamp} right />
                    <SortHead label="Hot" k="hot" sort={campSort} onSort={sortCamp} right /><SortHead label="Queued" k="queued" sort={campSort} onSort={sortCamp} right />
                  </tr></thead>
                    <tbody>{campaigns.map(c => (
                      <React.Fragment key={c.batch}>
                        <tr data-no-panel onClick={() => setDrill({ kind: 'campaign', id: c.batch })} className="border-b border-border/60 hover:bg-muted/40 cursor-pointer">
                          <td className="py-2 px-2 font-medium text-foreground max-w-[260px]"><span className="inline-flex items-center gap-1"><ChevronRight size={12} /><span className="truncate" title={c.batch}>{c.batch}</span></span>{c.audience && <span className="block text-[10px] text-muted-foreground ml-4">{c.audience}</span>}</td>
                          <td className="px-2"><span className={cx('px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize', statusChip(c.status))}>{c.status}</span></td>
                          <td className="px-2 text-right tabular-nums">{int(c.texts)}</td>
                          <td className={cx('px-2 text-right tabular-nums', c.sent > 0 && c.deliveredPct < 75 && 'text-amber-600')}>{c.sent ? `${c.deliveredPct}%` : '-'}</td>
                          <td className="px-2 text-right tabular-nums">{c.replies}</td><td className="px-2 text-right tabular-nums font-medium">{c.yes}</td>
                          <td className="px-2 text-right tabular-nums">{c.opened}</td><td className="px-2 text-right tabular-nums">{c.viewed}</td>
                          <td className="px-2 text-right tabular-nums">{c.hot}</td><td className="px-2 text-right tabular-nums">{c.queued || '-'}</td>
                        </tr>
                      </React.Fragment>))}</tbody></table>
                </div>
              )}
            </Panel>

            {/* States and who to call */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <Panel className="xl:col-span-3" title="By state" icon={<MapPin size={15} className="text-primary" />}
                onOpen={() => setDrill({ kind: 'states', id: '' })} right={<input value={stateSearch} onChange={e => setStateSearch(e.target.value)} placeholder="Find a state" aria-label="Find a state" className="h-7 w-28 rounded-lg border border-border bg-background px-2 text-xs" />}>
                <div className="overflow-auto max-h-[420px]">
                  <table className="w-full text-xs"><thead className="sticky top-0 bg-card"><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <SortHead label="State" k="state" sort={stateSort} onSort={sortState} /><SortHead label="Leads" k="leads" sort={stateSort} onSort={sortState} right /><SortHead label="Texted" k="texted" sort={stateSort} onSort={sortState} right />
                    <SortHead label="Delivered" k="delivered" sort={stateSort} onSort={sortState} right /><SortHead label="Replies" k="replies" sort={stateSort} onSort={sortState} right /><SortHead label="YES" k="yes" sort={stateSort} onSort={sortState} right />
                    <SortHead label="Hot" k="hot" sort={stateSort} onSort={sortState} right /><SortHead label="Queued" k="queued" sort={stateSort} onSort={sortState} right />
                  </tr></thead>
                    <tbody>{stateRows.map(s => (
                      <tr key={s.state} data-no-panel onClick={() => s.state !== '??' && setDrill({ kind: 'state', id: s.state })} className={cx('border-b border-border/60 hover:bg-muted/40', s.state !== '??' && 'cursor-pointer', s.state === state && 'bg-primary/5')}>
                        <td className="py-1.5 px-2 font-medium text-foreground w-40"><div className="flex items-center gap-2"><span className="w-7">{s.state}</span><div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-indigo-400" style={{ width: `${(s.leads / maxLeads) * 100}%` }} /></div></div></td>
                        <td className="px-2 text-right tabular-nums">{int(s.leads)}</td><td className="px-2 text-right tabular-nums">{s.texted || '-'}</td><td className="px-2 text-right tabular-nums">{s.delivered || '-'}</td>
                        <td className="px-2 text-right tabular-nums">{s.replies || '-'}</td><td className="px-2 text-right tabular-nums">{s.yes || '-'}</td><td className="px-2 text-right tabular-nums">{s.hot || '-'}</td><td className="px-2 text-right tabular-nums">{s.queued || '-'}</td>
                      </tr>))}</tbody></table>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Click a state for its details, where you can also filter the whole page to it. Lead counts exclude the Co-Host program.</p>
              </Panel>

              <Panel className="xl:col-span-2" title="Who to call first" icon={<Flame size={15} className="text-orange-500" />} onOpen={() => setDrill({ kind: 'hot', id: '' })} right={<span className="text-[11px] text-muted-foreground">Hot and warm homeowners</span>}>
                {data.hot.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No engaged homeowners yet for this filter.</p> : (
                  <ul className="divide-y divide-border">
                    {data.hot.map(h => (
                      <li key={`${h.leadId}-${h.batch}`}>
                        <button onClick={() => setDrill({ kind: 'lead', id: h.leadId })} className="w-full text-left flex items-start gap-2.5 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-lg">
                          <span className={cx('mt-1 w-2 h-2 rounded-full shrink-0', h.temperature === 'hot' ? 'bg-red-500' : 'bg-amber-400')} aria-label={h.temperature} />
                          <div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground truncate">{h.address}</p><p className="text-[11px] text-muted-foreground truncate">{h.owner ? `${h.owner} · ` : ''}{h.why}{h.at ? ` · ${ago(h.at)}` : ''}</p></div>
                          <ChevronRight size={14} className="text-muted-foreground mt-1 shrink-0" />
                        </button>
                      </li>))}
                  </ul>
                )}
              </Panel>
            </div>

            {/* Queue, pipeline, Co-Host */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel title="Send queue" icon={<CalendarClock size={15} className="text-sky-500" />} onOpen={() => setDrill({ kind: 'queue', id: '' })} right={<span className="text-[11px] text-muted-foreground">{int(data.queue.total)} queued</span>}>
                {data.queue.byDay.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Nothing scheduled.</p> : (
                  <div className="space-y-3">{data.queue.byDay.map(d => (
                    <div key={d.date} data-no-panel onClick={() => setDrill({ kind: 'queueday', id: d.date })} className="cursor-pointer rounded-lg -mx-2 px-2 py-1 hover:bg-muted/40"><div className="flex justify-between text-xs"><span className="font-medium text-foreground">{shortDay(d.date)}</span><span className="tabular-nums text-muted-foreground">{int(d.count)} texts</span></div>
                      <ul className="mt-1 space-y-0.5">{Object.entries(d.batches).map(([b, n]) => <li key={b} className="flex justify-between text-[11px] text-muted-foreground"><span className="truncate pr-2" title={b}>{b}</span><span className="tabular-nums">{n}</span></li>)}</ul></div>))}</div>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">Listings are rechecked every hour and texts to sold or pending homes are cancelled.</p>
              </Panel>

              <Panel title="Lead pipeline" icon={<Users size={15} className="text-indigo-500" />} onOpen={() => setDrill({ kind: 'pipeline', id: '' })} right={<Link href="/lead-management" className="text-xs text-primary hover:underline">Open leads</Link>}>
                <dl className="grid grid-cols-2 gap-2 text-xs mb-3">
                  {([['Leads in scope', data.tiers.total], ['Not yet contacted', data.tiers.untouched], ['Luxury', data.tiers.luxury], ['Score 70+', data.tiers.highScore]] as Array<[string, number]>).map(([l, n]) => <div key={l} data-no-panel onClick={() => setDrill({ kind: 'pipeline', id: l === 'Not yet contacted' ? 'untouched' : l === 'Luxury' ? 'luxury' : l === 'Score 70+' ? 'highscore' : '' })} className="rounded-lg bg-muted/50 px-2.5 py-2 cursor-pointer hover:bg-muted"><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</dt><dd className="text-base font-bold tabular-nums">{int(n)}</dd></div>)}
                </dl>
                <div className="space-y-2">{data.pipeline.map(p => (
                  <div key={p.key} data-no-panel onClick={() => setDrill({ kind: 'pipeline', id: p.key })} className="cursor-pointer rounded-lg -mx-2 px-2 py-1 hover:bg-muted/40"><div className="flex justify-between text-xs"><span>{p.label}</span><span className="tabular-nums text-muted-foreground">{int(p.count)} · {pct(p.count, data.tiers.total)}%</span></div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1"><div className={cx('h-full', p.key === 'rejected' ? 'bg-red-400' : p.key === 'callback_scheduled' ? 'bg-emerald-500' : 'bg-indigo-400')} style={{ width: `${Math.max(pct(p.count, data.tiers.total), p.count ? 1.5 : 0)}%` }} /></div></div>))}</div>
              </Panel>

              <Panel title="Co-Host program" icon={<Building2 size={15} className="text-purple-500" />} onOpen={() => setDrill({ kind: 'cohost', id: '' })} right={<Link href="/cohost" className="text-xs text-primary hover:underline">Open Co-Host</Link>}>
                <p className="text-xs text-muted-foreground mb-2">{int(data.cohost.listings)} Airbnb and Vrbo listings tracked. Kept separate from the homeowner numbers above.</p>
                <ul className="space-y-1 text-xs mb-3">{data.cohost.stages.slice(0, 6).map(s => <li key={s.stage} data-no-panel onClick={() => setDrill({ kind: 'cohost', id: s.stage })} className="flex justify-between cursor-pointer rounded px-1 -mx-1 hover:bg-muted/40"><span className="capitalize">{s.stage.replace(/_/g, ' ')}</span><span className="tabular-nums text-muted-foreground">{int(s.count)}</span></li>)}</ul>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([['Emails', data.cohost.emails.sent], ['Opened', data.cohost.emails.opened], ['Replied', data.cohost.emails.replied], ['Bounced', data.cohost.emails.bounced]] as Array<[string, number]>).map(([l, n]) => <div key={l} data-no-panel onClick={() => setDrill({ kind: 'cohost', id: 'emails' })} className="rounded-lg bg-muted/50 py-2 cursor-pointer hover:bg-muted"><p className="text-base font-bold tabular-nums">{n}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p></div>)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{data.cohost.offerPages.viewed} offer pages viewed, {data.cohost.offerPages.requested} audits requested.</p>
              </Panel>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Updated {when(data.updatedAt)} · {data.cached ? 'from a short cache' : `${data.queryMs} ms`} · {int(data.totals.textsAllTime)} campaign texts sent in total. Opens exclude link scanners; opt-outs count STOP and NO replies.
            </p>
          </div>
        )}
      </div>
      {drill && <DetailDrawer drill={drill} days={days} state={state} onClose={() => setDrill(null)} onFilterState={s => setState(s)} />}
    </AppLayout>
  );
}
