'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Info, Loader2, Plus, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  CANONICAL_STATUS_COLORS,
  CANONICAL_STATUS_LABELS,
  formatRegDate,
  getRegulationFreshnessStatus,
} from '@/lib/services/cityRegulationService';
import type { CanonicalRegStatus } from '@/lib/services/cityRegulationService';

// ─── Data shape returned by public.get_regulation_markets ────────────────────
interface Market {
  state: string;
  city: string;
  leads: number;
  avg_score: number | null;
  rule_id: string | null;
  status: string | null;
  review_status: string | null;
  confidence: string | null;
  last_verified_at: string | null;
  agent_summary: string | null;
  summary: string | null;
  source_name: string | null;
  source_url: string | null;
  str_allowed: boolean | null;
  permit_required: boolean | null;
  license_required: boolean | null;
  primary_residence_required: boolean | null;
  night_cap: number | null;
  minimum_stay: number | null;
}

interface StateGroup {
  code: string;
  name: string;
  markets: Market[];
  withRule: number;
  needsReview: number;
  leads: number;
  leadsCovered: number;
  uncoveredWithLeads: number;
}

const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

type Filter = 'all' | 'missing' | 'review' | 'covered';
const INITIAL_ROWS = 20;

function toStatus(s: string | null): CanonicalRegStatus {
  const up = (s ?? '').toUpperCase();
  return up in CANONICAL_STATUS_LABELS ? (up as CanonicalRegStatus) : 'UNKNOWN';
}

function needsReview(m: Market): boolean {
  if (!m.rule_id) return false;
  const f = getRegulationFreshnessStatus(m.last_verified_at);
  return f === 'STALE' || f === 'REVIEW_DUE' || f === 'UNKNOWN';
}

