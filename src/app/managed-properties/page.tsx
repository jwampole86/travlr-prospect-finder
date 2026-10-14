'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { authFetch } from '@/lib/authFetch';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, Building2, CheckCircle2, FileText, Loader2, Plus, Search, Send, Trash2, X } from 'lucide-react';

interface Property {
  id: string; lead_id: string; address: string; city: string | null; state: string | null; owner_name: string | null; owner_email: string | null; owner_phone: string | null;
  status: 'onboarding' | 'active' | 'paused' | 'offboarded'; management_fee_percent: number | null; payout_schedule: string | null; listing_urls: string[]; notes: string | null; agreement_signed_at: string | null;
  onboarding: { done: number; total: number }; upcomingTurnovers: number; nextTurnover: string | null; unassignedTurnovers: number; monthRevenue: number;
}
interface Task { id: string; key: string; title: string; detail: string | null; status: 'todo' | 'done' | 'blocked' | 'skipped'; auto: boolean; due_date: string | null; notes: string | null }
interface Detail {
  property: Property; tasks: Task[];
  bookings: Array<{ id: string; guest_name: string | null; check_in: string; check_out: string; nights: number | null; gross_revenue: number | null; platform: string | null; status: string }>;
  turnovers: Array<{ id: string; scheduled_date: string; time_window: string | null; status: string; same_day: boolean; cost: number | null }>;
  expenses: Array<{ id: string; expense_date: string; category: string; description: string | null; amount: number }>;
  statements: Array<{ id: string; period_start: string; period_end: string; gross_revenue: number; management_fee: number; expenses_total: number; net_payout: number; status: 'draft' | 'sent' | 'paid' }>;
}

const STATUS_STYLE = { onboarding: 'bg-amber-500/10 text-amber-600', active: 'bg-emerald-500/10 text-emerald-600', paused: 'bg-muted text-muted-foreground', offboarded: 'bg-muted text-muted-foreground' };
const CATEGORIES = ['Cleaning', 'Supplies', 'Repairs and maintenance', 'Utilities', 'Permits and licenses', 'Inspection', 'Other'];
const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const lastMonth = () => { const n = new Date(); return { start: new Date(n.getFullYear(), n.getMonth() - 1, 1).toLocaleDateString('en-CA'), end: new Date(n.getFullYear(), n.getMonth(), 0).toLocaleDateString('en-CA') }; };

