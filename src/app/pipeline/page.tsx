'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ContractDealModal from '@/components/ContractDealModal';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { toast } from 'sonner';
import { AlertTriangle, ChevronsLeft, ChevronsRight, Hand, MapPin, RefreshCw, Search, Star, X, Zap, Phone, PhoneOff } from 'lucide-react';
import Link from 'next/link';
import LeadDrawer from './LeadDrawer';
import { type Card, type Column, type StageKey, STAGE_STYLE, money, scoreTone } from './types';

type MoveTo = 'human' | 'contract' | 'live' | 'closed' | 'auto';
const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const TEXTED_STAGES: StageKey[] = ['texted', 'engaged', 'hot', 'human', 'contract', 'live', 'unreachable', 'closed'];

function CardView({ card, onOpen, onDragStart, onDragEnd, dragging }: { card: Card; onOpen: (c: Card) => void; onDragStart: (c: Card) => void; onDragEnd: () => void; dragging: boolean }) {
  const heat = card.stage === 'hot' || card.stage === 'human' ? 'border-l-orange-500' : card.stage === 'engaged' ? 'border-l-amber-400' : 'border-l-transparent';
  return (
    <div role="button" tabIndex={0} draggable onClick={() => onOpen(card)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(card))}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id); onDragStart(card); }} onDragEnd={onDragEnd}
      className={`group bg-card border border-border border-l-4 ${heat} rounded-xl p-3 cursor-grab active:cursor-grabbing transition hover:shadow-md hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40 ${dragging ? 'opacity-40 scale-95' : ''}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-[11px] font-bold shrink-0 ${scoreTone(card.score)}`}>{card.score}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{card.address}</p>
          <p className="text-[11px] text-muted-foreground truncate">{card.city}, {card.state}{card.owner ? ` · ${card.owner}` : ''}</p>
        </div>
        {card.netMonthly ? <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{money(card.netMonthly)}<span className="font-normal text-muted-foreground">/mo</span></span> : null}
      </div>
      <p className={`mt-2 text-[11px] leading-snug line-clamp-2 ${card.replied ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{card.summary}</p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {card.luxury && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center gap-0.5"><Star size={8} />Luxury</span>}
        {card.program === 'co_host' && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300">Co-Host</span>}
        {card.hasPhone ? <Phone size={10} className="text-muted-foreground" aria-label="Has phone" /> : <PhoneOff size={10} className="text-muted-foreground/60" aria-label="No phone" />}
        {card.manual && <Hand size={10} className="text-muted-foreground" aria-label="Set by hand" />}
        <span className="ml-auto text-[10px] text-muted-foreground">{card.activityAgo ?? ''}</span>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { selectedPortfolio } = usePortfolio();
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [program, setProgram] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<'score' | 'activity' | 'net'>('score');
  const [hasPhone, setHasPhone] = useState(false);
  const [luxury, setLuxury] = useState(false);
  const [auto, setAuto] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<StageKey>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(false);
  const [more, setMore] = useState<Set<StageKey>>(new Set());
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<StageKey | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [contractLead, setContractLead] = useState<Card | null>(null);
  const reqId = useRef(0);

  const state = stateFilter || (/^[A-Z]{2}$/.test(selectedPortfolio.stateCode) ? selectedPortfolio.stateCode : '');
  const params = useMemo(() => { const p = new URLSearchParams(); if (q) p.set('q', q); if (state) p.set('state', state); if (program) p.set('program', program); if (minScore) p.set('minScore', String(minScore)); if (sort !== 'score') p.set('sort', sort); if (hasPhone) p.set('hasPhone', '1'); if (luxury) p.set('luxury', '1'); return p; }, [q, state, program, minScore, sort, hasPhone, luxury]);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (quiet = false) => {
    const id = ++reqId.current; if (!quiet) setRefreshing(true);
    try {
      const res = await fetch(`/api/pipeline/board?${params}`, { cache: 'no-store' }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'The pipeline could not be loaded.');
      if (id === reqId.current) { setColumns(j.columns); setError(null); setUpdatedAt(Date.now()); }
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : 'The pipeline could not be loaded.'); }
    finally { if (id === reqId.current) { setLoading(false); setRefreshing(false); } }
  }, [params]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!auto) return; const t = setInterval(() => { if (!dragging && !selected && document.visibilityState === 'visible') void load(true); }, 60_000); return () => clearInterval(t); }, [auto, load, dragging, selected]);

  async function loadMore(col: Column) {
    setMore(s => new Set(s).add(col.key));
    try {
      const p = new URLSearchParams(params); p.set('stage', col.key); p.set('offset', String(col.cards.length));
      const res = await fetch(`/api/pipeline/board?${p}`, { cache: 'no-store' }); const j = await res.json(); if (!res.ok) throw new Error(j.error);
      setColumns(cs => cs.map(c => c.key === col.key ? { ...c, cards: [...c.cards, ...(j.cards as Card[]).filter(n => !c.cards.some(o => o.id === n.id))] } : c));
    } catch { toast.error('Could not load more leads'); }
    finally { setMore(s => { const n = new Set(s); n.delete(col.key); return n; }); }
  }

  const moveCard = useCallback(async (card: Card, to: MoveTo, undo = false) => {
    const before = columns;
    if (to !== 'auto') setColumns(cs => cs.map(c => c.key === card.stage ? { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter(x => x.id !== card.id) } : c.key === to ? { ...c, count: c.count + 1, cards: [{ ...card, stage: to, manual: true, activityAgo: 'just now' }, ...c.cards] } : c));
    try {
      const res = await fetch('/api/pipeline/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: card.id, to }) }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'The move failed.');
      const label = to === 'auto' ? 'back to automatic tracking' : `to ${columns.find(c => c.key === to)?.label}`;
      if (undo) toast.success('Move undone'); else toast.success(`${card.address} moved ${label}`, { action: { label: 'Undo', onClick: () => void moveCard({ ...card, stage: to === 'auto' ? card.stage : to, manual: to !== 'auto' }, card.manual ? card.stage as MoveTo : 'auto', true) }, duration: 8000 });
      if (to === 'live' && !undo) setContractLead(card);
      if (to === 'auto' || undo) void load(true);
    } catch (e) { setColumns(before); toast.error(e instanceof Error ? e.message : 'The move failed.'); }
  }, [columns, load]);

  const onDrop = (col: Column) => { const c = dragging; setDragging(null); setOver(null); if (!c || c.stage === col.key) return; if (!col.manual) { toast.info(`${col.label} fills in automatically from what happens to the text. Open the lead to return it to automatic tracking.`); return; } void moveCard(c, col.key as MoveTo); };

  const total = columns.reduce((s, c) => s + c.count, 0);
  const textedBase = columns.filter(c => TEXTED_STAGES.includes(c.key)).reduce((s, c) => s + c.count, 0);
  const count = (k: StageKey) => columns.find(c => c.key === k)?.count ?? 0;
  const visible = columns.filter(c => !(hideEmpty && c.count === 0));
  const jump = (k: StageKey) => { setCollapsed(s => { const n = new Set(s); n.delete(k); return n; }); setTimeout(() => document.getElementById(`col-${k}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 30); };
  const filtersOn = !!(q || stateFilter || program || minScore || hasPhone || luxury);
  const sel = 'text-xs bg-card border border-border rounded-lg px-2 py-1.5 text-foreground';

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border bg-card shrink-0 space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-lg font-bold text-foreground">Pipeline Board</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{loading ? 'Loading…' : `${total.toLocaleString()} leads${filtersOn || state ? ' match your filters' : ''} · ${textedBase.toLocaleString()} texted`}{updatedAt ? ` · updated ${Math.max(0, Math.round((Date.now() - updatedAt) / 1000))}s ago` : ''}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(count('hot') + count('human')) > 0 && <button onClick={() => jump(count('hot') ? 'hot' : 'human')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs font-semibold text-orange-700 dark:text-orange-300"><Zap size={12} />{count('hot')} hot · {count('human')} assigned to agent</button>}
              <Link href="/map-view" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted"><MapPin size={12} />Map view</Link>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Auto-refresh</label>
              <button onClick={() => void load()} disabled={refreshing} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><Search size={13} className="absolute left-2.5 top-2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address, city, owner or ZIP" aria-label="Search leads" className={`${sel} pl-8 pr-7 w-64`} />{search && <button onClick={() => setSearch('')} className="absolute right-2 top-2" aria-label="Clear search"><X size={13} className="text-muted-foreground" /></button>}</div>
            <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className={sel} aria-label="State"><option value="">{selectedPortfolio.stateCode !== 'all' && /^[A-Z]{2}$/.test(selectedPortfolio.stateCode) ? `${selectedPortfolio.stateCode} (portfolio)` : 'All states'}</option>{STATES.map(s => <option key={s}>{s}</option>)}</select>
            <select value={program} onChange={e => setProgram(e.target.value)} className={sel} aria-label="Program"><option value="">All programs</option><option value="str_conversion">STR conversion</option><option value="co_host">Co-Host</option></select>
            <select value={minScore} onChange={e => setMinScore(Number(e.target.value))} className={sel} aria-label="Minimum score"><option value={0}>Any score</option><option value={60}>Score 60+</option><option value={70}>Score 70+</option><option value={80}>Score 80+</option><option value={90}>Score 90+</option></select>
            <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className={sel} aria-label="Sort cards"><option value="score">Top score first</option><option value="activity">Latest activity first</option><option value="net">Highest net first</option></select>
            <button onClick={() => setHasPhone(v => !v)} aria-pressed={hasPhone} className={`${sel} ${hasPhone ? 'bg-primary text-primary-foreground border-primary' : ''}`}>Has phone</button>
            <button onClick={() => setLuxury(v => !v)} aria-pressed={luxury} className={`${sel} ${luxury ? 'bg-primary text-primary-foreground border-primary' : ''}`}>Luxury</button>
            <button onClick={() => setHideEmpty(v => !v)} aria-pressed={hideEmpty} className={`${sel} ${hideEmpty ? 'bg-primary text-primary-foreground border-primary' : ''}`}>Hide empty columns</button>
            {filtersOn && <button onClick={() => { setSearch(''); setStateFilter(''); setProgram(''); setMinScore(0); setHasPhone(false); setLuxury(false); }} className="text-xs text-primary hover:underline">Clear filters</button>}
          </div>
          {!loading && columns.length > 0 && (
            <div className="flex gap-1 overflow-x-auto" aria-label="Pipeline funnel">
              {columns.map(c => <button key={c.key} onClick={() => jump(c.key)} title={c.hint} className="flex-1 min-w-[84px] text-left rounded-lg bg-muted/40 hover:bg-muted px-2.5 py-1.5 transition"><p className="text-[10px] text-muted-foreground truncate">{c.label}</p><p className="text-sm font-bold text-foreground leading-tight">{c.count.toLocaleString()}</p><div className="h-1 rounded-full bg-border mt-1 overflow-hidden"><div className={`h-full ${STAGE_STYLE[c.key].dot}`} style={{ width: `${total ? Math.max(c.count ? 4 : 0, (c.count / total) * 100) : 0}%` }} /></div></button>)}
            </div>
          )}
        </div>

        {error && <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-700 dark:text-red-300"><AlertTriangle size={14} /><span className="flex-1">{error}</span><button onClick={() => void load()} className="font-semibold underline">Retry</button></div>}

        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-4 h-full min-w-max">
            {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-72 shrink-0 rounded-xl border border-border bg-muted/30 p-3 space-y-2">{[0, 1, 2].map(j => <div key={j} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>) : visible.map(col => {
              const st = STAGE_STYLE[col.key]; const isCollapsed = collapsed.has(col.key);
              const droppable = !!dragging && dragging.stage !== col.key; const ok = col.manual;
              const pctOfTexted = ['engaged', 'hot', 'unreachable'].includes(col.key) && textedBase ? Math.round((col.count / textedBase) * 1000) / 10 : null;
              if (isCollapsed) return (
                <button key={col.key} id={`col-${col.key}`} onClick={() => setCollapsed(s => { const n = new Set(s); n.delete(col.key); return n; })} className={`w-11 shrink-0 rounded-xl border border-border border-t-4 ${st.bar} bg-muted/30 flex flex-col items-center gap-3 py-3 hover:bg-muted`} title={`Expand ${col.label}`}>
                  <ChevronsRight size={13} className="text-muted-foreground" /><span className="text-xs font-bold text-foreground">{col.count}</span><span className="text-[11px] font-semibold text-muted-foreground [writing-mode:vertical-rl]">{col.label}</span>
                </button>);
              return (
                <section key={col.key} id={`col-${col.key}`} aria-label={col.label}
                  onDragOver={e => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = ok ? 'move' : 'none'; setOver(col.key); }} onDragLeave={() => setOver(o => o === col.key ? null : o)} onDrop={e => { e.preventDefault(); onDrop(col); }}
                  className={`flex flex-col w-72 shrink-0 rounded-xl border border-t-4 ${st.bar} transition ${over === col.key && droppable ? (ok ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-red-400/60 bg-red-500/5') : 'border-border bg-muted/30'}`}>
                  <header className="px-3 py-2.5 flex items-center gap-2 shrink-0">
                    <div className="min-w-0 flex-1" title={col.hint}>
                      <div className="flex items-center gap-1.5"><span className="text-xs font-bold uppercase tracking-wide text-foreground truncate">{col.label}</span>{col.manual ? <Hand size={11} className="text-muted-foreground shrink-0" aria-label="Moved by hand" /> : <Zap size={11} className="text-muted-foreground shrink-0" aria-label="Automatic" />}</div>
                      <p className="text-[10px] text-muted-foreground truncate">{pctOfTexted != null ? `${pctOfTexted}% of texted · ` : ''}{col.hint}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.chip}`}>{col.count.toLocaleString()}</span>
                    <button onClick={() => setCollapsed(s => new Set(s).add(col.key))} className="p-1 rounded hover:bg-muted" aria-label={`Collapse ${col.label}`}><ChevronsLeft size={13} className="text-muted-foreground" /></button>
                  </header>
                  <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[160px]">
                    {col.cards.length === 0 && <div className={`h-24 rounded-lg border-2 border-dashed flex items-center justify-center text-[11px] text-muted-foreground ${over === col.key && droppable && ok ? 'border-primary/60' : 'border-border/60'}`}>{droppable && ok ? 'Drop here' : filtersOn ? 'Nothing matches your filters' : 'Nothing here yet'}</div>}
                    {col.cards.map(c => <CardView key={c.id} card={c} onOpen={setSelected} onDragStart={setDragging} onDragEnd={() => { setDragging(null); setOver(null); }} dragging={dragging?.id === c.id} />)}
                    {col.cards.length < col.count && <button onClick={() => void loadMore(col)} disabled={more.has(col.key)} className="w-full text-xs font-medium py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-50">{more.has(col.key) ? 'Loading…' : `Show more (${(col.count - col.cards.length).toLocaleString()} left)`}</button>}
                  </div>
                </section>);
            })}
          </div>
        </div>
      </div>

      {selected && <LeadDrawer card={selected} stageLabel={columns.find(c => c.key === selected.stage)?.label ?? ''} onClose={() => setSelected(null)} onMove={(c, to) => void moveCard(c, to)} />}
      {contractLead && <ContractDealModal leadId={contractLead.id} leadAddress={contractLead.address} onClose={() => setContractLead(null)} onSaved={() => setContractLead(null)} />}
    </AppLayout>
  );
}
