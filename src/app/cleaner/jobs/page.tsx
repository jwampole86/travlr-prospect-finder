'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { authFetch } from '@/lib/authFetch';
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, Copy, Loader2, Mail, Plus, RefreshCw, Sparkles, UserPlus, X } from 'lucide-react';

interface Cleaner { id: string; full_name: string; email: string | null; phone: string | null; status: string; rate_per_turnover: number | null }
interface Job {
  id: string; property_id: string | null; cleaner_id: string | null; cleaning_type: string; scheduled_date: string; time_window: string | null; special_instructions: string | null;
  status: string; same_day: boolean; checklist: Array<{ label: string; done: boolean }>; issues: string | null; cleaner_notes: string | null; cost: number | null;
  checked_in_at: string | null; checked_out_at: string | null; link_sent_at: string | null; linkToken: string;
  beforePhotos: string[]; afterPhotos: string[]; property: { address: string; city: string | null; state: string | null } | null;
}

const RANGES = [
  { id: 'week', label: 'Next 7 days', from: -1, to: 7 },
  { id: 'two', label: 'Next 14 days', from: -1, to: 14 },
  { id: 'month', label: 'Next 30 days', from: -1, to: 30 },
  { id: 'past', label: 'Last 14 days', from: -14, to: 0 },
] as const;
const STATUS_STYLE: Record<string, string> = {
  Scheduled: 'bg-blue-500/10 text-blue-600', 'In Progress': 'bg-amber-500/10 text-amber-600', Completed: 'bg-purple-500/10 text-purple-600',
  Verified: 'bg-emerald-500/10 text-emerald-600', 'Needs Redo': 'bg-red-500/10 text-red-600',
};
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const niceDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