export default function ManagedPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Property['status']>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch('/api/property-ops/properties');
    const data = await res.json();
    if (!res.ok) setError(data.error ?? 'Could not load properties'); else { setError(null); setProperties(data.properties); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => properties.filter((p) => (filter === 'all' || p.status === filter) && `${p.address} ${p.city} ${p.owner_name}`.toLowerCase().includes(query.toLowerCase())), [properties, filter, query]);
  const counts = useMemo(() => ({ onboarding: properties.filter((p) => p.status === 'onboarding').length, active: properties.filter((p) => p.status === 'active').length, month: properties.reduce((s, p) => s + p.monthRevenue, 0) }), [properties]);

  return (
    <AppLayout>
      <div className="px-3 sm:px-6 py-5 max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Managed Properties</h1>
            <p className="text-sm text-muted-foreground mt-1">Every home you manage: owner details, onboarding, turnovers, bookings and owner statements.</p>
          </div>
          <button onClick={() => setAdding(true)} className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 flex items-center gap-1.5"><Plus className="w-4 h-4" />Add property</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[['In onboarding', counts.onboarding], ['Active', counts.active], ['Revenue this month', usd(counts.month)]].map(([l, v]) => <div key={String(l)} className="rounded-xl border border-border bg-card p-4"><p className="text-xl sm:text-2xl font-bold font-mono-data text-foreground">{v}</p><p className="text-xs text-muted-foreground mt-1">{l}</p></div>)}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search address or owner" className="w-full min-h-[40px] pl-9 pr-3 text-sm bg-background border border-border rounded-lg" /></div>
          {(['all', 'onboarding', 'active', 'paused', 'offboarded'] as const).map((s) => <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${filter === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{s}</button>)}
        </div>

        {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{error}</p>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          : !shown.length ? <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">{properties.length ? 'No properties match.' : 'No managed properties yet. A property is added automatically when an owner finishes signing, or add one from a lead.'}</div>
          : (
            <div className="grid md:grid-cols-2 gap-3">
              {shown.map((p) => (
                <button key={p.id} onClick={() => setSelected(p.id)} className="text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-sm font-semibold text-foreground truncate">{p.address}</p><p className="text-xs text-muted-foreground truncate">{[p.city, p.state].filter(Boolean).join(', ')} · {p.owner_name ?? 'Owner not set'}</p></div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                  </div>
                  <div className="mt-3"><div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>Onboarding</span><span>{p.onboarding.done}/{p.onboarding.total}</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${p.onboarding.total ? (p.onboarding.done / p.onboarding.total) * 100 : 0}%` }} /></div></div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Revenue this month: <strong className="text-foreground">{usd(p.monthRevenue)}</strong></span>
                    <span>Next turnover: <strong className="text-foreground">{p.nextTurnover ?? 'none'}</strong></span>
                    {p.unassignedTurnovers > 0 && <span className="text-red-600 font-semibold">{p.unassignedTurnovers} unassigned</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>

      {selected && <DetailPanel id={selected} onClose={() => { setSelected(null); load(); }} />}
      {adding && <AddProperty onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); setSelected(id); load(); }} />}
    </AppLayout>
  );
}

function AddProperty({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ id: string; address: string; city: string | null; state: string | null }>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await createClient().from('leads').select('id, address, city, state').ilike('address', `%${q.trim()}%`).limit(8);
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function add(leadId: string) {
    const res = await authFetch('/api/property-ops/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId }) });
    const data = await res.json();
    if (!res.ok) setErr(data.error ?? 'Could not add'); else onAdded(data.id);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-foreground">Add a property from a lead</h2><button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button></div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a lead by street address" className="w-full min-h-[44px] px-3 text-sm bg-background border border-border rounded-lg" />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <ul className="divide-y divide-border">{results.map((r) => <li key={r.id}><button onClick={() => add(r.id)} className="w-full text-left py-3 text-sm hover:bg-muted/50 px-1"><span className="font-medium text-foreground">{r.address}</span><span className="text-muted-foreground">, {r.city} {r.state}</span></button></li>)}</ul>
      </div>
    </div>
  );
}

function DetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<'overview' | 'onboarding' | 'turnovers' | 'money'>('overview');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [period, setPeriod] = useState(lastMonth());
  const [exp, setExp] = useState({ date: new Date().toLocaleDateString('en-CA'), category: 'Cleaning', description: '', amount: '' });

  const load = useCallback(async () => {
    const res = await authFetch(`/api/property-ops/properties/${id}`);
    const data = await res.json();
    if (!res.ok) setErr(data.error ?? 'Could not load'); else setD(data);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, url: string, body?: unknown, ok?: string) {
    setErr(null); setNote(null);
    const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? 'Request failed'); return null; }
    if (ok) setNote(ok);
    await load();
    return data;
  }
  const patch = (fields: Record<string, unknown>, ok?: string) => call('PATCH', `/api/property-ops/properties/${id}`, fields, ok);

  async function viewStatement(sid: string) {
    const res = await authFetch(`/api/owner-statements/${sid}/view`);
    if (!res.ok) { setErr('Could not open the statement'); return; }
    window.open(URL.createObjectURL(await res.blob()), '_blank');
  }

  const p = d?.property;
  const tabs = [['overview', 'Overview'], ['onboarding', 'Onboarding'], ['turnovers', 'Turnovers'], ['money', 'Bookings & statements']] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button aria-label="Close" onClick={onClose} className="flex-1 cursor-default" />
      <aside className="w-full sm:max-w-2xl bg-background border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-base font-semibold text-foreground truncate flex items-center gap-2"><Building2 className="w-4 h-4 text-primary shrink-0" />{p?.address ?? 'Loading…'}</p>{p && <p className="text-xs text-muted-foreground mt-0.5">{[p.city, p.state].filter(Boolean).join(', ')}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-muted shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-4 sm:px-6 pt-3 border-b border-border flex gap-4 overflow-x-auto">
          {tabs.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 pb-2.5 text-sm font-semibold border-b-2 ${tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>{label}</button>)}
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {err && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{err}</p>}
          {note && <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{note}</p>}
          {!d ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
            <>
              {tab === 'overview' && p && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([['owner_name', 'Owner name'], ['owner_email', 'Owner email'], ['owner_phone', 'Owner phone'], ['payout_schedule', 'Payout schedule']] as const).map(([k, label]) => (
                      <label key={k} className="text-xs text-muted-foreground">{label}<input defaultValue={(p[k] as string | null) ?? ''} onBlur={(e) => { if (e.target.value !== ((p[k] as string | null) ?? '')) patch({ [k]: e.target.value || null }, 'Saved.'); }} className="mt-1 block w-full min-h-[40px] px-3 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                    ))}
                    <label className="text-xs text-muted-foreground">Management fee (%)<input type="number" step="0.01" defaultValue={p.management_fee_percent ?? ''} onBlur={(e) => patch({ management_fee_percent: e.target.value === '' ? null : Number(e.target.value) }, 'Saved. New statements use this fee.')} className="mt-1 block w-full min-h-[40px] px-3 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                    <label className="text-xs text-muted-foreground">Status<select value={p.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated.')} className="mt-1 block w-full min-h-[40px] px-3 text-sm bg-background border border-border rounded-lg text-foreground capitalize">{['onboarding', 'active', 'paused', 'offboarded'].map((s) => <option key={s}>{s}</option>)}</select></label>
                  </div>
                  <label className="block text-xs text-muted-foreground">Listing links (one per line)<textarea rows={3} defaultValue={p.listing_urls.join('\n')} onBlur={(e) => patch({ listing_urls: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }, 'Listing links saved.')} className="mt-1 block w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                  <label className="block text-xs text-muted-foreground">Internal notes<textarea rows={3} defaultValue={p.notes ?? ''} onBlur={(e) => { if (e.target.value !== (p.notes ?? '')) patch({ notes: e.target.value }, 'Saved.'); }} className="mt-1 block w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                  <p className="text-xs text-muted-foreground">Agreement signed: {p.agreement_signed_at ? new Date(p.agreement_signed_at).toLocaleDateString() : 'not yet'}. <a className="text-primary hover:underline" href={`/lead-profile?id=${p.lead_id}`}>Open lead</a></p>
                </div>
              )}

              {tab === 'onboarding' && (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {d.tasks.map((t) => (
                    <li key={t.id} className="p-4 flex items-start gap-3">
                      <input type="checkbox" checked={t.status === 'done'} onChange={(e) => call('PATCH', '/api/property-ops/tasks', { id: t.id, status: e.target.checked ? 'done' : 'todo' })} className="mt-1 w-5 h-5" aria-label={`Mark ${t.title} done`} />
                      <div className="flex-1 min-w-0"><p className={`text-sm font-medium ${t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{t.title}{t.auto && <span className="ml-2 text-[10px] font-bold uppercase text-primary">auto</span>}</p>{t.detail && <p className="text-xs text-muted-foreground mt-0.5">{t.detail}</p>}</div>
                      <select value={t.status} onChange={(e) => call('PATCH', '/api/property-ops/tasks', { id: t.id, status: e.target.value })} className="text-xs bg-background border border-border rounded-md px-1.5 py-1.5 min-h-[36px]">{['todo', 'done', 'blocked', 'skipped'].map((s) => <option key={s}>{s}</option>)}</select>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'turnovers' && (
                <div className="space-y-3">
                  <button onClick={() => call('POST', '/api/property-ops/turnovers', { action: 'generate', propertyId: id }, 'Turnovers planned for upcoming checkouts.')} className="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted">Plan turnovers for this property</button>
                  {d.turnovers.length === 0 ? <p className="text-sm text-muted-foreground">No turnovers yet.</p> : (
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">{d.turnovers.map((t) => <li key={t.id} className="p-3 flex items-center justify-between gap-2"><span>{t.scheduled_date} · {t.time_window}{t.same_day ? ' · same-day' : ''}</span><span className="text-xs font-semibold text-muted-foreground">{t.status}{t.cost ? ` · ${usd(t.cost)}` : ''}</span></li>)}</ul>
                  )}
                  <a href="/cleaner/jobs" className="text-xs text-primary hover:underline">Open the turnovers board</a>
                </div>
              )}

              {tab === 'money' && p && (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Owner statements</h3>
                    <div className="flex flex-wrap items-end gap-2 mb-3">
                      <label className="text-xs text-muted-foreground">From<input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} className="mt-1 block min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                      <label className="text-xs text-muted-foreground">To<input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} className="mt-1 block min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg text-foreground" /></label>
                      <button onClick={() => call('POST', '/api/property-ops/statements', { propertyId: id, start: period.start, end: period.end }, 'Statement built.')} className="min-h-[40px] px-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg flex items-center gap-1.5"><FileText className="w-4 h-4" />Build statement</button>
                    </div>
                    {d.statements.length === 0 ? <p className="text-sm text-muted-foreground">No statements yet. Revenue counts stays that ended in the period.</p> : (
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                        {d.statements.map((s) => (
                          <li key={s.id} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="flex-1 min-w-[160px]"><p className="font-medium text-foreground">{s.period_start} to {s.period_end}</p><p className="text-xs text-muted-foreground">Gross {usd(s.gross_revenue)} · fee {usd(s.management_fee)} · expenses {usd(s.expenses_total)} · <strong className="text-foreground">net {usd(s.net_payout)}</strong></p></div>
                            <span className="text-xs font-semibold capitalize text-muted-foreground">{s.status}</span>
                            <button onClick={() => viewStatement(s.id)} className="text-xs text-primary hover:underline">View</button>
                            {s.status === 'draft' && <button onClick={() => call('PATCH', '/api/property-ops/statements', { id: s.id, action: 'send' }, 'Statement sent to the owner.')} className="text-xs font-medium border border-border rounded-md px-2.5 py-1.5 flex items-center gap-1 hover:bg-muted"><Send className="w-3 h-3" />Send</button>}
                            {s.status === 'sent' && <button onClick={() => call('PATCH', '/api/property-ops/statements', { id: s.id, action: 'paid' }, 'Marked paid.')} className="text-xs font-medium border border-emerald-500/40 text-emerald-600 rounded-md px-2.5 py-1.5 hover:bg-emerald-500/5">Mark paid</button>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Expenses</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-[130px_1fr_1fr_100px_auto] gap-2 mb-3">
                      <input type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} className="min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg" />
                      <select value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })} className="min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                      <input value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} placeholder="Description" className="min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg col-span-2 sm:col-span-1" />
                      <input type="number" min="0" step="0.01" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} placeholder="Amount" className="min-h-[40px] px-2 text-sm bg-background border border-border rounded-lg" />
                      <button onClick={async () => { if (await call('POST', '/api/property-ops/expenses', { propertyId: id, ...exp, amount: Number(exp.amount) }, 'Expense added.')) setExp({ ...exp, description: '', amount: '' }); }} className="min-h-[40px] px-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg col-span-2 sm:col-span-1">Add</button>
                    </div>
                    {d.expenses.length > 0 && <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">{d.expenses.slice(0, 15).map((e) => <li key={e.id} className="p-3 flex items-center gap-3"><span className="flex-1">{e.expense_date} · {e.category}{e.description ? ` · ${e.description}` : ''}</span><span className="font-medium">{usd(e.amount)}</span><button aria-label="Delete expense" onClick={() => call('DELETE', `/api/property-ops/expenses?id=${e.id}`)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button></li>)}</ul>}
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Recent bookings</h3>
                    {d.bookings.length === 0 ? <p className="text-sm text-muted-foreground">No bookings recorded for this property yet.</p> : (
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">{d.bookings.slice(0, 15).map((b) => <li key={b.id} className="p-3 flex items-center gap-3"><span className="flex-1">{b.guest_name ?? 'Guest'} · {b.check_in} to {b.check_out}{b.platform ? ` · ${b.platform}` : ''}</span><span className="text-xs text-muted-foreground capitalize">{b.status}</span><span className="font-medium">{usd(b.gross_revenue)}</span></li>)}</ul>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