function sortMarkets(a: Market, b: Market): number {
  return b.leads - a.leads || a.city.localeCompare(b.city);
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function addRuleHref(m: Market): string {
  const q = new URLSearchParams({ add: '1', city: m.city, state: m.state });
  return `/city-regulations?${q.toString()}`;
}

function groupByState(markets: Market[]): StateGroup[] {
  const map = new Map<string, Market[]>();
  for (const m of markets) {
    if (!map.has(m.state)) map.set(m.state, []);
    map.get(m.state)!.push(m);
  }
  const groups: StateGroup[] = [];
  for (const [code, list] of map) {
    const sorted = [...list].sort(sortMarkets);
    groups.push({
      code,
      name: US_STATE_NAMES[code] ?? code,
      markets: sorted,
      withRule: sorted.filter((m) => m.rule_id).length,
      needsReview: sorted.filter(needsReview).length,
      leads: sorted.reduce((s, m) => s + m.leads, 0),
      leadsCovered: sorted.reduce((s, m) => s + (m.rule_id ? m.leads : 0), 0),
      uncoveredWithLeads: sorted.filter((m) => !m.rule_id && m.leads > 0).length,
    });
  }
  return groups.sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
}

function applyFilter(markets: Market[], filter: Filter): Market[] {
  switch (filter) {
    case 'missing': return markets.filter((m) => !m.rule_id);
    case 'review': return markets.filter(needsReview);
    case 'covered': return markets.filter((m) => m.rule_id);
    default: return markets;
  }
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export default function RegulationSummaryPanel({ showHeader = true }: { showHeader?: boolean }) {
  const { selectedPortfolio } = usePortfolio();
  const stateCode = selectedPortfolio.stateCode && selectedPortfolio.stateCode !== 'all'
    ? selectedPortfolio.stateCode.toUpperCase()
    : 'all';
  const isSingleState = stateCode !== 'all';

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), 15_000));
      const { data, error: rpcErr } = await Promise.race([
        supabase.rpc('get_regulation_markets', { p_state: stateCode }),
        timeout,
      ]);
      if (!mountedRef.current) return;
      if (rpcErr) {
        setError(rpcErr.message);
        setMarkets([]);
        return;
      }
      setMarkets(((data as Market[] | null) ?? []).filter((m) => m.state && m.city));
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load regulations');
      setMarkets([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [stateCode]);

  useEffect(() => {
    setFilter('all');
    load();
  }, [load]);

  const totals = useMemo(() => {
    const withRule = markets.filter((m) => m.rule_id).length;
    const leads = markets.reduce((s, m) => s + m.leads, 0);
    const leadsCovered = markets.reduce((s, m) => s + (m.rule_id ? m.leads : 0), 0);
    return {
      markets: markets.length,
      withRule,
      leads,
      leadsCovered,
      review: markets.filter(needsReview).length,
      states: new Set(markets.map((m) => m.state)).size,
    };
  }, [markets]);

  const groups = useMemo(() => (isSingleState ? [] : groupByState(markets)), [markets, isSingleState]);
  const singleList = useMemo(
    () => applyFilter([...markets].sort(sortMarkets), filter),
    [markets, filter],
  );

  const scopeLabel = isSingleState
    ? `${US_STATE_NAMES[stateCode] ?? stateCode} portfolio`
    : `All portfolios · ${totals.states} states`;

  return (
    <div className="bg-card rounded-xl border border-border">
      {showHeader && (
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">City Regulations</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{scopeLabel} · STR rules by market</p>
          </div>
          <button
            onClick={load}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Refresh regulations"
            aria-label="Refresh regulations"
          >
            <RefreshCw size={12} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center gap-2">
          <AlertTriangle size={16} className="text-destructive" />
          <p className="text-xs font-medium text-destructive">DATA ERROR</p>
          <p className="text-[11px] text-muted-foreground">{error}</p>
          <button onClick={load} className="text-[11px] text-primary hover:underline mt-1">Retry</button>
        </div>
      ) : markets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center gap-2">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Info size={14} className="text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-foreground">No markets yet</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {isSingleState
              ? `No leads or regulation records found for ${US_STATE_NAMES[stateCode] ?? stateCode}.`
              : 'No leads or regulation records found.'}
          </p>
        </div>
      ) : (
        <>
          {/* Coverage summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border-b border-border">
            <Stat label={isSingleState ? 'Cities' : 'States'} value={isSingleState ? totals.markets : totals.states}
              hint={isSingleState ? 'with leads or rules' : `${totals.markets.toLocaleString()} markets`} />
            <Stat label="Rule on file" value={`${pct(totals.withRule, totals.markets)}%`}
              hint={`${totals.withRule.toLocaleString()} of ${totals.markets.toLocaleString()} markets`} />
            <Stat label="Leads covered" value={`${pct(totals.leadsCovered, totals.leads)}%`}
              hint={`${totals.leadsCovered.toLocaleString()} of ${totals.leads.toLocaleString()} leads`} />
            <Stat label="Needs review" value={totals.review} tone={totals.review > 0 ? 'warning' : undefined}
              hint="stale or unverified" />
          </div>

          {isSingleState ? (
            <>
              <FilterBar filter={filter} onChange={setFilter} markets={markets} />
              <MarketList markets={singleList} emptyText="No markets match this filter." />
            </>
          ) : (
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto scrollbar-thin">
              {groups.map((g) => <StateRow key={g.code} group={g} />)}
            </div>
          )}

          <div className="px-5 py-2.5 border-t border-border flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Markets are built from your real leads. Rules shown only where verified data exists.
            </p>
            <Link href="/city-regulations" className="text-[11px] text-primary hover:underline whitespace-nowrap">
              Manage rules →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────
function Stat({ label, value, hint, tone }: {
  label: string; value: string | number; hint: string; tone?: 'warning';
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold leading-tight ${tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function FilterBar({ filter, onChange, markets }: {
  filter: Filter; onChange: (f: Filter) => void; markets: Market[];
}) {
  const counts: Record<Filter, number> = {
    all: markets.length,
    missing: markets.filter((m) => !m.rule_id).length,
    review: markets.filter(needsReview).length,
    covered: markets.filter((m) => m.rule_id).length,
  };
  const items: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'missing', label: 'Missing rule' },
    { key: 'review', label: 'Needs review' },
    { key: 'covered', label: 'Has rule' },
  ];
  return (
    <div className="px-5 py-2.5 flex items-center gap-1.5 flex-wrap border-b border-border">
      {items.map((i) => (
        <button
          key={i.key}
          onClick={() => onChange(i.key)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
            filter === i.key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground border-border hover:bg-muted'
          }`}
        >
          {i.label} <span className="opacity-80">{counts[i.key]}</span>
        </button>
      ))}
    </div>
  );
}

function MarketList({ markets, emptyText }: { markets: Market[]; emptyText: string }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? markets : markets.slice(0, INITIAL_ROWS);
  if (markets.length === 0) {
    return <p className="px-5 py-6 text-center text-[11px] text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="divide-y divide-border max-h-[480px] overflow-y-auto scrollbar-thin">
      {visible.map((m) => <CityRow key={`${m.state}|${m.city}`} market={m} />)}
      {markets.length > INITIAL_ROWS && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full px-5 py-2.5 text-[11px] text-primary hover:bg-muted transition-colors"
        >
          {showAll ? 'Show fewer' : `Show ${(markets.length - INITIAL_ROWS).toLocaleString()} more cities`}
        </button>
      )}
    </div>
  );
}

function StateRow({ group }: { group: StateGroup }) {
  const [open, setOpen] = useState(false);
  const covered = pct(group.withRule, group.markets.length);
  const barColor = covered >= 60 ? 'bg-success' : covered >= 20 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
      >
        {open
          ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{group.name}</span>
            <span className="text-[10px] text-muted-foreground">{group.code}</span>
            {group.uncoveredWithLeads > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
                {group.uncoveredWithLeads} {group.uncoveredWithLeads === 1 ? 'city' : 'cities'} with leads, no rule
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {group.markets.length.toLocaleString()} markets · {group.leads.toLocaleString()} leads
            {group.needsReview > 0 ? ` · ${group.needsReview} need review` : ''}
          </p>
        </div>
        <div className="w-28 shrink-0">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{group.withRule}/{group.markets.length} rules</span>
            <span className="font-medium text-foreground">{covered}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(covered, group.withRule > 0 ? 4 : 0)}%` }} />
          </div>
        </div>
      </button>
      {open && (
        <div className="bg-muted/20 border-t border-border pl-4">
          <MarketList markets={group.markets} emptyText="No markets." />
        </div>
      )}
    </div>
  );
}

function Flag({ label, value }: { label: string; value: boolean | null }) {
  if (value === null || value === undefined) return null;
  return (
    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
      {label}: <span className="font-medium text-foreground">{value ? 'Required' : 'Not required'}</span>
    </span>
  );
}

function CityRow({ market: m }: { market: Market }) {
  const [open, setOpen] = useState(false);
  const hasRule = !!m.rule_id;
  const status = toStatus(m.status);
  const freshness = hasRule ? getRegulationFreshnessStatus(m.last_verified_at) : null;
  const summary = m.agent_summary || m.summary;

  return (
    <div className="px-5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => hasRule && setOpen((v) => !v)}
          aria-expanded={hasRule ? open : undefined}
          disabled={!hasRule}
          className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default"
        >
          {hasRule
            ? (open ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />)
            : <span className="w-3 shrink-0" />}
          <span className="text-xs font-medium text-foreground truncate">{m.city}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{m.state}</span>
          {m.leads > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
              {m.leads.toLocaleString()} {m.leads === 1 ? 'lead' : 'leads'}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {hasRule ? (
            <>
              {(freshness === 'STALE' || freshness === 'REVIEW_DUE' || freshness === 'UNKNOWN') && (
                <span className="text-[10px] text-warning" title={`Last verified ${formatRegDate(m.last_verified_at)}`}>
                  {freshness === 'UNKNOWN' ? 'Unverified' : freshness === 'STALE' ? 'Stale' : 'Review due'}
                </span>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CANONICAL_STATUS_COLORS[status]}`}>
                {CANONICAL_STATUS_LABELS[status]}
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground">No rule on file</span>
              <Link
                href={addRuleHref(m)}
                className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                title={`Add a regulation record for ${m.city}, ${m.state}`}
              >
                <Plus size={10} /> Add rule
              </Link>
            </>
          )}
        </div>
      </div>

      {hasRule && open && (
        <div className="mt-2 ml-5 space-y-2 border-t border-border pt-2">
          {summary && <p className="text-[11px] text-foreground leading-snug">{summary}</p>}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Flag label="Permit" value={m.permit_required} />
            <Flag label="License" value={m.license_required} />
            <Flag label="Primary residence" value={m.primary_residence_required} />
            {m.night_cap ? (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                Night cap: <span className="font-medium text-foreground">{m.night_cap}/yr</span>
              </span>
            ) : null}
            {m.minimum_stay ? (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                Min stay: <span className="font-medium text-foreground">{m.minimum_stay} nights</span>
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={10} className={freshness === 'CURRENT' ? 'text-success' : 'text-warning'} />
              Verified {formatRegDate(m.last_verified_at)}
            </span>
            {m.confidence && <span>Confidence: {m.confidence.toLowerCase()}</span>}
            {m.source_url && (
              <a
                href={m.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                {m.source_name || 'Source'} <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
