'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, ArrowLeft, CheckCircle, ChevronDown, ChevronUp, Clock, Download, Link2, Play, RefreshCw, Search, Shield, Wrench } from 'lucide-react';

type Status = 'operational' | 'degraded' | 'outage' | 'maintenance';
type Group = 'core' | 'messaging' | 'data' | 'jobs';
interface Day { date: string; status: Status | 'none'; uptime: number | null; checks: number }
interface Hour { t: string; status: Status | 'none'; avgMs: number | null; checks: number }
interface Service {
  id: string; name: string; description: string; group: Group; slaTarget: number; checks: string; impact: string; status: Status; responseMs: number | null;
  lastChecked: string | null; stale: boolean; detail?: string; fix?: string; lastFailureAt: string | null; uptime30d: number | null; uptime90d: number | null; avgMs30d: number | null; days: Day[]; hours: Hour[];
}
interface Incident { id: string; service: string; serviceName: string; severity: 'major' | 'minor'; status: 'ongoing' | 'resolved'; startedAt: string; resolvedAt: string | null; durationMin: number; samples: number; detail?: string }
interface Summary { uptime30d: number | null; avgMs24h: number | null; checksRecorded: number; since: string | null; incidents30d: number; ongoing: number }
interface Report { checkedAt: string | null; overall: Status; services: Service[]; incidents: Incident[]; summary: Summary; viewer: { admin: boolean } }
interface Point { t: string; status: Status; ms: number | null; detail?: string | null }

const GROUPS: Array<{ id: Group | 'all'; label: string }> = [{ id: 'all', label: 'All' }, { id: 'core', label: 'Core' }, { id: 'messaging', label: 'Messaging' }, { id: 'data', label: 'Data & AI' }, { id: 'jobs', label: 'Background jobs' }];
const LABEL: Record<Status, string> = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', maintenance: 'Not checked yet' };
const DOT: Record<Status, string> = { operational: 'bg-emerald-500', degraded: 'bg-amber-400', outage: 'bg-red-500', maintenance: 'bg-slate-400' };
const TEXT: Record<Status, string> = { operational: 'text-emerald-600', degraded: 'text-amber-600', outage: 'text-red-600', maintenance: 'text-slate-500' };
const BANNER: Record<Status, string> = { operational: 'bg-emerald-600', degraded: 'bg-amber-500', outage: 'bg-red-600', maintenance: 'bg-slate-500' };
const BANNER_TEXT: Record<Status, string> = { operational: 'All Systems Operational', degraded: 'Partial Degradation', outage: 'Service Outage', maintenance: 'Waiting for the first check' };
const RANK: Record<Status, number> = { outage: 0, degraded: 1, maintenance: 2, operational: 3 };

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const dur = (min: number) => (min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} d ${Math.round((min % 1440) / 60)} h`);
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' });
const pct = (n: number | null) => (n == null ? 'No data yet' : `${n.toFixed(n === 100 ? 0 : 2)}%`);
const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);

function download(name: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function ResponseChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const timed = points.filter(p => p.ms != null);
  if (points.length < 2) return <p className="text-xs text-slate-400">Not enough checks in this window to draw a chart.</p>;
  const W = 640, H = 130, P = 8;
  const t0 = Date.parse(points[0].t), t1 = Date.parse(points[points.length - 1].t) || t0 + 1;
  const max = Math.max(200, ...timed.map(p => p.ms as number));
  const x = (t: string) => P + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (ms: number) => H - P - (ms / max) * (H - 2 * P);
  const line = timed.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.ms as number).toFixed(1)}`).join(' ');
  const h = hover != null ? points[hover] : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 cursor-crosshair" role="img" aria-label="Response time history"
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const tx = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0); let best = 0; points.forEach((p, i) => { if (Math.abs(Date.parse(p.t) - tx) < Math.abs(Date.parse(points[best].t) - tx)) best = i; }); setHover(best); }}
        onMouseLeave={() => setHover(null)}>
        {points.map((p, i) => p.status !== 'operational' && <rect key={i} x={x(p.t) - 2} y={0} width={4} height={H} className={p.status === 'outage' ? 'fill-red-200' : 'fill-amber-200'} />)}
        {line && <path d={line} fill="none" className="stroke-emerald-500" strokeWidth={1.5} />}
        {h && <line x1={x(h.t)} x2={x(h.t)} y1={0} y2={H} className="stroke-slate-400" strokeDasharray="3 3" />}
        {h && h.ms != null && <circle cx={x(h.t)} cy={y(h.ms)} r={4} className={h.status === 'operational' ? 'fill-emerald-600' : h.status === 'outage' ? 'fill-red-600' : 'fill-amber-500'} />}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 chart-label"><span>{when(points[0].t)}</span><span>{h ? `${when(h.t)} · ${h.ms != null ? `${h.ms} ms` : 'no timing'} · ${LABEL[h.status]}` : `Peak ${max} ms · hover for detail`}</span><span>{when(points[points.length - 1].t)}</span></div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-slate-800' }: { label: string; value: string; tone?: string }) {
  return <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="text-[11px] text-slate-500 chart-label">{label}</p><p className={`text-base font-bold ${tone}`}>{value}</p></div>;
}

