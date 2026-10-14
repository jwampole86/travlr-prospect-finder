'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Crosshair, KanbanSquare, List, MapPin, Moon, Satellite, Search, Sun, X } from 'lucide-react';
import LeadDrawer from '@/app/pipeline/LeadDrawer';
import { type Card, type StageKey, STAGE_HEX, STAGE_LABEL, STAGE_ORDER, money } from '@/app/pipeline/types';
import { type BaseLayer, type ColorBy, type MapPoint, REG_HEX, scoreHex } from './types';

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div> });
const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

const toCard = (p: MapPoint): Card => ({ id: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip, beds: p.beds, baths: p.baths, score: p.score, netMonthly: p.net, owner: p.owner, hasPhone: p.hasPhone, program: p.program, luxury: p.luxury, stage: p.stage, manual: false, batch: null, temperature: null, summary: '', activityAt: null, activityAgo: null, replied: false, assignedTo: null, located: true, approximate: p.approx });

export default function MapViewClient({ points, total }: { points: MapPoint[]; total: number }) {
  const router = useRouter();
  const [pts, setPts] = useState(points);
  const [stages, setStages] = useState<Set<StageKey>>(new Set(STAGE_ORDER));
  const [colorBy, setColorBy] = useState<ColorBy>('stage');
  const [base, setBase] = useState<BaseLayer>('street');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [luxury, setLuxury] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [list, setList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const rowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setBase(document.documentElement.classList.contains('dark') ? 'dark' : 'street'); const id = new URLSearchParams(location.search).get('lead'); if (id) setSelectedId(id); if (window.innerWidth < 768) setList(false); }, []);

  const term = search.trim().toLowerCase();
  const base1 = useMemo(() => pts.filter(p => (!state || p.state === state) && p.score >= minScore && (!luxury || p.luxury) && (!hasPhone || p.hasPhone) && (!term || `${p.address} ${p.city} ${p.owner ?? ''} ${p.zip ?? ''}`.toLowerCase().includes(term))), [pts, state, minScore, luxury, hasPhone, term]);
  const shown = useMemo(() => base1.filter(p => stages.has(p.stage)), [base1, stages]);
  const stageCounts = useMemo(() => { const m = new Map<StageKey, number>(); for (const p of base1) m.set(p.stage, (m.get(p.stage) ?? 0) + 1); return m; }, [base1]);
  const sorted = useMemo(() => [...shown].sort((a, b) => b.score - a.score).slice(0, 150), [shown]);
  const selected = pts.find(p => p.id === selectedId) ?? null;

  useEffect(() => { const t = setTimeout(() => setFitKey(k => k + 1), 450); return () => clearTimeout(t); }, [stages, state, minScore, luxury, hasPhone, term]);
  useEffect(() => { rowRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedId]);

  const toggleStage = (s: StageKey, only = false) => setStages(prev => only ? new Set([s]) : (() => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; })());
  const filtersOn = !!(search || state || minScore || luxury || hasPhone || stages.size !== STAGE_ORDER.length);
  const reset = () => { setSearch(''); setState(''); setMinScore(0); setLuxury(false); setHasPhone(false); setStages(new Set(STAGE_ORDER)); };
  const sel = 'text-xs bg-card border border-border rounded-lg px-2 py-1.5 text-foreground';

  async function move(card: Card, to: 'human' | 'contract' | 'live' | 'closed' | 'auto') {
    try {
      const res = await fetch('/api/pipeline/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: card.id, to }) }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'The move failed.');
      if (to === 'auto') router.refresh(); else setPts(ps => ps.map(p => p.id === card.id ? { ...p, stage: to } : p));
      toast.success('Stage updated');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'The move failed.'); }
  }

  const legend: Array<[string, string]> = colorBy === 'stage' ? STAGE_ORDER.filter(s => stageCounts.get(s)).map(s => [STAGE_LABEL[s], STAGE_HEX[s]]) : colorBy === 'score' ? [['Score 80+', scoreHex(90)], ['Score 60-79', scoreHex(70)], ['Under 60', scoreHex(10)]] : Object.entries(REG_HEX);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border bg-card shrink-0 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Map View</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{shown.length.toLocaleString()} of {pts.length.toLocaleString()} leads shown{total > pts.length ? ` · ${(total - pts.length).toLocaleString()} without a usable location` : ''}{pts.some(p => p.approx) ? ' · faded dots are approximate (ZIP or city)' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/pipeline" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted"><KanbanSquare size={12} />Pipeline Board</Link>
            <button onClick={() => setFitKey(k => k + 1)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted"><Crosshair size={12} />Fit to results</button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><Search size={13} className="absolute left-2.5 top-2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address, city, owner or ZIP" aria-label="Search leads" className={`${sel} pl-8 pr-7 w-64`} />{search && <button onClick={() => setSearch('')} className="absolute right-2 top-2" aria-label="Clear search"><X size={13} className="text-muted-foreground" /></button>}</div>
          <select value={state} onChange={e => setState(e.target.value)} className={sel} aria-label="State"><option value="">All states</option>{STATES.map(s => <option key={s}>{s}</option>)}</select>
          <select value={minScore} onChange={e => setMinScore(Number(e.target.value))} className={sel} aria-label="Minimum score"><option value={0}>Any score</option><option value={60}>Score 60+</option><option value={70}>Score 70+</option><option value={80}>Score 80+</option><option value={90}>Score 90+</option></select>
          <button onClick={() => setHasPhone(v => !v)} aria-pressed={hasPhone} className={`${sel} ${hasPhone ? 'bg-primary text-primary-foreground border-primary' : ''}`}>Has phone</button>
          <button onClick={() => setLuxury(v => !v)} aria-pressed={luxury} className={`${sel} ${luxury ? 'bg-primary text-primary-foreground border-primary' : ''}`}>Luxury</button>
          <div className="flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Color dots by">{(['stage', 'score', 'rules'] as ColorBy[]).map(c => <button key={c} onClick={() => setColorBy(c)} aria-pressed={colorBy === c} className={`text-xs px-2.5 py-1.5 capitalize ${colorBy === c ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>{c === 'rules' ? 'STR rules' : c}</button>)}</div>
          {filtersOn && <button onClick={reset} className="text-xs text-primary hover:underline">Clear filters</button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Pipeline stages">
          {STAGE_ORDER.map(s => { const n = stageCounts.get(s) ?? 0; const on = stages.has(s); return (
            <button key={s} onClick={e => toggleStage(s, e.altKey || e.metaKey)} disabled={!n && !on} title="Click to show or hide. Alt-click to show only this stage."
              className={`shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition ${on ? 'border-primary/40 bg-card text-foreground' : 'border-border bg-muted/40 text-muted-foreground opacity-60'} ${!n && !on ? 'cursor-not-allowed' : 'hover:border-primary/60'}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STAGE_HEX[s] }} />{STAGE_LABEL[s]}<span className="text-muted-foreground">{n.toLocaleString()}</span>
            </button>); })}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {list && (
          <aside className="w-80 shrink-0 border-r border-border bg-card flex flex-col min-h-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-xl">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between"><p className="text-xs font-semibold text-foreground">Top {sorted.length} by score</p><button onClick={() => setList(false)} className="p-1 rounded hover:bg-muted" aria-label="Hide list"><X size={13} className="text-muted-foreground" /></button></div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {sorted.length === 0 && <p className="p-4 text-xs text-muted-foreground">No leads match these filters.</p>}
              {sorted.map(p => (
                <button key={p.id} ref={p.id === selectedId ? rowRef : undefined} onClick={() => { setSelectedId(p.id); if (window.innerWidth < 768) setList(false); }} className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted/60 ${p.id === selectedId ? 'bg-primary/10' : ''}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STAGE_HEX[p.stage] }} />
                  <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-foreground truncate">{p.address}</span><span className="block text-[11px] text-muted-foreground truncate">{p.city}, {p.state} · {STAGE_LABEL[p.stage]}</span></span>
                  <span className="text-[11px] font-bold text-foreground">{p.score}</span>
                </button>))}
            </div>
          </aside>
        )}

        <div className="flex-1 relative min-w-0 min-h-[420px]">
          <LeafletMap points={shown} colorBy={colorBy} base={base} selectedId={selectedId} fitKey={fitKey} onSelect={id => { setSelectedId(id); }} />
          {!list && <button onClick={() => setList(true)} className="absolute top-3 left-3 z-[400] flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-card border border-border rounded-lg shadow hover:bg-muted"><List size={13} />Show list<span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">{shown.length.toLocaleString()}</span></button>}

          <div className="absolute top-3 right-3 z-[400] flex rounded-lg border border-border overflow-hidden shadow bg-card" role="group" aria-label="Map style">
            {([['street', 'Street', MapPin], ['dark', 'Dark', Moon], ['satellite', 'Satellite', Satellite]] as const).map(([k, label, Icon]) => <button key={k} onClick={() => setBase(k)} aria-pressed={base === k} title={label} className={`px-2.5 py-1.5 text-xs flex items-center gap-1 ${base === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{k === 'dark' ? <Moon size={12} /> : k === 'street' ? <Sun size={12} /> : <Icon size={12} />}<span className="hidden sm:inline">{label}</span></button>)}
          </div>

          <div className="absolute bottom-3 left-3 z-[400] bg-card/95 border border-border rounded-lg shadow px-3 py-2 max-w-[220px]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{colorBy === 'stage' ? 'Pipeline stage' : colorBy === 'score' ? 'Prospect score' : 'STR rules'}</p>
            <ul className="space-y-0.5">{legend.map(([l, c]) => <li key={l} className="flex items-center gap-2 text-[11px] text-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</li>)}</ul>
          </div>

          {selected && (
            <div className="absolute bottom-3 right-3 left-3 sm:left-auto sm:w-80 z-[400] bg-card border border-border rounded-xl shadow-xl p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-foreground leading-tight">{selected.address}</p><p className="text-xs text-muted-foreground">{selected.city}, {selected.state} {selected.zip}</p></div>
                <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-muted" aria-label="Close"><X size={14} className="text-muted-foreground" /></button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: STAGE_HEX[selected.stage] }}>{STAGE_LABEL[selected.stage]}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground">Score {selected.score}</span>
                {selected.net ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{money(selected.net)}/mo net</span> : null}
                {selected.luxury && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300">Luxury</span>}
                {selected.approx && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">Approximate location</span>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">{selected.owner ?? 'Owner not identified'} · {selected.beds ?? '—'} bd / {selected.baths ?? '—'} ba · {selected.regulation} for STR</p>
              <button onClick={() => setDrawer(true)} className="mt-3 w-full text-xs font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">Open details, timeline and actions</button>
            </div>
          )}
        </div>
      </div>

      {drawer && selected && <LeadDrawer card={toCard(selected)} stageLabel={STAGE_LABEL[selected.stage]} onClose={() => setDrawer(false)} onMove={(c, to) => void move(c, to)} />}
    </div>
  );
}
