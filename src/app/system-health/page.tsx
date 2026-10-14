'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Clock, RefreshCw, Shield, Play } from 'lucide-react';

type Status = 'operational' | 'degraded' | 'outage' | 'maintenance';
type Group = 'core' | 'messaging' | 'data' | 'jobs';
interface Day { date: string; status: Status | 'none'; uptime: number | null; checks: number }
interface Service {
  id: string; name: string; description: string; group: Group; slaTarget: number; status: Status; responseMs: number | null;
  lastChecked: string | null; stale: boolean; detail?: string; uptime30d: number | null; uptime90d: number | null; healthy30d: number | null; avgMs30d: number | null; days: Day[];
}
interface Incident { id: string; service: string; serviceName: string; severity: 'major' | 'minor'; status: 'ongoing' | 'resolved'; startedAt: string; resolvedAt: string | null; durationMin: number; worst: Status; samples: number; detail?: string }
interface Report { checkedAt: string | null; overall: Status; services: Service[]; incidents: Incident[]; viewer: { admin: boolean } }
interface Point { t: string; status: Status; ms: number | null }

const GROUPS: Array<{ id: Group | 'all'; label: string }> = [{ id: 'all', label: 'All' }, { id: 'core', label: 'Core' }, { id: 'messaging', label: 'Messaging' }, { id: 'data', label: 'Data & AI' }, { id: 'jobs', label: 'Background jobs' }];
const LABEL: Record<Status, string> = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', maintenance: 'Not checked yet' };
const DOT: Record<Status, string> = { operational: 'bg-emerald-500', degraded: 'bg-amber-400', outage: 'bg-red-500', maintenance: 'bg-slate-400' };
const TEXT: Record<Status, string> = { operational: 'text-emerald-600', degraded: 'text-amber-600', outage: 'text-red-600', maintenance: 'text-slate-500' };
const BANNER: Record<Status, string> = { operational: 'bg-emerald-600', degraded: 'bg-amber-500', outage: 'bg-red-600', maintenance: 'bg-slate-500' };
const BANNER_TEXT: Record<Status, string> = { operational: 'All Systems Operational', degraded: 'Partial Degradation', outage: 'Service Outage', maintenance: 'Waiting for the first check' };

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const dur = (min: number) => (min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} d ${Math.round((min % 1440) / 60)} h`);
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pct = (n: number | null) => (n == null ? 'No data yet' : `${n.toFixed(n === 100 ? 0 : 2)}%`);

function ResponseChart({ points }: { points: Point[] }) {
  if (points.length < 2) return <p className="text-xs text-slate-400">Not enough checks in this window to draw a chart.</p>;
  const W = 640, H = 120, P = 6;
  const t0 = Date.parse(points[0].t), t1 = Date.parse(points[points.length - 1].t) || t0 + 1;
  const max = Math.max(200, ...points.map(p => p.ms ?? 0));
  const x = (t: string) => P + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (ms: number) => H - P - (ms / max) * (H - 2 * P);
  const timed = points.filter(p => p.ms != null);
  const line = timed.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.ms as number).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" role="img" aria-label="Response time history">
        {points.filter(p => p.status !== 'operational').map((p, i) => <rect key={i} x={x(p.t) - 2} y={0} width={4} height={H} className={p.status === 'outage' ? 'fill-red-200' : 'fill-amber-200'} />)}
        {line && <path d={line} fill="none" className="stroke-emerald-500" strokeWidth={1.5} />}
        {timed.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.ms as number)} r={2.5} className={p.status === 'operational' ? 'fill-emerald-500' : p.status === 'outage' ? 'fill-red-500' : 'fill-amber-400'}><title>{`${when(p.t)}: ${p.ms} ms (${LABEL[p.status]})`}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400"><span>{when(points[0].t)}</span><span>Peak {max} ms</span><span>{when(points[points.length - 1].t)}</span></div>
    </div>
  );
}

function ServiceRow({ svc, open, onToggle, admin, onShowIncidents, incidentCount }: { svc: Service; open: boolean; onToggle: () => void; admin: boolean; onShowIncidents: () => void; incidentCount: number }) {
  const [hours, setHours] = useState(24);
  const [points, setPoints] = useState<Point[] | null>(null);
  useEffect(() => {
    if (!open) return; let live = true; setPoints(null);
    fetch(`/api/system/health/history?service=${svc.id}&hours=${hours}`, { cache: 'no-store' }).then(r => r.json()).then(j => { if (live) setPoints(j.points ?? []); }).catch(() => { if (live) setPoints([]); });
    return () => { live = false; };
  }, [open, hours, svc.id]);
  const withData = svc.days.filter(d => d.status !== 'none').length;
  const slaMet = svc.uptime30d == null ? null : svc.uptime30d >= svc.slaTarget;
  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${svc.status === 'operational' ? 'border-slate-200' : svc.status === 'outage' ? 'border-red-200' : 'border-amber-200'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[svc.status]}`} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-800 truncate">{svc.name}</span>
          <span className="block text-xs text-slate-500 truncate">{svc.description}</span>
        </span>
        <span className="hidden sm:block text-right text-xs text-slate-500 w-24">{svc.responseMs != null ? `${svc.responseMs} ms` : '—'}</span>
        <span className="hidden sm:block text-right text-xs text-slate-500 w-20">{pct(svc.uptime30d)}</span>
        <span className={`text-xs font-semibold w-28 text-right ${TEXT[svc.status]}`}>{LABEL[svc.status]}</span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/50">
          {svc.stale && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">The last check is {ago(svc.lastChecked)}. Checks normally run every 5 minutes.</p>}
          {admin && svc.detail && <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2"><span className="font-semibold">Latest check: </span>{svc.detail}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="text-slate-500">30-day uptime</p><p className="text-base font-bold text-slate-800">{pct(svc.uptime30d)}</p></div>
            <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="text-slate-500">90-day uptime</p><p className="text-base font-bold text-slate-800">{pct(svc.uptime90d)}</p></div>
            <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="text-slate-500">Target {svc.slaTarget}%</p><p className={`text-base font-bold ${slaMet == null ? 'text-slate-500' : slaMet ? 'text-emerald-600' : 'text-red-600'}`}>{slaMet == null ? 'Too early' : slaMet ? 'Met' : 'Missed'}</p></div>
            <div className="bg-white border border-slate-200 rounded-lg p-3"><p className="text-slate-500">Avg response (30d)</p><p className="text-base font-bold text-slate-800">{svc.avgMs30d != null ? `${svc.avgMs30d} ms` : '—'}</p></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><p className="text-xs font-semibold text-slate-600">Last 90 days</p><p className="text-[10px] text-slate-400">{withData} day{withData === 1 ? '' : 's'} with recorded checks</p></div>
            <div className="flex gap-[2px]">
              {svc.days.map(d => <div key={d.date} title={d.status === 'none' ? `${d.date}: no checks recorded` : `${d.date}: ${LABEL[d.status as Status]} · ${pct(d.uptime)} up · ${d.checks} checks`} className={`h-7 flex-1 rounded-[2px] ${d.status === 'none' ? 'bg-slate-200' : DOT[d.status as Status]}`} />)}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-600">Response time</p>
              <div className="flex gap-1">{[6, 24, 72, 168].map(h => <button key={h} type="button" onClick={() => setHours(h)} className={`text-[10px] px-2 py-0.5 rounded-md border ${hours === h ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{h < 72 ? `${h}h` : `${h / 24}d`}</button>)}</div>
            </div>
            {points == null ? <p className="text-xs text-slate-400">Loading…</p> : <ResponseChart points={points} />}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Last checked {ago(svc.lastChecked)}</span>
            <button type="button" onClick={onShowIncidents} className="font-medium text-slate-700 hover:underline">{incidentCount ? `View ${incidentCount} incident${incidentCount === 1 ? '' : 's'} for this service` : 'No incidents in 30 days'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(true);
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [incService, setIncService] = useState<string>('all');
  const [openInc, setOpenInc] = useState<string | null>(null);
  const incRef = useRef<HTMLDivElement>(null);

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

  async function runNow() {
    setRunning(true);
    try { const res = await fetch('/api/system/health', { method: 'POST' }); if (res.ok) { setReport(await res.json()); setError(null); } else setError('The checks could not be run.'); }
    catch { setError('The checks could not be run.'); } finally { setRunning(false); }
  }

  const services = report?.services ?? [];
  const incidents = report?.incidents ?? [];
  const counts = useMemo(() => ({ operational: services.filter(s => s.status === 'operational').length, degraded: services.filter(s => s.status === 'degraded').length, outage: services.filter(s => s.status === 'outage').length }), [services]);
  const ongoing = incidents.filter(i => i.status === 'ongoing');
  const shown = services.filter(s => (group === 'all' || s.group === group) && (statusFilter === 'all' || (statusFilter === 'operational' ? s.status === 'operational' : s.status === statusFilter)));
  const shownIncidents = incidents.filter(i => incService === 'all' || i.service === incService);
  const overall: Status = report?.overall ?? 'maintenance';
  const admin = report?.viewer.admin === true;

  const showIncidents = (service: string) => { setIncService(service); setTimeout(() => incRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); };
  const tile = (key: Status | 'all', label: string, value: number, color: string, sub: string) => (
    <button type="button" key={label} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)} aria-pressed={statusFilter === key}
      className={`text-left bg-white border rounded-xl p-4 transition hover:shadow-sm ${statusFilter === key ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'}`}>
      <p className={`text-2xl font-bold ${color}`}>{value}</p><p className="text-xs text-slate-500 mt-0.5">{label}</p>
      <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-500"><Shield size={10} />{sub}</p>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`border-b ${BANNER[overall]}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Activity size={20} className="text-white" /></div>
            <div><h1 className="text-xl font-bold text-white">TRAVLR System Status</h1><p className="text-sm text-white/90">Live checks of every service, recorded every 5 minutes</p></div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
            <div className={`w-2.5 h-2.5 rounded-full bg-white ${overall === 'operational' ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-semibold text-white">{BANNER_TEXT[overall]}</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Clock size={12} />{report ? `Last check ${ago(report.checkedAt)}` : 'Loading…'}</div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Auto-refresh (30s)</label>
            <button type="button" onClick={() => void load()} disabled={refreshing} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
            {admin && <button type="button" onClick={() => void runNow()} disabled={running} className="flex items-center gap-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50"><Play size={12} />{running ? 'Running checks…' : 'Run checks now'}</button>}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">{error}</div>}

        {ongoing.length > 0 && (
          <button type="button" onClick={() => showIncidents('all')} className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 hover:bg-amber-100/60">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div><p className="text-sm font-semibold text-amber-800">{ongoing.length} active incident{ongoing.length > 1 ? 's' : ''}: {ongoing.map(i => i.serviceName).join(', ')}</p><p className="text-xs text-amber-700 mt-0.5">Select to see when each started and how long it has lasted.</p></div>
          </button>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tile('operational', 'Operational', counts.operational, 'text-emerald-600', 'Select to filter')}
          {tile('degraded', 'Degraded', counts.degraded, counts.degraded ? 'text-amber-600' : 'text-slate-400', 'Select to filter')}
          {tile('outage', 'Outage', counts.outage, counts.outage ? 'text-red-600' : 'text-slate-400', 'Select to filter')}
          <button type="button" onClick={() => showIncidents('all')} className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm">
            <p className={`text-2xl font-bold ${ongoing.length ? 'text-amber-600' : 'text-slate-700'}`}>{incidents.length}</p><p className="text-xs text-slate-500 mt-0.5">Incidents in 30 days</p>
            <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-500"><Shield size={10} />Select to view</p>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Services</h2>
            <div className="flex items-center gap-1 flex-wrap">
              {GROUPS.map(g => <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={`text-xs px-2.5 py-1 rounded-full border ${group === g.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{g.label}</button>)}
              {statusFilter !== 'all' && <button type="button" onClick={() => setStatusFilter('all')} className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800">{LABEL[statusFilter]} only ✕</button>}
            </div>
          </div>
          <div className="space-y-2">
            {!report && !error && <p className="text-sm text-slate-400">Loading services…</p>}
            {report && shown.length === 0 && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No services match these filters.</p>}
            {shown.map(s => <ServiceRow key={s.id} svc={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} admin={admin} incidentCount={incidents.filter(i => i.service === s.id).length} onShowIncidents={() => showIncidents(s.id)} />)}
          </div>
        </div>

        <div ref={incRef} className="scroll-mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Incidents (last 30 days)</h2>
            <select value={incService} onChange={e => setIncService(e.target.value)} className="text-xs border border-slate-200 rounded-lg bg-white px-2 py-1.5" aria-label="Filter incidents by service">
              <option value="all">All services</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {shownIncidents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center"><CheckCircle size={28} className="text-emerald-400 mx-auto mb-2" /><p className="text-sm text-slate-500">No incidents recorded{incService === 'all' ? '' : ' for this service'} in the last 30 days.</p></div>
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
