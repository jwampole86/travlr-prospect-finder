"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Database, ExternalLink, Plus, RefreshCw, Search, Shield, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import {
  EmptyState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import {
  CANONICAL_STATUS_COLORS,
  CANONICAL_STATUS_LABELS,
  formatRegDate,
  getRegulationFreshnessStatus,
} from '@/lib/services/cityRegulationService';

import RegulationEditor from './RegulationEditor';
import type { CanonicalStatus, CityRegulationsPageData, RegulationMarket, RegulationRecord } from './types';

type TabKey = 'overview' | 'records';

type FilterState = {
  search: string;
  status: 'all' | CanonicalStatus;
  review: 'all' | string;
  source: 'all' | string;
};

function matchesText(record: RegulationRecord, query: string): boolean {
  return [record.jurisdictionName, record.city, record.state, record.summary, record.agentSummary, record.sourceName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query.toLowerCase());
}

function ruleNeedsReview(record: RegulationRecord): boolean {
  const freshness = getRegulationFreshnessStatus(record.lastVerifiedAt);
  return freshness !== 'CURRENT' || record.reviewStatus === 'REVIEW_DUE' || record.reviewStatus === 'STALE' || record.reviewStatus === 'UNKNOWN';
}

function sourceTone(sourceType: string | null): 'warning' | 'primary' | 'default' {
  if (sourceType === 'AI_RESEARCHED') return 'warning';
  if (sourceType?.startsWith('OFFICIAL_')) return 'primary';
  return 'default';
}

function sampleDraftFromMarket(market: RegulationMarket): RegulationRecord {
  return {
    id: 'new',
    jurisdictionName: market.city && market.state ? `${market.city}, ${market.state}` : '',
    city: market.city || null,
    county: null,
    state: market.state || '',
    jurisdictionType: 'CITY',
    status: 'UNKNOWN',
    strAllowed: null,
    permitRequired: null,
    licenseRequired: null,
    registrationRequired: null,
    primaryResidenceRequired: null,
    ownerOccupancyRequired: null,
    nightCap: null,
    minimumStay: null,
    occupancyLimit: null,
    taxRequirements: null,
    additionalRestrictions: null,
    summary: null,
    agentSummary: null,
    sourceName: null,
    sourceUrl: null,
    sourceType: 'OFFICIAL_MUNICIPAL',
    confidence: 'MEDIUM',
    reviewStatus: 'CURRENT',
    lastVerifiedAt: null,
    nextReviewAt: null,
    regulationVersion: 1,
    permitName: null,
    permitCostSummary: null,
    permitProcessingTime: null,
    permitApplicationUrl: null,
    permitRenewal: null,
    permitDetailsUpdatedAt: null,
    permitSteps: [],
    safetyRequirements: [],
    updatedAt: new Date().toISOString(),
  };
}

