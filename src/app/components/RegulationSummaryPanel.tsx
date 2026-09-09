'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Info, Loader2, RefreshCw, ShieldCheck, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';

// ─── DB shape from regulation_rules table ────────────────────────────────────
interface DbRegulationRule {
  id: string;
  state: string;
  city: string | null;
  zone: string | null;
  rule_key: string;
  rule_label: string;
  rule_description: string | null;
  rule_type: string | null;
  is_required: boolean | null;
  is_verified: boolean | null;
  verification_notes: string | null;
  display_order: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

// ─── Grouped market shape for display ────────────────────────────────────────
interface MarketRegulation {
  state: string;
  city: string | null;
  zone: string | null;
  rules: DbRegulationRule[];
  isVerified: boolean;
  lastUpdated: string;
  /** Derived status from rules */
  status: 'VERIFIED' | 'REVIEW_REQUIRED' | 'STALE' | 'NO_DATA';
}

function deriveStatus(rules: DbRegulationRule[], lastUpdated: string): MarketRegulation['status'] {
  if (!rules.length) return 'NO_DATA';
  const allVerified = rules.every((r) => r.is_verified);
  if (!allVerified) return 'REVIEW_REQUIRED';

  // Check staleness — if last updated > 180 days ago, mark STALE
  const daysSinceUpdate = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > 180) return 'STALE';
  return 'VERIFIED';
}

function statusIcon(status: MarketRegulation['status']) {
  if (status === 'VERIFIED') return <ShieldCheck size={12} className="text-success" />;
  if (status === 'REVIEW_REQUIRED') return <AlertTriangle size={12} className="text-warning" />;
  if (status === 'STALE') return <Clock size={12} className="text-muted-foreground" />;
  return <Info size={12} className="text-muted-foreground" />;
}

function statusColor(status: MarketRegulation['status']) {
  if (status === 'VERIFIED') return 'text-success';
  if (status === 'REVIEW_REQUIRED') return 'text-warning';
  if (status === 'STALE') return 'text-muted-foreground';
  return 'text-muted-foreground';
}