export default function TurnoversPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('two');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [addCleaner, setAddCleaner] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = RANGES.find((x) => x.id === range)!;
    const res = await authFetch(`/api/property-ops/turnovers?from=${day(r.from)}&to=${day(r.to)}`);
    const data = await res.json();
    if (!res.ok) setError(data.error ?? 'Could not load turnovers'); else { setError(null); setJobs(data.jobs); setCleaners(data.cleaners); }
    setLoading(false);
  }, [range]);
  useEffect(() => { load(); }, [load]);

  async function call(method: 'POST' | 'PATCH', url: string, body: unknown, key: string, success?: string) {
    setBusy(key); setError(null); setNotice(null);
    const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? 'Request failed'); else if (success) setNotice(success);
    setBusy(null);
    return res.ok ? data : null;
  }

  const stats = useMemo(() => {
    const soon = day(2);
    return {
      unassigned: jobs.filter((j) => !j.cleaner_id && j.status === 'Scheduled' && j.scheduled_date <= soon).length,
      sameDay: jobs.filter((j) => j.same_day && ['Scheduled', 'In Progress'].includes(j.status)).length,
      review: jobs.filter((j) => j.status === 'Completed').length,
      redo: jobs.filter((j) => j.status === 'Needs Redo').length,
    };
  }, [jobs]);
  const grouped = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) m.set(j.scheduled_date, [...(m.get(j.scheduled_date) ?? []), j]);
    return [...m.entries()];
  }, [jobs]);
  const activeCleaners = cleaners.filter((c) => c.status === 'active');

  async function plan() {
    const data = await call('POST', '/api/property-ops/turnovers', { action: 'generate' }, 'plan');
    if (data) { setNotice(data.created ? `Planned ${data.created} turnover${data.created === 1 ? '' : 's'}${data.sameDay ? `, ${data.sameDay} same-day` : ''}.` : 'Every upcoming checkout already has a turnover.'); load(); }
  }
  async function send(job: Job) {
    const data = await call('POST', '/api/property-ops/turnovers/notify', { id: job.id }, `send-${job.id}`);
    if (!data) return;
    try { await navigator.clipboard.writeText(data.link); } catch { /* clipboard blocked */ }
    setNotice(data.emailed ? 'Link emailed to the cleaner and copied to your clipboard.' : 'Link copied. This cleaner has no email, so paste it into a text.');
    load();
  }

  return (
    <AppLayout>
      <div className="px-3 sm:px-6 py-5 max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Turnovers &amp; Cleaning</h1>
            <p className="text-sm text-muted-foreground mt-1">Every checkout gets a turnover. Assign a cleaner, send their private link, then review the photos.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAddCleaner(true)} className="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted flex items-center gap-1.5"><UserPlus className="w-4 h-4" />Add cleaner</button>
            <button onClick={plan} disabled={busy === 'plan'} className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">{busy === 'plan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Plan turnovers</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['Unassigned, next 48h', stats.unassigned, stats.unassigned ? 'text-red-600' : 'text-foreground'], ['Same-day turnovers', stats.sameDay, 'text-amber-600'], ['Awaiting your review', stats.review, 'text-purple-600'], ['Sent back for redo', stats.redo, stats.redo ? 'text-red-600' : 'text-foreground']].map(([label, n, color]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card p-4"><p className={`text-2xl font-bold font-mono-data ${color}`}>{n as number}</p><p className="text-xs text-muted-foreground mt-1">{label as string}</p></div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => <button key={r.id} onClick={() => setRange(r.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${range === r.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{r.label}</button>)}
          <button onClick={load} aria-label="Refresh" className="ml-auto p-2 rounded-lg hover:bg-muted"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{error}</p>}
        {notice && <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{notice}</p>}

        {loading && !jobs.length ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          : !grouped.length ? <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">No turnovers in this range. Click Plan turnovers to create one for each upcoming checkout.</div>
          : grouped.map(([date, list]) => (
            <section key={date}>
              <h2 className="text-sm font-semibold text-foreground mb-2">{niceDate(date)}{date === day(0) ? ' (today)' : ''}</h2>
              <div className="space-y-2">
                {list.map((j) => {
                  const expanded = open === j.id;
                  const done = j.checklist.filter((c) => c.done).length;
                  return (
                    <div key={j.id} className="rounded-xl border border-border bg-card">
                      <div className="p-3 sm:p-4 flex flex-wrap items-center gap-3">
                        <button onClick={() => setOpen(expanded ? null : j.id)} className="flex-1 min-w-[200px] text-left">
                          <p className="text-sm font-semibold text-foreground">{j.property?.address ?? 'Property'}<span className="font-normal text-muted-foreground">{j.property?.city ? `, ${j.property.city}` : ''}</span></p>
                          <p className="text-xs text-muted-foreground mt-0.5">{j.time_window ?? ''} · {j.cleaning_type}{j.same_day ? ' · same-day' : ''}{j.checklist.length ? ` · checklist ${done}/${j.checklist.length}` : ''}</p>
                        </button>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[j.status] ?? 'bg-muted'}`}>{j.status}</span>
                        <select value={j.cleaner_id ?? ''} onChange={(e) => call('PATCH', '/api/property-ops/turnovers', { id: j.id, cleanerId: e.target.value || null }, `assign-${j.id}`).then(() => load())} className="min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg max-w-[180px]">
                          <option value="">Unassigned</option>
                          {activeCleaners.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                        <button onClick={() => send(j)} disabled={!j.cleaner_id || busy === `send-${j.id}`} title={j.cleaner_id ? 'Email the cleaner their private link' : 'Assign a cleaner first'} className="min-h-[40px] px-3 text-sm font-medium border border-border rounded-lg hover:bg-muted flex items-center gap-1.5 disabled:opacity-40">{busy === `send-${j.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : j.link_sent_at ? <Copy className="w-4 h-4" /> : <Mail className="w-4 h-4" />}{j.link_sent_at ? 'Resend link' : 'Send link'}</button>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </div>

                      {expanded && (
                        <div className="border-t border-border p-4 space-y-4">
                          {j.special_instructions && <p className="text-sm text-muted-foreground">Notes: {j.special_instructions}</p>}
                          {(j.issues || j.cleaner_notes) && <div className="rounded-lg bg-amber-500/5 border border-amber-500/30 p-3 text-sm">{j.issues && <p><strong>Issues:</strong> {j.issues}</p>}{j.cleaner_notes && <p><strong>Cleaner notes:</strong> {j.cleaner_notes}</p>}</div>}
                          {(['beforePhotos', 'afterPhotos'] as const).map((k) => j[k].length > 0 && (
                            <div key={k}><p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />{k === 'beforePhotos' ? 'Before' : 'After'}</p><div className="flex flex-wrap gap-2">{j[k].map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" className="w-20 h-20 object-cover rounded-lg" /></a>)}</div></div>
                          ))}
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs text-muted-foreground">Cost to owner ($)<input type="number" min="0" step="0.01" defaultValue={j.cost ?? ''} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== j.cost) call('PATCH', '/api/property-ops/turnovers', { id: j.id, cost: v }, `cost-${j.id}`, 'Cost saved. It is billed to the owner when you verify the clean.'); }} className="mt-1 block w-28 min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                            <label className="text-xs text-muted-foreground">Time window<input defaultValue={j.time_window ?? ''} onBlur={(e) => { if (e.target.value !== (j.time_window ?? '')) call('PATCH', '/api/property-ops/turnovers', { id: j.id, timeWindow: e.target.value }, `tw-${j.id}`).then(() => load()); }} className="mt-1 block w-44 min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                            {j.status === 'Completed' && (
                              <>
                                <button onClick={() => call('PATCH', '/api/property-ops/turnovers', { id: j.id, status: 'Verified' }, `v-${j.id}`, 'Verified.').then(() => load())} className="min-h-[40px] px-4 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:opacity-90">Verify clean</button>
                                <button onClick={() => call('PATCH', '/api/property-ops/turnovers', { id: j.id, status: 'Needs Redo' }, `r-${j.id}`, 'Sent back to the cleaner.').then(() => load())} className="min-h-[40px] px-4 text-sm font-medium border border-red-500/40 text-red-600 rounded-lg hover:bg-red-500/5">Needs redo</button>
                              </>
                            )}
                            <a href={`/cleaner/job/${j.linkToken}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline pb-3">Open cleaner view</a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
      </div>

      {addCleaner && <AddCleaner onClose={() => setAddCleaner(false)} onAdded={() => { setAddCleaner(false); load(); }} />}
    </AppLayout>
  );
}

function AddCleaner({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', phone: '', rate: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setErr(null);
    const res = await authFetch('/api/property-ops/cleaners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, rate: f.rate ? Number(f.rate) : undefined }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) setErr(data.error ?? 'Could not add the cleaner'); else onAdded();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-foreground flex items-center gap-2"><Plus className="w-4 h-4" />Add a cleaner</h2><button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button></div>
        {(['fullName', 'email', 'phone', 'rate'] as const).map((k) => (
          <label key={k} className="block text-xs text-muted-foreground">{{ fullName: 'Name', email: 'Email', phone: 'Phone', rate: 'Rate per turnover ($, optional)' }[k]}
            <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} type={k === 'rate' ? 'number' : 'text'} className="mt-1 block w-full min-h-[44px] px-3 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
        ))}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button onClick={save} disabled={saving} className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Add cleaner'}</button>
      </div>
    </div>
  );
}
