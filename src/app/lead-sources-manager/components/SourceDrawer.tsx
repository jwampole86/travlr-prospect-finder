import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, MapPin, Pause, Pencil, Play, Plus, Search, X } from 'lucide-react';
import type { ConfigItem, IngestionMethod, SourceItem } from '@/lib/leadSourceTypes';
import { fmtNum, HEALTH_META, intervalLabel, relTime, sourceColor, STATUS_META } from '../utils';

type Tab = 'overview' | 'markets' | 'sync';
export interface ConfigPatch { market?: string; state?: string; city?: string; url?: string; method?: IngestionMethod; notes?: string }

interface Props {
  source: SourceItem;
  canManage: boolean;
  onClose: () => void;
  onToggle: (ids: string[], active: boolean) => void;
  /** Resolves to an error message, or null when saved. */
  onUpdate: (id: string, patch: ConfigPatch) => Promise<string | null>;
  onAddMarket: (name: string) => void;
}

const field = 'w-full h-9 px-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground tabular-nums leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Meter({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="text-foreground">{label}</span><span className="text-muted-foreground tabular-nums">{fmtNum(count)} <span className="font-semibold text-foreground">({total ? `${pct}%` : '-'})</span></span></div>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

function MarketRow({ c, canManage, onToggle, onUpdate }: { c: ConfigItem; canManage: boolean; onToggle: (id: string, v: boolean) => void; onUpdate: Props['onUpdate'] }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ market: c.market, state: c.state ?? '', city: c.city ?? '', url: c.url ?? '', method: c.method, notes: c.notes ?? '' });
  const hm = HEALTH_META[c.health];

  const save = async () => {
    setSaving(true); setErr(null);
    const e = await onUpdate(c.id, { market: f.market, state: f.state, city: f.city, url: f.url, method: f.method, notes: f.notes });
    setSaving(false);
    if (e) setErr(e); else setEditing(false);
  };

  return (
    <li className={`rounded-xl border bg-background transition-colors ${c.active ? 'border-border' : 'border-border/60 opacity-80'}`}>
      <div className="p-3 flex items-start gap-3">
        <div className="pt-0.5"><Switch checked={c.active} onChange={v => onToggle(c.id, v)} label={`${c.active ? 'Pause' : 'Resume'} ${c.market}`} disabled={!canManage} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{c.market}</span>
            {c.city && <span className="text-xs text-muted-foreground">· {c.city}</span>}
            {c.state && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.state}</span>}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${hm.chip}`}>{hm.label}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.method}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Last success {relTime(c.lastSuccess, 'never recorded')}{c.lastAttempt ? ` · tried ${relTime(c.lastAttempt)}` : ''}{c.leadCount ? ` · ${fmtNum(c.leadCount)} leads linked` : ''}
          </p>
          {c.error && <p className="mt-1.5 text-xs text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">{c.error}</p>}
          {c.notes && !editing && <p className="mt-1.5 text-xs text-muted-foreground italic">{c.notes}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.market} search`} className="w-8 h-8 rounded-lg hover:bg-muted inline-flex items-center justify-center text-muted-foreground"><ExternalLink size={14} /></a>}
          {canManage && <button type="button" onClick={() => setEditing(e => !e)} aria-label={`Edit ${c.market}`} aria-expanded={editing} className="w-8 h-8 rounded-lg hover:bg-muted inline-flex items-center justify-center text-muted-foreground">{editing ? <ChevronDown size={14} className="rotate-180" /> : <Pencil size={14} />}</button>}
        </div>
      </div>
      {editing && (
        <div className="border-t border-border p-3 space-y-2.5 bg-muted/30 rounded-b-xl">
          <div className="grid grid-cols-[1fr_72px_1fr] gap-2">
            <label className="block"><span className="text-[11px] text-muted-foreground">Market</span><input className={field} value={f.market} onChange={e => setF({ ...f, market: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-muted-foreground">State</span><input className={`${field} uppercase`} maxLength={2} value={f.state} onChange={e => setF({ ...f, state: e.target.value.toUpperCase() })} /></label>
            <label className="block"><span className="text-[11px] text-muted-foreground">City</span><input className={field} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-[1fr_130px] gap-2">
            <label className="block"><span className="text-[11px] text-muted-foreground">Search link</span><input type="url" className={field} value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://..." /></label>
            <label className="block"><span className="text-[11px] text-muted-foreground">Method</span>
              <select className={field} value={f.method} onChange={e => setF({ ...f, method: e.target.value as IngestionMethod })}><option value="manual">Manual</option><option value="scrape">Scrape</option><option value="api">API</option><option value="webhook">Webhook</option></select></label>
          </div>
          <label className="block"><span className="text-[11px] text-muted-foreground">Notes</span><textarea rows={2} maxLength={500} className={`${field} h-auto py-2 resize-none`} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
          {err && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setErr(null); }} className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:bg-muted">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-60 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />}Save</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function SourceDrawer({ source, canManage, onClose, onToggle, onUpdate, onAddMarket }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [q, setQ] = useState('');
  const [covFilter, setCovFilter] = useState<'all' | 'active' | 'unconfirmed' | 'errors'>('all');
  const color = sourceColor(source.key);
  const meta = STATUS_META[source.status];
  const s = source.stats;
  const activeCount = source.configs.filter(c => c.active).length;
  const allPaused = source.configs.length > 0 && activeCount === 0;

  useEffect(() => { setTab('overview'); setQ(''); setCovFilter('all'); }, [source.key]);

  const markets = useMemo(() => {
    const t = q.trim().toLowerCase();
    return source.configs.filter(c => !t || `${c.market} ${c.city ?? ''} ${c.state ?? ''}`.toLowerCase().includes(t));
  }, [source.configs, q]);

  const coverage = useMemo(() => source.coverage.items.filter(c => covFilter === 'all' ? true : covFilter === 'active' ? c.status === 'active' : covFilter === 'unconfirmed' ? c.status !== 'active' : !!c.lastError), [source.coverage.items, covFilter]);
  const maxWeek = Math.max(...s.weekly, 1);
  const maxState = Math.max(...s.byState.map(x => x.count), 1);

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [{ id: 'overview', label: 'Overview' }, { id: 'markets', label: 'Markets', count: source.configs.length }, { id: 'sync', label: 'Sync & coverage', count: source.coverage.total || undefined }];

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={`${source.name} details`}>
      <button type="button" aria-label="Close details" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <aside className="relative w-full max-w-2xl h-full bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <header className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl inline-flex items-center justify-center text-white font-bold text-lg shadow-sm" style={{ background: color }}>{source.name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground truncate">{source.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
                <span className="text-xs text-muted-foreground">{source.configs.length ? `${activeCount} of ${source.configs.length} markets active` : 'No markets configured'} · {fmtNum(s.total)} leads</span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl hover:bg-muted inline-flex items-center justify-center text-muted-foreground"><X size={18} /></button>
          </div>
          <nav className="flex gap-1 mt-4 -mb-3" role="tablist">
            {tabs.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.label}{t.count !== undefined && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.count}</span>}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'overview' && (
            <>
              {source.attentionCount > 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{source.attentionCount} issue{source.attentionCount > 1 ? 's' : ''} need a look. Open the Markets tab to see the error messages.</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Tile label="Leads" value={fmtNum(s.total)} sub={`${fmtNum(s.real)} real`} />
                <Tile label="Added 7 days" value={`+${fmtNum(s.added7d)}`} sub={`+${fmtNum(s.added30d)} in 30 days`} />
                <Tile label="Avg prospect score" value={s.avgScore === null ? '-' : String(s.avgScore)} sub="Out of 100" />
                <Tile label="Newest lead" value={relTime(s.newestAt, '-')} />
                <Tile label="Luxury" value={fmtNum(s.luxury)} />
                <Tile label="Fully verified" value={fmtNum(s.fullyVerified)} />
                <Tile label="Possible duplicates" value={fmtNum(s.duplicates)} />
                <Tile label="Contact coverage" value={s.quality === null ? '-' : `${s.quality}%`} sub="Phone, owner, address" />
              </div>

              <section>
                <h3 className="text-sm font-semibold text-foreground mb-3">Contact data quality</h3>
                {s.real > 0 ? (
                  <div className="space-y-3">
                    <Meter label="Phone on file" count={s.phone} total={s.real} color={color} />
                    <Meter label="Owner verified" count={s.verifiedOwner} total={s.real} color={color} />
                    <Meter label="Address verified" count={s.verifiedAddress} total={s.real} color={color} />
                    <Meter label="Phone number verified" count={s.verifiedPhone} total={s.real} color={color} />
                  </div>
                ) : <p className="text-sm text-muted-foreground">No leads yet, so there is nothing to measure.</p>}
                <p className="text-[11px] text-muted-foreground mt-3">Contact coverage = phone on file (40%) + owner verified (30%) + address verified (30%), measured on real leads.</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-foreground mb-3">New leads, last 8 weeks</h3>
                <div className="flex items-end gap-1.5 h-24">
                  {s.weekly.map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${fmtNum(v)} new`}>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{v ? fmtNum(v) : ''}</span>
                      <div className="w-full rounded-t-md transition-all duration-500" style={{ height: `${Math.max(v ? 6 : 2, (v / maxWeek) * 100)}%`, background: color, opacity: v ? 0.9 : 0.2 }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>7 weeks ago</span><span>This week</span></div>
              </section>

              {s.byState.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Top states</h3>
                  <ul className="space-y-2">
                    {s.byState.map(x => (
                      <li key={x.state} className="flex items-center gap-3 text-xs">
                        <span className="w-8 font-semibold text-foreground">{x.state}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(x.count / maxState) * 100}%`, background: color }} /></div>
                        <span className="w-14 text-right text-muted-foreground tabular-nums">{fmtNum(x.count)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {tab === 'markets' && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter markets" className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                {canManage && source.configs.length > 0 && (
                  <button type="button" onClick={() => onToggle(source.configs.map(c => c.id), allPaused)} className="h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-muted inline-flex items-center gap-1.5">
                    {allPaused ? <><Play size={14} /> Resume all</> : <><Pause size={14} /> Pause all</>}
                  </button>
                )}
                {canManage && <button type="button" onClick={() => onAddMarket(source.name)} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"><Plus size={14} /> Add market</button>}
              </div>
              {!canManage && <p className="text-xs text-muted-foreground">Only admins can pause, resume or edit markets.</p>}
              {markets.length ? (
                <ul className="space-y-2.5">{markets.map(c => <MarketRow key={c.id} c={c} canManage={canManage} onToggle={(id, v) => onToggle([id], v)} onUpdate={onUpdate} />)}</ul>
              ) : (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <MapPin size={22} className="mx-auto mb-2 opacity-50" />
                  {source.configs.length ? 'No markets match that filter.' : 'No markets are configured for this source yet.'}
                </div>
              )}
            </>
          )}

          {tab === 'sync' && (
            <>
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Sync schedule</h3>
                {source.schedule ? (
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-[11px] text-muted-foreground">Runs</dt><dd className="font-medium text-foreground">{intervalLabel(source.schedule.intervalMs)}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Status</dt><dd className="font-medium text-foreground capitalize">{source.schedule.status}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Failures in a row</dt><dd className={`font-medium ${source.schedule.failures ? 'text-red-600' : 'text-foreground'}`}>{source.schedule.failures}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Last run</dt><dd className="font-medium text-foreground">{relTime(source.schedule.lastSyncAt, 'Not yet')}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Next run</dt><dd className="font-medium text-foreground">{source.schedule.nextSyncAt ? relTime(source.schedule.nextSyncAt) : '-'}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Leads added</dt><dd className="font-medium text-foreground">{fmtNum(source.schedule.leadsAdded)}</dd></div>
                    {source.schedule.lastError && <div className="col-span-full text-xs text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">{source.schedule.lastError}</div>}
                  </dl>
                ) : <p className="text-sm text-muted-foreground">No sync schedule on record for this source.</p>}
                <Link href="/data-sync" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">Run a sync in Data Sync <ExternalLink size={13} /></Link>
              </section>

              <section>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground">Coverage <span className="text-muted-foreground font-normal">({source.coverage.total} zones, {fmtNum(source.coverage.imported)} imported)</span></h3>
                  <select value={covFilter} onChange={e => setCovFilter(e.target.value as typeof covFilter)} className="h-8 px-2 rounded-lg border border-border bg-background text-xs" aria-label="Filter coverage">
                    <option value="all">All zones</option><option value="active">Active</option><option value="unconfirmed">Not confirmed</option><option value="errors">With errors</option>
                  </select>
                </div>
                {coverage.length ? (
                  <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                    {coverage.map(c => (
                      <li key={c.id} className="px-3 py-2.5 flex items-start gap-3 text-xs bg-background">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${c.lastError ? 'bg-red-500' : c.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{c.zone} <span className="text-muted-foreground font-normal">· {c.portfolio}</span></p>
                          <p className="text-muted-foreground mt-0.5">{c.status === 'active' ? 'Active' : 'Not confirmed'} · last synced {relTime(c.lastSyncedAt, 'never')}{c.imported ? ` · ${fmtNum(c.imported)} imported` : ''}</p>
                          {c.note && <p className="text-muted-foreground mt-0.5">{c.note}</p>}
                          {c.lastError && <p className="text-red-700 dark:text-red-400 mt-0.5">{c.lastError}</p>}
                        </div>
                        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.zone}`} className="text-muted-foreground hover:text-foreground"><ExternalLink size={13} /></a>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground py-6 text-center">{source.coverage.total ? 'No zones match that filter.' : 'No coverage records for this source.'}</p>}
                {source.coverage.total > source.coverage.items.length && <p className="text-[11px] text-muted-foreground mt-2">Showing the first {source.coverage.items.length} of {source.coverage.total} zones.</p>}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