export default function CityRegulationsClient({ initialData }: { initialData: CityRegulationsPageData }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('overview');
  const [filters, setFilters] = useState<FilterState>({ search: '', status: 'all', review: 'all', source: 'all' });
  const [editing, setEditing] = useState<RegulationRecord | null>(null);
  const [creating, setCreating] = useState<RegulationRecord | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const filteredRecords = useMemo(() => initialData.regulations.filter((record) => {
    if (filters.status !== 'all' && record.status !== filters.status) return false;
    if (filters.review !== 'all' && record.reviewStatus !== filters.review) return false;
    if (filters.source !== 'all' && record.sourceType !== filters.source) return false;
    if (filters.search && !matchesText(record, filters.search)) return false;
    return true;
  }), [filters, initialData.regulations]);

  const topUncoveredMarkets = useMemo(
    () => [...initialData.markets].filter((market) => market.leads > 0 && !market.ruleId).sort((a, b) => b.leads - a.leads).slice(0, 8),
    [initialData.markets],
  );
  const reviewQueue = useMemo(
    () => [...initialData.regulations].filter(ruleNeedsReview).sort((a, b) => (b.lastVerifiedAt || '').localeCompare(a.lastVerifiedAt || '')).slice(0, 8),
    [initialData.regulations],
  );

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const response = await fetch('/api/regulations/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillAll: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Backfill failed');
      toast.success(`Evaluated ${result?.count ?? 0} leads`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  }

  const statusOptions = ['all', ...Object.keys(CANONICAL_STATUS_LABELS)] as Array<'all' | CanonicalStatus>;
  const reviewOptions = ['all', ...Array.from(new Set(initialData.regulations.map((record) => record.reviewStatus).filter((value): value is string => Boolean(value))))];
  const sourceOptions = ['all', ...Array.from(new Set(initialData.regulations.map((record) => record.sourceType).filter((value): value is string => Boolean(value))))];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={Shield}
        title="City Regulations"
        description="Live canonical regulation records plus market coverage from get_regulation_coverage and get_regulation_markets."
        actions={
          <>
            <Link href="/regulation-trace" className={buttonSecondary}>
              <Database size={14} />
              Trace regulation
            </Link>
            <button type="button" onClick={handleBackfill} disabled={backfilling} className={buttonSecondary}>
              <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''} />
              {backfilling ? 'Evaluating…' : 'Evaluate missing leads'}
            </button>
            <button type="button" onClick={() => setCreating(sampleDraftFromMarket({ city: '', state: '', leads: 0, avgScore: null, ruleId: null, status: null, reviewStatus: null, confidence: null, sourceType: null, lastVerifiedAt: null, agentSummary: null, summary: null, sourceName: null, sourceUrl: null, strAllowed: null, permitRequired: null, licenseRequired: null, primaryResidenceRequired: null, nightCap: null, minimumStay: null }))} className={buttonPrimary}>
              <Plus size={14} />
              Add record
            </button>
          </>
        }
      />

      <StatGrid
        columns={5}
        stats={[
          { label: 'Canonical rules', value: initialData.counts.totalRules.toLocaleString(), hint: 'Exact rows in city_regulations', icon: Shield, tone: 'primary' },
          { label: 'Markets with leads', value: initialData.counts.marketsWithLeads.toLocaleString(), hint: 'Rows returned by get_regulation_markets with leads > 0', icon: Database, tone: 'default' },
          { label: 'Uncovered markets', value: initialData.counts.uncoveredMarkets.toLocaleString(), hint: 'Markets with live leads and no canonical rule', icon: AlertTriangle, tone: 'danger' },
          { label: 'Evaluated leads', value: initialData.coverage.regulationEvaluated.toLocaleString(), hint: `${initialData.coverage.totalApplicable.toLocaleString()} total applicable leads`, icon: Sparkles, tone: 'success' },
          { label: 'AI researched rules', value: initialData.counts.aiResearched.toLocaleString(), hint: 'Rows with source_type = AI_RESEARCHED', icon: Sparkles, tone: 'warning' },
        ]}
      />

      {creating ? (
        <RegulationEditor
          mode="add"
          record={creating}
          onClose={() => setCreating(null)}
          onSaved={(message, ok) => {
            if (ok) {
              toast.success(message);
              setCreating(null);
              router.refresh();
            } else {
              toast.error(message);
            }
          }}
        />
      ) : null}
      {editing ? (
        <RegulationEditor
          mode="edit"
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={(message, ok) => {
            if (ok) {
              toast.success(message);
              setEditing(null);
              router.refresh();
            } else {
              toast.error(message);
            }
          }}
        />
      ) : null}

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs
            tabs={[
              { key: 'overview', label: 'Coverage overview' },
              { key: 'records', label: 'Regulation records', badge: filteredRecords.length },
            ]}
            value={tab}
            onChange={(value) => setTab(value)}
          />

          {tab === 'records' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative block sm:col-span-2 xl:w-80">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Search city, state, summary, or source"
                  className={`${inputClass} pl-9`}
                />
              </label>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FilterState['status'] }))} className={inputClass}>
                {statusOptions.map((option) => <option key={option} value={option}>{option === 'all' ? 'All statuses' : option}</option>)}
              </select>
              <select value={filters.review} onChange={(event) => setFilters((current) => ({ ...current, review: event.target.value }))} className={inputClass}>
                {reviewOptions.map((option) => <option key={option} value={option}>{option === 'all' ? 'All review states' : option}</option>)}
              </select>
              <select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} className={inputClass}>
                {sourceOptions.map((option) => <option key={option} value={option}>{option === 'all' ? 'All source types' : option}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      </Panel>

      {tab === 'overview' ? (
        <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
          <Panel title="Lead coverage by canonical status">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['ALLOWED', initialData.coverage.allowed],
                ['ALLOWED_WITH_REQUIREMENTS', initialData.coverage.allowedWithRequirements],
                ['PERMIT_REQUIRED', initialData.coverage.permitRequired],
                ['RESTRICTED', initialData.coverage.restricted],
                ['PRIMARY_RESIDENCE_REQUIRED', initialData.coverage.primaryResidenceRequired],
                ['PROHIBITED', initialData.coverage.prohibited],
                ['UNKNOWN', initialData.coverage.unknown],
                ['REVIEW_REQUIRED', initialData.coverage.reviewRequired],
              ] as Array<[CanonicalStatus, number]>).map(([status, value]) => (
                <div key={status} className="rounded-2xl border border-border bg-muted/20 p-4">
                  <StatusPill tone={status === 'PROHIBITED' ? 'danger' : status === 'UNKNOWN' ? 'default' : status === 'REVIEW_REQUIRED' ? 'warning' : 'primary'}>
                    {CANONICAL_STATUS_LABELS[status]}
                  </StatusPill>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Rules found</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{initialData.coverage.cityRulesFound.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Jurisdiction unknown</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{initialData.coverage.jurisdictionUnknown.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Stale / review due</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{initialData.coverage.stale.toLocaleString()}</p>
              </div>
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel title="Highest-volume markets still missing a rule">
              {topUncoveredMarkets.length === 0 ? (
                <EmptyState icon={Shield} title="Every live market has a rule" hint="get_regulation_markets returned a canonical rule for every market with leads." />
              ) : (
                <div className="space-y-3">
                  {topUncoveredMarkets.map((market) => (
                    <div key={`${market.state}:${market.city}`} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{market.city}, {market.state}</p>
                          <p className="text-sm text-muted-foreground">{market.leads.toLocaleString()} leads · avg score {market.avgScore ?? '—'}</p>
                        </div>
                        <button type="button" onClick={() => setCreating(sampleDraftFromMarket(market))} className={buttonSecondary}>
                          <Plus size={14} />
                          Add rule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Rules that still need review">
              <div className="space-y-3">
                {reviewQueue.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{record.jurisdictionName}</p>
                      <StatusPill tone={sourceTone(record.sourceType)}>{record.sourceType || 'Unknown source'}</StatusPill>
                      <StatusPill tone="warning">{record.reviewStatus || getRegulationFreshnessStatus(record.lastVerifiedAt)}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Last verified {formatRegDate(record.lastVerifiedAt)} · Confidence {record.confidence || 'Unknown'}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === 'records' ? (
        <Panel padded={false}>
          {filteredRecords.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Search} title="No regulation records match these filters" hint="Try clearing one or more filters." />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredRecords.map((record) => (
                <div key={record.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{record.jurisdictionName}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CANONICAL_STATUS_COLORS[record.status]}`}>
                          {CANONICAL_STATUS_LABELS[record.status]}
                        </span>
                        {record.sourceType ? <StatusPill tone={sourceTone(record.sourceType)}>{record.sourceType.replace(/_/g, ' ')}</StatusPill> : null}
                        {record.reviewStatus ? <StatusPill tone={ruleNeedsReview(record) ? 'warning' : 'success'}>{record.reviewStatus}</StatusPill> : null}
                      </div>
                      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                        <p>Source: <span className="text-foreground">{record.sourceName || 'Not recorded'}</span></p>
                        <p>Confidence: <span className="text-foreground">{record.confidence || 'Unknown'}</span></p>
                        <p>Last verified: <span className="text-foreground">{formatRegDate(record.lastVerifiedAt)}</span></p>
                        <p>Version: <span className="text-foreground">v{record.regulationVersion}</span></p>
                      </div>
                      {record.summary ? <p className="text-sm text-foreground">{record.summary}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        {record.permitRequired !== null ? <StatusPill tone="primary">Permit {record.permitRequired ? 'required' : 'not required'}</StatusPill> : null}
                        {record.licenseRequired !== null ? <StatusPill>License {record.licenseRequired ? 'required' : 'not required'}</StatusPill> : null}
                        {record.primaryResidenceRequired !== null ? <StatusPill tone="warning">Primary residence {record.primaryResidenceRequired ? 'required' : 'not required'}</StatusPill> : null}
                        {record.nightCap ? <StatusPill>Night cap {record.nightCap}</StatusPill> : null}
                        {record.minimumStay ? <StatusPill>Min stay {record.minimumStay} nights</StatusPill> : null}
                      </div>
                      {(record.permitName || record.permitCostSummary || record.permitSteps.length > 0 || record.safetyRequirements.length > 0) ? (
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Permit detail research</p>
                          {record.permitName ? <p className="mt-2 text-sm font-medium text-foreground">{record.permitName}</p> : null}
                          {record.permitCostSummary ? <p className="mt-1 text-sm text-muted-foreground">{record.permitCostSummary}</p> : null}
                          {record.permitProcessingTime ? <p className="mt-1 text-sm text-muted-foreground">Processing time: {record.permitProcessingTime}</p> : null}
                          {record.permitDetailsUpdatedAt ? <p className="mt-1 text-xs text-muted-foreground">Permit details updated {formatRegDate(record.permitDetailsUpdatedAt)}</p> : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {record.sourceUrl ? (
                        <a href={record.sourceUrl} target="_blank" rel="noreferrer" className={buttonSecondary}>
                          <ExternalLink size={14} />
                          Open source
                        </a>
                      ) : null}
                      <button type="button" onClick={() => setEditing(record)} className={buttonSecondary}>
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