function ServiceRow({ svc, open, onToggle, admin, onShowIncidents, incidentCount }: { svc: Service; open: boolean; onToggle: () => void; admin: boolean; onShowIncidents: () => void; incidentCount: number }) {
  const [hours, setHours] = useState(24);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [dayPoints, setDayPoints] = useState<Point[] | null>(null);
  const [copied, setCopied] = useState(false);
  const load = (qs: string, set: (p: Point[]) => void) => fetch(`/api/system/health/history?service=${svc.id}&${qs}`, { cache: 'no-store' }).then(r => r.json()).then(j => set(j.points ?? [])).catch(() => set([]));
  useEffect(() => { if (!open) return; setPoints(null); void load(`hours=${hours}`, setPoints); }, [open, hours, svc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open || !day) { setDayPoints(null); return; } setDayPoints(null); void load(`date=${day}`, setDayPoints); }, [open, day, svc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const ms = (points ?? []).map(p => p.ms).filter((v): v is number => v != null).sort((a, b) => a - b);
    const bad = (points ?? []).filter(p => p.status !== 'operational').length;
    return { n: points?.length ?? 0, bad, min: ms[0] ?? null, p50: quantile(ms, 0.5), p95: quantile(ms, 0.95), max: ms[ms.length - 1] ?? null };
  }, [points]);
  const withData = svc.days.filter(d => d.status !== 'none').length;
  const slaMet = svc.uptime30d == null ? null : svc.uptime30d >= svc.slaTarget;
  const copy = () => { const u = `${location.origin}${location.pathname}#${svc.id}`; void navigator.clipboard?.writeText(u).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  return (
    <div id={svc.id} className={`bg-white border rounded-xl overflow-hidden scroll-mt-4 ${svc.status === 'operational' ? 'border-slate-200' : svc.status === 'outage' ? 'border-red-200' : 'border-amber-200'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[svc.status]}`} />
        <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-slate-800 truncate">{svc.name}</span><span className="block text-xs text-slate-500 truncate">{svc.description}</span></span>
        <span className="hidden sm:flex gap-[2px] w-24" aria-hidden>{svc.hours.slice(-12).map(h => <span key={h.t} className={`h-4 flex-1 rounded-[1px] ${h.status === 'none' ? 'bg-slate-200' : DOT[h.status as Status]}`} />)}</span>
        <span className="hidden sm:block text-right text-xs text-slate-500 w-16">{svc.responseMs != null ? `${svc.responseMs} ms` : '—'}</span>
        <span className="hidden sm:block text-right text-xs text-slate-500 w-20">{pct(svc.uptime30d)}</span>
        <span className={`text-xs font-semibold w-28 text-right ${TEXT[svc.status]}`}>{LABEL[svc.status]}</span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-5 bg-slate-50/50">
          {svc.stale && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">The last check is {ago(svc.lastChecked)}. Checks normally run every 5 minutes.</p>}
          {admin && svc.detail && <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2"><span className="font-semibold">Latest check: </span>{svc.detail}</p>}
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="font-semibold text-slate-700 mb-1">What is checked</p><p className="text-slate-600">{svc.checks}</p></div>
            <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="font-semibold text-slate-700 mb-1">If it fails</p><p className="text-slate-600">{svc.impact}</p></div>
          </div>
          {admin && svc.fix && svc.status !== 'operational' && <p className="text-xs bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-3 py-2 flex gap-2"><Wrench size={13} className="shrink-0 mt-0.5" /><span><span className="font-semibold">Suggested fix: </span>{svc.fix}</span></p>}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="30-day uptime" value={pct(svc.uptime30d)} />
            <Stat label="90-day uptime" value={pct(svc.uptime90d)} />
            <Stat label={`Target ${svc.slaTarget}%`} value={slaMet == null ? 'Too early' : slaMet ? 'Met' : 'Missed'} tone={slaMet == null ? 'text-slate-500' : slaMet ? 'text-emerald-600' : 'text-red-600'} />
            <Stat label="Avg response (30d)" value={svc.avgMs30d != null ? `${svc.avgMs30d} ms` : '—'} />
            <Stat label="Last problem" value={svc.lastFailureAt ? ago(svc.lastFailureAt) : 'None in 30 days'} tone={svc.lastFailureAt ? 'text-amber-600' : 'text-emerald-600'} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5"><p className="text-xs font-semibold text-slate-600">Last 90 days (select a day for its checks)</p><p className="text-[10px] text-slate-400 chart-label">{withData} day{withData === 1 ? '' : 's'} with recorded checks</p></div>
            <div className="flex gap-[2px]">
              {svc.days.map(d => (
                <button type="button" key={d.date} disabled={d.status === 'none'} onClick={() => setDay(day === d.date ? null : d.date)} aria-label={d.date}
                  title={d.status === 'none' ? `${d.date}: no checks recorded` : `${d.date}: ${LABEL[d.status as Status]} · ${pct(d.uptime)} up · ${d.checks} checks`}
                  className={`h-7 flex-1 rounded-[2px] ${d.status === 'none' ? 'bg-slate-200' : DOT[d.status as Status]} ${day === d.date ? 'ring-2 ring-slate-800 ring-offset-1' : 'hover:opacity-70'}`} />
              ))}
            </div>
            {day && (
              <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-slate-700">{day} (Mountain time)</p>
                  <div className="flex gap-3 text-xs">{dayPoints && dayPoints.length > 0 && <button type="button" className="flex items-center gap-1 text-slate-600 hover:underline" onClick={() => download(`${svc.id}-${day}.csv`, [['time', 'status', 'response_ms', ...(admin ? ['detail'] : [])], ...dayPoints.map(p => [p.t, p.status, p.ms, ...(admin ? [p.detail] : [])])])}><Download size={11} />CSV</button>}<button type="button" className="text-slate-500 hover:underline" onClick={() => setDay(null)}>Close</button></div></div>
                {dayPoints == null ? <p className="text-xs text-slate-400">Loading…</p> : dayPoints.length === 0 ? <p className="text-xs text-slate-400">No checks were recorded that day.</p> : (
                  <>
                    <ResponseChart points={dayPoints} />
                    <p className="text-xs text-slate-500 mt-2">{dayPoints.length} checks, {dayPoints.filter(p => p.status !== 'operational').length} not healthy.</p>
                    {dayPoints.some(p => p.status !== 'operational') && <ul className="mt-2 space-y-1 max-h-40 overflow-auto text-xs">{dayPoints.filter(p => p.status !== 'operational').map(p => <li key={p.t} className="flex gap-2"><span className="text-slate-500 w-16 shrink-0">{clock(p.t)}</span><span className={`font-semibold w-20 shrink-0 ${TEXT[p.status]}`}>{LABEL[p.status]}</span><span className="text-slate-600">{admin ? p.detail : p.ms != null ? `${p.ms} ms` : ''}</span></li>)}</ul>}
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-600">Response time</p>
              <div className="flex gap-1">{[6, 24, 72, 168].map(h => <button key={h} type="button" onClick={() => setHours(h)} className={`text-[10px] px-2 py-0.5 rounded-md border ${hours === h ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{h < 72 ? `${h}h` : `${h / 24}d`}</button>)}</div>
            </div>
            {points == null ? <p className="text-xs text-slate-400">Loading…</p> : (
              <>
                <ResponseChart points={points} />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2 text-xs">
                  {([['Checks', String(stats.n)], ['Not healthy', String(stats.bad)], ['Fastest', stats.min != null ? `${stats.min} ms` : '—'], ['Median', stats.p50 != null ? `${stats.p50} ms` : '—'], ['95th pct', stats.p95 != null ? `${stats.p95} ms` : '—'], ['Slowest', stats.max != null ? `${stats.max} ms` : '—']] as const).map(([l, v]) => <div key={l} className="bg-white border border-slate-200 rounded-md px-2 py-1.5"><p className="text-[10px] text-slate-500 chart-label">{l}</p><p className="font-semibold text-slate-800">{v}</p></div>)}
                </div>
                {points.length > 0 && (
                  <details className="mt-3 bg-white border border-slate-200 rounded-lg">
                    <summary className="text-xs font-medium text-slate-700 px-3 py-2 cursor-pointer">Recent checks</summary>
                    <div className="px-3 pb-3 max-h-56 overflow-auto"><table className="w-full text-xs"><tbody>
                      {[...points].reverse().slice(0, 30).map(p => <tr key={p.t} className="border-t border-slate-100"><td className="py-1 pr-2 text-slate-500 whitespace-nowrap">{when(p.t)}</td><td className={`py-1 pr-2 font-semibold whitespace-nowrap ${TEXT[p.status]}`}>{LABEL[p.status]}</td><td className="py-1 pr-2 text-slate-500 whitespace-nowrap">{p.ms != null ? `${p.ms} ms` : '—'}</td>{admin && <td className="py-1 text-slate-600">{p.detail}</td>}</tr>)}
                    </tbody></table></div>
                    <div className="px-3 pb-3"><button type="button" className="flex items-center gap-1 text-xs text-slate-600 hover:underline" onClick={() => download(`${svc.id}-${hours}h.csv`, [['time', 'status', 'response_ms', ...(admin ? ['detail'] : [])], ...points.map(p => [p.t, p.status, p.ms, ...(admin ? [p.detail] : [])])])}><Download size={11} />Download these {points.length} checks (CSV)</button></div>
                  </details>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
            <span>Last checked {ago(svc.lastChecked)}</span>
            <span className="flex items-center gap-4">
              <button type="button" onClick={copy} className="flex items-center gap-1 font-medium text-slate-700 hover:underline"><Link2 size={11} />{copied ? 'Link copied' : 'Copy link'}</button>
              <button type="button" onClick={onShowIncidents} className="font-medium text-slate-700 hover:underline">{incidentCount ? `View ${incidentCount} incident${incidentCount === 1 ? '' : 's'}` : 'No incidents in 30 days'}</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  const router = useRouter();
  const goBack = () => (window.history.length > 1 ? router.back() : router.push('/'));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(true);
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'status' | 'name' | 'uptime' | 'speed'>('status');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [incService, setIncService] = useState('all');
  const [incState, setIncState] = useState<'all' | 'ongoing' | 'resolved'>('all');
  const [openInc, setOpenInc] = useState<string | null>(null);
  const incRef = useRef<HTMLDivElement>(null);
  const hashHandled = useRef(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch('/api/system/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setReport(await res.json()); setError(null);
    } catch { setError('The status could not be loaded. This page will retry automatically.'); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!auto) return; const id = setInterval(() => void load(true), 30_000); return () => clearInterval(id); }, [auto, load]);
  useEffect(() => {
    if (!report || hashHandled.current) return; hashHandled.current = true;
    const id = location.hash.slice(1); if (id && report.services.some(s => s.id === id)) { setOpen(new Set([id])); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
  }, [report]);

  async function runNow() {
    setRunning(true);
    try { const res = await fetch('/api/system/health', { method: 'POST' }); if (res.ok) { setReport(await res.json()); setError(null); } else setError('The checks could not be run.'); }
    catch { setError('The checks could not be run.'); } finally { setRunning(false); }
  }

  const services = report?.services ?? [];
  const incidents = report?.incidents ?? [];
  const counts = useMemo(() => ({ operational: services.filter(s => s.status === 'operational').length, degraded: services.filter(s => s.status === 'degraded').length, outage: services.filter(s => s.status === 'outage').length }), [services]);
  const ongoing = incidents.filter(i => i.status === 'ongoing');
  const q = query.trim().toLowerCase();
  const shown = services
    .filter(s => (group === 'all' || s.group === group) && (statusFilter === 'all' || s.status === statusFilter) && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'uptime' ? (a.uptime30d ?? 101) - (b.uptime30d ?? 101) : sort === 'speed' ? (b.responseMs ?? -1) - (a.responseMs ?? -1) : RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
  const shownIncidents = incidents.filter(i => (incService === 'all' || i.service === incService) && (incState === 'all' || i.status === incState));
  const overall: Status = report?.overall ?? 'maintenance';
  const admin = report?.viewer.admin === true;
  const sum = report?.summary;

  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const showIncidents = (service: string) => { setIncService(service); setIncState('all'); setTimeout(() => incRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); };
  const openService = (id: string) => { setGroup('all'); setStatusFilter('all'); setQuery(''); setOpen(prev => new Set(prev).add(id)); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const tile = (key: Status, label: string, value: number, color: string) => (
    <button type="button" key={label} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)} aria-pressed={statusFilter === key}
      className={`text-left bg-white border rounded-xl p-4 transition hover:shadow-sm ${statusFilter === key ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'}`}>
      <p className={`text-2xl font-bold ${color}`}>{value}</p><p className="text-xs text-slate-500 mt-0.5">{label}</p>
      <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-500"><Shield size={10} />{statusFilter === key ? 'Filtering, select to clear' : 'Select to filter'}</p>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`border-b ${BANNER[overall]}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 min-h-[44px] pr-3 -ml-1 pl-1 rounded-lg text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={18} /> Back
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-2 pb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Activity size={20} className="text-white" /></div>
            <div><h1 className="text-xl font-bold text-white">AVYRO System Status</h1><p className="text-sm text-white/90">Live checks of every service, recorded every 5 minutes</p></div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
            <div className={`w-2.5 h-2.5 rounded-full bg-white ${overall === 'operational' ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-semibold text-white">{BANNER_TEXT[overall]}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Clock size={12} />{report ? `Last check ${ago(report.checkedAt)}` : 'Loading…'}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Auto-refresh (30s)</label>
            <button type="button" onClick={() => void load()} disabled={refreshing} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
            {admin && <button type="button" onClick={() => void runNow()} disabled={running} className="flex items-center gap-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50"><Play size={12} />{running ? 'Running checks…' : 'Run checks now'}</button>}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">{error}</div>}

        {ongoing.length > 0 && (
          <button type="button" onClick={() => { showIncidents('all'); setIncState('ongoing'); }} className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 hover:bg-amber-100/60">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div><p className="text-sm font-semibold text-amber-800">{ongoing.length} active incident{ongoing.length > 1 ? 's' : ''}: {ongoing.map(i => i.serviceName).join(', ')}</p><p className="text-xs text-amber-700 mt-0.5">Select to see when each started and how long it has lasted.</p></div>
          </button>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tile('operational', 'Operational', counts.operational, 'text-emerald-600')}
          {tile('degraded', 'Degraded', counts.degraded, counts.degraded ? 'text-amber-600' : 'text-slate-400')}
          {tile('outage', 'Outage', counts.outage, counts.outage ? 'text-red-600' : 'text-slate-400')}
          <button type="button" onClick={() => showIncidents('all')} className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm">
            <p className={`text-2xl font-bold ${ongoing.length ? 'text-amber-600' : 'text-slate-700'}`}>{incidents.length}</p><p className="text-xs text-slate-500 mt-0.5">Incidents in 30 days</p>
            <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-500"><Shield size={10} />Select to view</p>
          </button>
        </div>

        {sum && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="Average 30-day uptime" value={pct(sum.uptime30d)} />
            <Stat label="Average response (24h)" value={sum.avgMs24h != null ? `${sum.avgMs24h} ms` : '—'} />
            <Stat label="Checks recorded" value={sum.checksRecorded.toLocaleString()} />
            <Stat label="Tracking since" value={sum.since ?? 'Not yet'} />
          </div>
        )}

        {services.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Last 24 hours</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
              <div className="min-w-[520px] space-y-1.5">
                {services.map(s => (
                  <button type="button" key={s.id} onClick={() => openService(s.id)} className="w-full flex items-center gap-3 group text-left">
                    <span className="w-40 shrink-0 text-xs text-slate-600 truncate group-hover:underline">{s.name}</span>
                    <span className="flex gap-[2px] flex-1">{s.hours.map(h => <span key={h.t} title={h.status === 'none' ? `${when(h.t)}: no checks` : `${when(h.t)}: ${LABEL[h.status as Status]} · ${h.checks} checks${h.avgMs != null ? ` · avg ${h.avgMs} ms` : ''}`} className={`h-5 flex-1 rounded-[2px] ${h.status === 'none' ? 'bg-slate-200' : DOT[h.status as Status]}`} />)}</span>
                  </button>
                ))}
                <div className="flex justify-between text-[10px] text-slate-400 chart-label pl-[172px] pt-1"><span>24 hours ago</span><span>Now</span></div>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Services</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative"><Search size={12} className="absolute left-2 top-2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search services" aria-label="Search services" className="text-xs border border-slate-200 rounded-lg bg-white pl-6 pr-2 py-1.5 w-36" /></div>
              <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort services" className="text-xs border border-slate-200 rounded-lg bg-white px-2 py-1.5">
                <option value="status">Sort: problems first</option><option value="name">Sort: name</option><option value="uptime">Sort: lowest uptime</option><option value="speed">Sort: slowest</option>
              </select>
              <button type="button" onClick={() => setOpen(open.size ? new Set() : new Set(shown.map(s => s.id)))} className="text-xs border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 hover:bg-slate-50">{open.size ? 'Collapse all' : 'Expand all'}</button>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap mb-3">
            {GROUPS.map(g => <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={`text-xs px-2.5 py-1 rounded-full border ${group === g.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{g.label}</button>)}
            {statusFilter !== 'all' && <button type="button" onClick={() => setStatusFilter('all')} className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800">{LABEL[statusFilter]} only ✕</button>}
          </div>
          <div className="hidden sm:flex items-center gap-3 px-4 pb-1 text-[10px] uppercase tracking-wider text-slate-400 chart-label"><span className="w-2.5" /><span className="flex-1">Service</span><span className="w-24">Last 12 hours</span><span className="w-16 text-right">Speed</span><span className="w-20 text-right">30-day</span><span className="w-28 text-right">Status</span><span className="w-3.5" /></div>
          <div className="space-y-2">
            {!report && !error && <p className="text-sm text-slate-400">Loading services…</p>}
            {report && shown.length === 0 && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No services match these filters.</p>}
            {shown.map(s => <ServiceRow key={s.id} svc={s} open={open.has(s.id)} onToggle={() => toggle(s.id)} admin={admin} incidentCount={incidents.filter(i => i.service === s.id).length} onShowIncidents={() => showIncidents(s.id)} />)}
          </div>
        </div>

        <div ref={incRef} className="scroll-mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Incidents (last 30 days)</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'ongoing', 'resolved'] as const).map(s => <button key={s} type="button" onClick={() => setIncState(s)} className={`text-xs px-2.5 py-1 rounded-full border capitalize ${incState === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{s}</button>)}
              <select value={incService} onChange={e => setIncService(e.target.value)} className="text-xs border border-slate-200 rounded-lg bg-white px-2 py-1.5" aria-label="Filter incidents by service">
                <option value="all">All services</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {shownIncidents.length > 0 && <button type="button" onClick={() => download('incidents.csv', [['service', 'severity', 'status', 'started', 'resolved', 'minutes', 'failed_checks'], ...shownIncidents.map(i => [i.serviceName, i.severity, i.status, i.startedAt, i.resolvedAt, i.durationMin, i.samples])])} className="flex items-center gap-1 text-xs text-slate-600 hover:underline"><Download size={11} />CSV</button>}
            </div>
          </div>
          {shownIncidents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center"><CheckCircle size={28} className="text-emerald-400 mx-auto mb-2" /><p className="text-sm text-slate-500">No matching incidents in the last 30 days.</p></div>
          ) : (
            <div className="space-y-2">
              {shownIncidents.map(i => (
                <div key={i.id} className="bg-white border border-slate-200 rounded-xl">
                  <button type="button" onClick={() => setOpenInc(openInc === i.id ? null : i.id)} className="w-full text-left p-4 flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${i.severity === 'major' ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-slate-800">{i.serviceName}: {i.severity === 'major' ? 'outage' : 'degraded performance'}</span><span className="block text-xs text-slate-500">{when(i.startedAt)} · {i.status === 'ongoing' ? `ongoing for ${dur(i.durationMin)}` : `lasted ${dur(i.durationMin)}`}</span></span>
                    <span className={`text-xs font-semibold ${i.status === 'ongoing' ? 'text-amber-600' : 'text-emerald-600'}`}>{i.status === 'ongoing' ? 'Ongoing' : 'Resolved'}</span>
                    {openInc === i.id ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </button>
                  {openInc === i.id && (
                    <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600 space-y-1">
                      <p><span className="font-semibold">Started:</span> {when(i.startedAt)}</p>
                      <p><span className="font-semibold">{i.resolvedAt ? 'Resolved:' : 'Status:'}</span> {i.resolvedAt ? when(i.resolvedAt) : 'Still failing at the latest check'}</p>
                      <p><span className="font-semibold">Failed checks:</span> {i.samples}</p>
                      {admin && i.detail && <p><span className="font-semibold">Last reason:</span> {i.detail}</p>}
                      <button type="button" onClick={() => openService(i.service)} className="font-medium text-slate-800 hover:underline pt-1">Open {i.serviceName} details</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-6 flex items-center justify-between flex-wrap gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            {(['operational', 'degraded', 'outage'] as Status[]).map(s => <div key={s} className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded-sm ${DOT[s]}`} /><span>{LABEL[s]}</span></div>)}
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-200" /><span>No checks recorded</span></div>
          </div>
          <span>Uptime counts every recorded check that was not an outage. History begins when checks started being recorded.</span>
        </div>
      </div>
    </div>
  );
}