function statusLabel(status: MarketRegulation['status']) {
  if (status === 'VERIFIED') return 'Verified';
  if (status === 'REVIEW_REQUIRED') return 'Review Required';
  if (status === 'STALE') return 'Stale';
  return 'No Data';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Group flat DB rows into per-market objects */
function groupByMarket(rows: DbRegulationRule[]): MarketRegulation[] {
  const map = new Map<string, DbRegulationRule[]>();
  for (const row of rows) {
    const key = `${row.state}|${row.city ?? ''}|${row.zone ?? ''}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const markets: MarketRegulation[] = [];
  for (const [, rules] of map) {
    const sorted = [...rules].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const lastUpdated = sorted.reduce((latest, r) => {
      return r.updated_at > latest ? r.updated_at : latest;
    }, sorted[0].updated_at);

    markets.push({
      state: sorted[0].state,
      city: sorted[0].city,
      zone: sorted[0].zone,
      rules: sorted,
      isVerified: sorted.every((r) => r.is_verified),
      lastUpdated,
      status: deriveStatus(sorted, lastUpdated),
    });
  }

  // Sort: verified first, then by state+city
  return markets.sort((a, b) => {
    if (a.status === 'VERIFIED' && b.status !== 'VERIFIED') return -1;
    if (b.status === 'VERIFIED' && a.status !== 'VERIFIED') return 1;
    const stateCompare = a.state.localeCompare(b.state);
    if (stateCompare !== 0) return stateCompare;
    return (a.city ?? '').localeCompare(b.city ?? '');
  });
}

export default function RegulationSummaryPanel({ showHeader = true }: { showHeader?: boolean }) {
  const [markets, setMarkets] = useState<MarketRegulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedPortfolio } = usePortfolio();
  const stateCode = selectedPortfolio.stateCode;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRegulations = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const supabase = createClient();
      let query = supabase
        .from('regulation_rules')
        .select('id,state,city,zone,rule_key,rule_label,rule_description,rule_type,is_required,is_verified,verification_notes,display_order,is_active,created_at,updated_at')
        .eq('is_active', true)
        .order('state', { ascending: true })
        .order('display_order', { ascending: true })
        .limit(200);

      if (stateCode && stateCode !== 'all') {
        query = query.eq('state', stateCode);
      }

      // Timeout after 10 seconds — never spin forever
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), 10_000)
      );
      const { data, error: qErr } = await Promise.race([query, timeoutPromise]) as Awaited<typeof query>;

      if (!mountedRef.current) return;

      if (qErr) {
        setError(qErr.message);
        setMarkets([]);
        return;
      }

      const rows = (data ?? []) as DbRegulationRule[];
      setMarkets(groupByMarket(rows));
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load regulations');
      setMarkets([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [stateCode]);

  useEffect(() => {
    fetchRegulations();
  }, [fetchRegulations]);

  return (
    <div className="bg-card rounded-xl border border-border">
      {showHeader && (
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">City Regulations</h3>
            <p className="text-xs text-muted-foreground mt-0.5">STR rules by market · verified jurisdiction data</p>
          </div>
          <button
            onClick={fetchRegulations}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Refresh regulations"
            aria-label="Refresh regulations"
          >
            <RefreshCw size={12} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center gap-2">
          <AlertTriangle size={16} className="text-destructive" />
          <p className="text-xs font-medium text-destructive">DATA ERROR</p>
          <p className="text-[11px] text-muted-foreground">{error}</p>
          <button
            onClick={fetchRegulations}
            className="text-[11px] text-primary hover:underline mt-1"
          >
            Retry
          </button>
        </div>
      ) : markets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center gap-2">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Info size={14} className="text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-foreground">No regulation data available</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {stateCode && stateCode !== 'all'
              ? `No verified regulation records found for ${stateCode}.`
              : 'No verified regulation records found. Add records via the Regulations module.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[480px] overflow-y-auto scrollbar-thin">
          {markets.map((market) => (
            <MarketRow key={`${market.state}|${market.city ?? ''}|${market.zone ?? ''}`} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Individual market row ────────────────────────────────────────────────────

function MarketRow({ market }: { market: MarketRegulation }) {
  const [expanded, setExpanded] = useState(false);

  // Find key rules to surface
  const permitRule = market.rules.find((r) => r.rule_key === 'permit_required');
  const primaryResRule = market.rules.find((r) => r.rule_key === 'primary_residence_only');
  const nightCapRule = market.rules.find((r) => r.rule_key === 'night_cap');
  const licenseRule = market.rules.find((r) => r.rule_key === 'license_required');

  const marketLabel = market.city
    ? `${market.city}${market.zone ? ` (${market.zone})` : ''}`
    : market.state;

  return (
    <div className="px-5 py-3">
      <button
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {statusIcon(market.status)}
            <span className="text-xs font-semibold text-foreground">{marketLabel}</span>
            {market.city && (
              <span className="text-[10px] text-muted-foreground">{market.state}</span>
            )}
          </div>
          <span className={`text-[11px] font-medium ${statusColor(market.status)}`}>
            {statusLabel(market.status)}
          </span>
        </div>

        {/* Key rule badges */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {permitRule && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {permitRule.rule_description ?? permitRule.rule_label}
            </span>
          )}
          {licenseRule && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {licenseRule.rule_description ?? licenseRule.rule_label}
            </span>
          )}
          {primaryResRule && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {primaryResRule.rule_description ?? primaryResRule.rule_label}
            </span>
          )}
          {nightCapRule && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {nightCapRule.rule_description ?? nightCapRule.rule_label}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-0.5">
            <Clock size={9} />
            {formatDate(market.lastUpdated)}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {market.rules.map((rule) => (
            <div key={rule.id} className="flex items-start gap-2">
              {rule.is_verified ? (
                <CheckCircle size={10} className="text-success mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={10} className="text-warning mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground">{rule.rule_label}</p>
                {rule.rule_description && (
                  <p className="text-[10px] text-muted-foreground leading-snug">{rule.rule_description}</p>
                )}
                {rule.verification_notes && (
                  <p className="text-[10px] text-muted-foreground/70 italic mt-0.5">{rule.verification_notes}</p>
                )}
              </div>
            </div>
          ))}
          {market.status === 'REVIEW_REQUIRED' && (
            <p className="text-[10px] text-warning mt-1">
              ⚠ Some rules pending verification. Review before relying on this data.
            </p>
          )}
          {market.status === 'STALE' && (
            <p className="text-[10px] text-muted-foreground mt-1">
              ⏱ Last verified {formatDate(market.lastUpdated)} — regulations may have changed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}