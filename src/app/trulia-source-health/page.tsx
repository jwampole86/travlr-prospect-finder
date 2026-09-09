'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw, Database, Activity, Shield, ChevronDown, ChevronUp, Search, Play, Eye, BarChart2, Radio, Terminal, Filter, AlertCircle, FileSearch, GitBranch,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TruliaSourceConfig {
  id: string;
  source_id: string;
  provider: string;
  state_code: string;
  source_url_raw: string;
  source_url_canonical: string;
  source_tier: 'STANDARD' | 'LUXURY';
  minimum_rent: number;
  property_types: string[];
  furnished_required: boolean;
  active: boolean;
  url_valid: boolean | null;
  state_match: boolean | null;
  filter_match: boolean | null;
  is_duplicate: boolean;
  validation_status: string | null;
  validation_notes: string | null;
  health_status: string;
  last_attempt_at: string | null;
  last_successful_fetch_at: string | null;
  last_successful_ingestion_at: string | null;
  last_error: string | null;
  last_source_results_returned: number | null;
  last_records_parsed: number | null;
  last_records_normalized: number | null;
  last_state_validated: number | null;
  last_filter_validated: number | null;
  last_properties_verified: number | null;
  last_new_prospects_inserted: number | null;
  last_existing_prospects_updated: number | null;
  last_duplicates_merged: number | null;
  last_rejected_invalid: number | null;
  last_rejected_wrong_state: number | null;
  last_rejected_filter_mismatch: number | null;
  last_errors_count: number | null;
  last_pages_available: number | null;
  last_pages_requested: number | null;
  last_pages_succeeded: number | null;
  last_pages_failed: number | null;
}

interface SyncRun {
  id: string;
  run_id: string;
  triggered_by: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  sources_attempted: number;
  sources_healthy: number;
  sources_partial: number;
  sources_failed: number;
  source_results_returned: number;
  records_parsed: number;
  records_normalized: number;
  records_validated: number;
  new_prospects_inserted: number;
  existing_prospects_updated: number;
  duplicates_merged: number;
  csv_matches: number;
  luxury_matches: number;
  rejected_wrong_state: number;
  rejected_invalid_address: number;
  rejected_filter_mismatch: number;
  errors_count: number;
  prospect_finder_count_before: number | null;
  prospect_finder_count_after: number | null;
  active_pipeline_before: number | null;
  active_pipeline_after: number | null;
  pipeline_stage_changes_from_sync: number;
}

type ActiveTab = 'health' | 'validation' | 'runs' | 'trace' | 'audit';

// ─── Health Status Config ─────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  HEALTHY: { label: 'HEALTHY', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 size={13} /> },
  PARTIAL: { label: 'PARTIAL', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: <AlertTriangle size={13} /> },
  NO_RESULTS: { label: 'NO_RESULTS', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: <Database size={13} /> },
  SUSPECT_ZERO_RESULTS: { label: 'SUSPECT_ZERO', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: <AlertCircle size={13} /> },
  INVALID_CONFIG: { label: 'INVALID_CONFIG', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <XCircle size={13} /> },
  AUTH_ERROR: { label: 'AUTH_ERROR', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <Shield size={13} /> },
  SOURCE_ERROR: { label: 'SOURCE_ERROR', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <XCircle size={13} /> },
  PARSING_ERROR: { label: 'PARSING_ERROR', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <XCircle size={13} /> },
  VALIDATION_ERROR: { label: 'VALIDATION_ERROR', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: <AlertTriangle size={13} /> },
  DATA_ERROR: { label: 'DATA_ERROR', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <XCircle size={13} /> },
  SOURCE_ACCESS_UNAVAILABLE: { label: 'ACCESS_UNAVAILABLE', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: <Shield size={13} /> },
  UNKNOWN: { label: 'UNKNOWN', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', icon: <Clock size={13} /> },
};

const VALIDATION_CONFIG: Record<string, { color: string; bg: string }> = {
  VALID: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  INVALID_URL: { color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  STATE_MISMATCH: { color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  FILTER_MISMATCH: { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  DUPLICATE_SOURCE: { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  SOURCE_ACCESS_UNAVAILABLE: { color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  DISABLED: { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
};

// ─── Counter Display ──────────────────────────────────────────────────────────

function CounterCell({ value, label, isError = false }: { value: number | null; label: string; isError?: boolean }) {
  if (value === null || value === undefined) {
    return (
      <div className="text-center">
        <div className="text-xs font-mono text-red-500 font-semibold">DATA_ERR</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    );
  }
  if (value === -1) {
    return (
      <div className="text-center">
        <div className="text-xs font-mono text-red-500 font-semibold">DATA_ERR</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className={`text-sm font-bold font-mono ${isError && value > 0 ? 'text-red-600' : 'text-foreground'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function sourceCounterValue(source: TruliaSourceConfig, value: number | null): number | null {
  const sourceAccessUnavailable =
    source.health_status === 'SOURCE_ERROR' &&
    (source.last_error?.includes('SOURCE_ACCESS_UNAVAILABLE') || source.validation_status === 'SOURCE_ACCESS_UNAVAILABLE');

  if (sourceAccessUnavailable && value === -1) return 0;
  return value;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TruliaSourceHealthPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('health');
  const [configs, setConfigs] = useState<TruliaSourceConfig[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'STANDARD' | 'LUXURY'>('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [traceProspectId, setTraceProspectId] = useState('');
  const [traceResult, setTraceResult] = useState<Record<string, unknown> | null>(null);
  const [tracing, setTracing] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResults, setAuditResults] = useState<Record<string, unknown> | null>(null);
  const [validationSummary, setValidationSummary] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [repairingConfigs, setRepairingConfigs] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [syncLog]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configsRes, runsRes] = await Promise.all([
        fetch('/api/trulia/ingest?action=validate').then((res) => res.json()),
        supabase
          .from('trulia_sync_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(20),
      ]);

      setConfigs((configsRes.configs || []) as TruliaSourceConfig[]);
      setValidationSummary(configsRes.summary || null);
      setSyncRuns((runsRes.data || []) as SyncRun[]);
    } catch (err) {
      toast.error('Failed to load source data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered configs ──────────────────────────────────────────────────────
  const filteredConfigs = configs.filter((c) => {
    if (stateFilter !== 'all' && c.state_code !== stateFilter) return false;
    if (tierFilter !== 'all' && c.source_tier !== tierFilter) return false;
    if (healthFilter !== 'all' && c.health_status !== healthFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.source_id.toLowerCase().includes(q) && !c.state_code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const uniqueStates = [...new Set(configs.map((c) => c.state_code))].sort();

  const repairConfigs = async () => {
    setRepairingConfigs(true);
    try {
      const res = await fetch('/api/trulia/ingest?action=repair-configs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Repair failed');
      toast.success(`Revalidated ${data.repaired || 0} Trulia configs`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to repair configs');
    } finally {
      setRepairingConfigs(false);
    }
  };

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalSources = configs.length;
  const validSources = configs.filter((c) => c.validation_status === 'VALID').length;
  const invalidSources = totalSources - validSources;
  const standardSources = configs.filter((c) => c.source_tier === 'STANDARD').length;
  const luxurySources = configs.filter((c) => c.source_tier === 'LUXURY').length;
  const healthySources = configs.filter((c) => c.health_status === 'HEALTHY').length;
  const accessUnavailable = configs.filter((c) => c.health_status === 'SOURCE_ERROR' || c.last_error?.includes('SOURCE_ACCESS_UNAVAILABLE')).length;

  // ── Run sync ──────────────────────────────────────────────────────────────
  const runSync = async (opts: { sourceId?: string; stateCode?: string; tier?: string; dryRun?: boolean }) => {
    setSyncing(true);
    setSyncLog([]);
    const log = (msg: string) => setSyncLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    try {
      log(`Starting Trulia source sync${opts.dryRun ? ' (DRY RUN)' : ''}...`);
      if (opts.sourceId) log(`Source: ${opts.sourceId}`);
      if (opts.stateCode) log(`State: ${opts.stateCode}`);
      if (opts.tier) log(`Tier: ${opts.tier}`);

      const res = await fetch('/api/trulia/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: opts.sourceId,
          stateCode: opts.stateCode,
          tier: opts.tier,
          dryRun: opts.dryRun || false,
          triggeredBy: 'admin',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        log(`ERROR: ${data.error || 'Unknown error'} — ${data.message || ''}`);
        toast.error(`Sync failed: ${data.error}`);
        return;
      }

      log(`Sync ${opts.dryRun ? 'validation' : 'run'} complete in ${data.durationMs}ms`);
      log(`Sources attempted: ${data.batch?.sourcesAttempted ?? 'DATA_ERROR'}`);
      log(`Sources healthy: ${data.batch?.sourcesHealthy ?? 'DATA_ERROR'}`);
      log(`Sources failed: ${data.batch?.sourcesFailed ?? 'DATA_ERROR'}`);
      log(`Source results returned: ${data.batch?.sourceResultsReturned ?? 'DATA_ERROR'}`);
      log(`Records parsed: ${data.batch?.recordsParsed ?? 'DATA_ERROR'}`);
      log(`Records validated: ${data.batch?.recordsValidated ?? 'DATA_ERROR'}`);
      log(`New prospects inserted: ${data.batch?.newProspectsInserted ?? 'DATA_ERROR'}`);
      log(`Existing updated: ${data.batch?.existingProspectsUpdated ?? 'DATA_ERROR'}`);
      log(`Duplicates merged: ${data.batch?.duplicatesMerged ?? 'DATA_ERROR'}`);
      log(`Luxury matches: ${data.batch?.luxuryMatches ?? 'DATA_ERROR'}`);
      log(`Rejected (wrong state): ${data.batch?.rejectedWrongState ?? 'DATA_ERROR'}`);
      log(`Rejected (filter mismatch): ${data.batch?.rejectedFilterMismatch ?? 'DATA_ERROR'}`);
      log(`Errors: ${data.batch?.errorsCount ?? 'DATA_ERROR'}`);

      if (data.pipelineSafety) {
        const ps = data.pipelineSafety;
        log(`Pipeline safety: Active Pipeline After=${ps.activePipelineAfter}, Stage Changes From Sync=${ps.pipelineStageChangesFromSync} (must be 0)`);
        if (ps.pipelineStageChangesFromSync !== 0) {
          log(`CRITICAL: Pipeline stage changes from sync = ${ps.pipelineStageChangesFromSync} — MUST BE 0`);
        }
      }

      // Per-source results
      if (data.sources && Array.isArray(data.sources)) {
        for (const src of data.sources) {
          const c = src.counters;
          log(`  ${src.sourceId} [${src.tier}] → ${src.syncStatus} | Fetched:${c.sourceResultsReturned} Parsed:${c.recordsParsed} Validated:${c.filterValidated} New:${c.newProspectsInserted} Updated:${c.existingProspectsUpdated} Deduped:${c.duplicatesMerged} Rejected:${c.rejectedInvalid + c.rejectedWrongState + c.rejectedFilterMismatch} Errors:${c.errors}`);
          if (src.lastError) log(`    ERROR: ${src.lastError.split('\n')[0]}`);
        }
      }

      if (!opts.dryRun) {
        toast.success('Sync complete');
        await loadData();
      } else {
        toast.success('Validation complete (dry run)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`EXCEPTION: ${msg}`);
      toast.error('Sync error');
    } finally {
      setSyncing(false);
    }
  };

  // ── Property Trace ────────────────────────────────────────────────────────
  const runPropertyTrace = async () => {
    if (!traceProspectId.trim()) return;
    setTracing(true);
    setTraceResult(null);
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, stage, lead_source, source_id, source_tier, provider_property_id, provider_listing_id, listing_url, verified_address, verified_owner, verified_number, luxury_source_match, luxury_classification_source, luxury_source_id, luxury_observed_rent, luxury_observed_at, first_seen_at, last_source_seen_at, created_at, is_synthetic, data_integrity_status')
        .eq('id', traceProspectId.trim())
        .single();

      if (!lead) {
        setTraceResult({ error: 'Prospect not found' });
        return;
      }

      const { data: observations } = await supabase
        .from('trulia_source_observations')
        .select('*')
        .eq('prospect_id', traceProspectId.trim())
        .order('first_seen_at');

      const { data: auditLogs } = await supabase
        .from('trulia_pipeline_audit_log')
        .select('*')
        .eq('prospect_id', traceProspectId.trim())
        .order('created_at', { ascending: false })
        .limit(20);

      setTraceResult({ lead, observations: observations || [], auditLogs: auditLogs || [] });
    } catch (err) {
      setTraceResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTracing(false);
    }
  };

  // ── Provenance Audit ──────────────────────────────────────────────────────
  const runProvenanceAudit = async () => {
    setAuditRunning(true);
    setAuditResults(null);
    try {
      // Count Trulia-associated prospects
      const { count: totalTrulia } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .neq('is_synthetic', true);

      const { count: missingSourceId } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .is('source_id', null);

      const { count: missingProviderIds } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .is('provider_property_id', null)
        .is('provider_listing_id', null);

      const { count: missingListingUrl } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .is('listing_url', null);

      const { count: luxuryMatches } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .eq('luxury_source_match', true);

      const { count: syntheticSuspects } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .eq('is_synthetic', true);

      const { count: pipelineContamination } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_source', 'TRULIA')
        .in('stage', ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract']);

      setAuditResults({
        totalTruliaAssociated: totalTrulia ?? 0,
        missingSourceId: missingSourceId ?? 0,
        missingProviderIds: missingProviderIds ?? 0,
        missingListingUrl: missingListingUrl ?? 0,
        luxuryMatches: luxuryMatches ?? 0,
        syntheticSuspects: syntheticSuspects ?? 0,
        pipelineContamination: pipelineContamination ?? 0,
        auditRunAt: new Date().toISOString(),
      });
    } catch (err) {
      toast.error('Audit failed');
    } finally {
      setAuditRunning(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Radio size={22} className="text-primary" />
              Trulia Source Sync Integrity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              End-to-end validation: Source Config → Fetch → Parse → Normalize → Validate → Dedup → Upsert → Provenance → Portfolio → Dashboard
            </p>
            {validationSummary && (
              <p className="text-xs text-muted-foreground mt-2">
                Config validation: <span className="font-semibold text-foreground">{validationSummary.valid}</span> valid / <span className="font-semibold text-foreground">{validationSummary.total}</span> total
                {validationSummary.invalid > 0 && <span className="text-amber-600"> · {validationSummary.invalid} need review</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => runSync({ dryRun: true })}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Shield size={14} />
              Validate All
            </button>
            <button
              onClick={repairConfigs}
              disabled={repairingConfigs || syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {repairingConfigs ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Repair Configs
            </button>
            <button
              onClick={() => runSync({})}
              disabled={syncing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              <Play size={14} />
              {syncing ? 'Syncing…' : 'Run Sync'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Sources', value: totalSources, color: 'text-foreground' },
            { label: 'Valid', value: validSources, color: 'text-emerald-600' },
            { label: 'Invalid', value: invalidSources, color: invalidSources > 0 ? 'text-red-600' : 'text-foreground' },
            { label: 'Standard', value: standardSources, color: 'text-blue-600' },
            { label: 'Luxury', value: luxurySources, color: 'text-purple-600' },
            { label: 'Healthy', value: healthySources, color: 'text-emerald-600' },
            { label: 'Access Unavailable', value: accessUnavailable, color: accessUnavailable > 0 ? 'text-orange-600' : 'text-foreground' },
          ].map((card) => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{card.label}</div>
            </div>
          ))}
        </div>

        {/* Access Unavailable Notice */}
        {accessUnavailable > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
            <Shield size={18} className="text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-purple-800 text-sm">SOURCE_ACCESS_UNAVAILABLE</div>
              <div className="text-sm text-purple-700 mt-1">
                Trulia.com direct web access is not an authorized data integration method.
                The configured source URLs define search parameters (state, rent threshold, property type, furnished).
                To enable real property ingestion, configure an authorized data provider:
                <strong> BATCHDATA_API_KEY</strong> in your environment variables.
                Source failures are reported as SOURCE_ACCESS_UNAVAILABLE — not as zero results.
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([
            { id: 'health', label: 'Source Health', icon: <Activity size={14} /> },
            { id: 'validation', label: 'Config Validation', icon: <Shield size={14} /> },
            { id: 'runs', label: 'Sync Runs', icon: <BarChart2 size={14} /> },
            { id: 'trace', label: 'Property Trace', icon: <FileSearch size={14} /> },
            { id: 'audit', label: 'Provenance Audit', icon: <GitBranch size={14} /> },
          ] as { id: ActiveTab; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── SOURCE HEALTH TAB ── */}
        {activeTab === 'health' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search source ID or state…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background w-52"
                />
              </div>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
              >
                <option value="all">All States</option>
                {uniqueStates.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
              >
                <option value="all">All Tiers</option>
                <option value="STANDARD">STANDARD</option>
                <option value="LUXURY">LUXURY</option>
              </select>
              <select
                value={healthFilter}
                onChange={(e) => setHealthFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
              >
                <option value="all">All Health</option>
                {Object.keys(HEALTH_CONFIG).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <span className="text-xs text-muted-foreground ml-auto">{filteredConfigs.length} sources</span>
            </div>

            {/* Source Health Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">State</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Tier</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Min Rent</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Canonical URL</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Last Attempt</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Last Ingestion</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Fetched</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Validated</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">New</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Updated</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Deduped</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Rejected</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Errors</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
                    ) : filteredConfigs.length === 0 ? (
                      <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">No sources match filters</td></tr>
                    ) : filteredConfigs.map((src) => {
                      const hc = HEALTH_CONFIG[src.health_status] || HEALTH_CONFIG.UNKNOWN;
                      const isExpanded = expandedSource === src.source_id;
                      const totalRejected =
                        (sourceCounterValue(src, src.last_rejected_invalid) ?? 0) +
                        (sourceCounterValue(src, src.last_rejected_wrong_state) ?? 0) +
                        (sourceCounterValue(src, src.last_rejected_filter_mismatch) ?? 0);
                      const errorsCount = sourceCounterValue(src, src.last_errors_count) ?? 0;
                      return (
                        <React.Fragment key={src.source_id}>
                          <tr
                            className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                            onClick={() => setExpandedSource(isExpanded ? null : src.source_id)}
                          >
                            <td className="px-4 py-3 font-semibold">{src.state_code}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${src.source_tier === 'LUXURY' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                {src.source_tier}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">${(src.minimum_rent / 1000).toFixed(0)}K+</td>
                            <td className="px-4 py-3 max-w-[200px]">
                              <div className="truncate text-xs text-muted-foreground font-mono" title={src.source_url_canonical}>
                                {src.source_url_canonical.replace('https://www.trulia.com', '…')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${hc.bg} ${hc.color}`}>
                                {hc.icon}
                                {hc.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">{formatRelativeTime(src.last_attempt_at)}</td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">{formatRelativeTime(src.last_successful_ingestion_at)}</td>
                            <td className="px-4 py-3 text-center"><CounterCell value={sourceCounterValue(src, src.last_source_results_returned)} label="" /></td>
                            <td className="px-4 py-3 text-center"><CounterCell value={sourceCounterValue(src, src.last_filter_validated)} label="" /></td>
                            <td className="px-4 py-3 text-center"><CounterCell value={sourceCounterValue(src, src.last_new_prospects_inserted)} label="" /></td>
                            <td className="px-4 py-3 text-center"><CounterCell value={sourceCounterValue(src, src.last_existing_prospects_updated)} label="" /></td>
                            <td className="px-4 py-3 text-center"><CounterCell value={sourceCounterValue(src, src.last_duplicates_merged)} label="" /></td>
                            <td className="px-4 py-3 text-center"><CounterCell value={totalRejected} label="" isError={totalRejected > 0} /></td>
                            <td className="px-4 py-3 text-center"><CounterCell value={errorsCount} label="" isError={errorsCount > 0} /></td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); runSync({ sourceId: src.source_id }); }}
                                  disabled={syncing}
                                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                  title="Run sync for this source"
                                >
                                  <Play size={13} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedSource(isExpanded ? null : src.source_id); }}
                                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                >
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/10">
                              <td colSpan={15} className="px-6 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <div className="font-semibold text-muted-foreground mb-1">Source Config</div>
                                    <div><span className="text-muted-foreground">Source ID:</span> <span className="font-mono">{src.source_id}</span></div>
                                    <div><span className="text-muted-foreground">Provider:</span> {src.provider}</div>
                                    <div><span className="text-muted-foreground">Property Types:</span> {src.property_types?.join(', ')}</div>
                                    <div><span className="text-muted-foreground">Furnished:</span> {src.furnished_required ? 'Required' : 'Not required'}</div>
                                    <div><span className="text-muted-foreground">Active:</span> {src.active ? 'Yes' : 'No'}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-muted-foreground mb-1">Validation</div>
                                    <div><span className="text-muted-foreground">URL Valid:</span> {src.url_valid === null ? 'Unknown' : src.url_valid ? '✓' : '✗'}</div>
                                    <div><span className="text-muted-foreground">State Match:</span> {src.state_match === null ? 'Unknown' : src.state_match ? '✓' : '✗'}</div>
                                    <div><span className="text-muted-foreground">Filter Match:</span> {src.filter_match === null ? 'Unknown' : src.filter_match ? '✓' : '✗'}</div>
                                    <div><span className="text-muted-foreground">Duplicate:</span> {src.is_duplicate ? '⚠ Yes' : 'No'}</div>
                                    <div><span className="text-muted-foreground">Status:</span> <span className={`font-semibold ${VALIDATION_CONFIG[src.validation_status || '']?.color || ''}`}>{src.validation_status || '—'}</span></div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-muted-foreground mb-1">Pagination</div>
                                    <div><span className="text-muted-foreground">Pages Available:</span> {src.last_pages_available ?? '—'}</div>
                                    <div><span className="text-muted-foreground">Pages Requested:</span> {src.last_pages_requested ?? '—'}</div>
                                    <div><span className="text-muted-foreground">Pages Succeeded:</span> {src.last_pages_succeeded ?? '—'}</div>
                                    <div><span className="text-muted-foreground">Pages Failed:</span> {src.last_pages_failed ?? '—'}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-muted-foreground mb-1">URLs</div>
                                    <div className="text-muted-foreground">Raw URL:</div>
                                    <div className="font-mono text-[10px] break-all">{src.source_url_raw}</div>
                                    <div className="text-muted-foreground mt-1">Canonical URL:</div>
                                    <div className="font-mono text-[10px] break-all">{src.source_url_canonical}</div>
                                    {src.last_error && (
                                      <div className="mt-2">
                                        <div className="text-red-600 font-semibold">Last Error:</div>
                                        <div className="text-red-500 text-[10px] break-all">{src.last_error.split('\n')[0]}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sync Ops Live Log */}
            {syncLog.length > 0 && (
              <div className="bg-gray-950 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                    <Terminal size={14} />
                    Sync Ops Live Log
                  </div>
                  <button onClick={() => setSyncLog([])} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
                </div>
                <div ref={logRef} className="h-64 overflow-y-auto space-y-0.5">
                  {syncLog.map((line, i) => (
                    <div key={i} className={`text-xs font-mono ${
                      line.includes('ERROR') || line.includes('CRITICAL') ? 'text-red-400' :
                      line.includes('WARN') || line.includes('SUSPECT') ? 'text-yellow-400' :
                      line.includes('SUCCESS') || line.includes('HEALTHY') ? 'text-green-400' :
                      line.includes('SOURCE_ACCESS_UNAVAILABLE') ? 'text-purple-400' :
                      'text-gray-300'
                    }`}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIG VALIDATION TAB ── */}
        {activeTab === 'validation' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                <div className="font-semibold text-sm">Source Configuration Validation — All {configs.length} Sources</div>
                <div className="text-xs text-muted-foreground">
                  {configs.filter(c => c.validation_status === 'VALID').length} valid / {configs.filter(c => c.validation_status !== 'VALID').length} invalid
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">State</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Min Rent</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Raw URL</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Canonical URL</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">URL Valid</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">State Match</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Filter Match</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Duplicate</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Active</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((src) => {
                      const vc = VALIDATION_CONFIG[src.validation_status || ''] || { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' };
                      return (
                        <tr key={src.source_id} className="border-b border-border/40 hover:bg-muted/10">
                          <td className="px-4 py-2 font-semibold">{src.state_code}</td>
                          <td className="px-4 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${src.source_tier === 'LUXURY' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {src.source_tier}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono">${src.minimum_rent.toLocaleString()}</td>
                          <td className="px-4 py-2 max-w-[160px]">
                            <div className="truncate font-mono text-[10px] text-muted-foreground" title={src.source_url_raw}>{src.source_url_raw}</div>
                          </td>
                          <td className="px-4 py-2 max-w-[200px]">
                            <div className="truncate font-mono text-[10px]" title={src.source_url_canonical}>{src.source_url_canonical}</div>
                          </td>
                          <td className="px-4 py-2 text-center">{src.url_valid === null ? '—' : src.url_valid ? <CheckCircle2 size={13} className="text-emerald-600 mx-auto" /> : <XCircle size={13} className="text-red-600 mx-auto" />}</td>
                          <td className="px-4 py-2 text-center">{src.state_match === null ? '—' : src.state_match ? <CheckCircle2 size={13} className="text-emerald-600 mx-auto" /> : <XCircle size={13} className="text-red-600 mx-auto" />}</td>
                          <td className="px-4 py-2 text-center">{src.filter_match === null ? '—' : src.filter_match ? <CheckCircle2 size={13} className="text-emerald-600 mx-auto" /> : <XCircle size={13} className="text-red-600 mx-auto" />}</td>
                          <td className="px-4 py-2 text-center">{src.is_duplicate ? <AlertTriangle size={13} className="text-amber-600 mx-auto" /> : <CheckCircle2 size={13} className="text-emerald-600 mx-auto" />}</td>
                          <td className="px-4 py-2 text-center">{src.active ? <CheckCircle2 size={13} className="text-emerald-600 mx-auto" /> : <XCircle size={13} className="text-gray-400 mx-auto" />}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${vc.bg} ${vc.color}`}>
                              {src.validation_status || 'UNKNOWN'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SYNC RUNS TAB ── */}
        {activeTab === 'runs' && (
          <div className="space-y-4">
            {syncRuns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
                <div>No sync runs yet. Run a sync to see results here.</div>
              </div>
            ) : syncRuns.map((run) => (
              <div key={run.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        run.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        run.status === 'PARTIAL' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        run.status === 'FAILED'? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>{run.status}</span>
                      <span className="text-sm font-semibold font-mono">{run.run_id}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Started: {new Date(run.started_at).toLocaleString()}
                      {run.completed_at && ` · Completed: ${new Date(run.completed_at).toLocaleString()}`}
                      {run.triggered_by && ` · By: ${run.triggered_by}`}
                    </div>
                  </div>
                  <div className={`text-xs font-bold px-2 py-1 rounded border ${
                    run.pipeline_stage_changes_from_sync === 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    Pipeline Changes: {run.pipeline_stage_changes_from_sync} {run.pipeline_stage_changes_from_sync === 0 ? '✓' : '⚠ MUST BE 0'}
                  </div>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                  <CounterCell value={run.sources_attempted} label="Attempted" />
                  <CounterCell value={run.sources_healthy} label="Healthy" />
                  <CounterCell value={run.sources_failed} label="Failed" isError={run.sources_failed > 0} />
                  <CounterCell value={run.source_results_returned} label="Fetched" />
                  <CounterCell value={run.records_parsed} label="Parsed" />
                  <CounterCell value={run.records_validated} label="Validated" />
                  <CounterCell value={run.new_prospects_inserted} label="New" />
                  <CounterCell value={run.existing_prospects_updated} label="Updated" />
                  <CounterCell value={run.duplicates_merged} label="Deduped" />
                  <CounterCell value={run.luxury_matches} label="Luxury" />
                  <CounterCell value={run.csv_matches} label="CSV Match" />
                  <CounterCell value={run.rejected_wrong_state} label="Wrong State" isError={run.rejected_wrong_state > 0} />
                  <CounterCell value={run.rejected_filter_mismatch} label="Filter Mismatch" isError={run.rejected_filter_mismatch > 0} />
                  <CounterCell value={run.errors_count} label="Errors" isError={run.errors_count > 0} />
                  <CounterCell value={run.active_pipeline_before} label="Pipeline Before" />
                  <CounterCell value={run.active_pipeline_after} label="Pipeline After" />
                </div>
                {run.prospect_finder_count_before !== null && run.prospect_finder_count_after !== null && (
                  <div className="mt-3 text-xs text-muted-foreground border-t border-border/50 pt-3">
                    Prospect Finder: {run.prospect_finder_count_before?.toLocaleString()} → {run.prospect_finder_count_after?.toLocaleString()}
                    {' '}(+{((run.prospect_finder_count_after ?? 0) - (run.prospect_finder_count_before ?? 0)).toLocaleString()} new)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── PROPERTY TRACE TAB ── */}
        {activeTab === 'trace' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileSearch size={16} className="text-primary" />
                Property Trace — Admin Diagnostic
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                For any prospect, show full provenance: source(s), tier(s), source URLs, listing URL, first/last seen, dedup match method, field provenance.
              </p>
              <div className="flex gap-2">
                <input
                  value={traceProspectId}
                  onChange={(e) => setTraceProspectId(e.target.value)}
                  placeholder="Enter Canonical Prospect ID (UUID)…"
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono"
                />
                <button
                  onClick={runPropertyTrace}
                  disabled={tracing || !traceProspectId.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {tracing ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
                  Trace
                </button>
              </div>
            </div>

            {traceResult && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                {traceResult.error ? (
                  <div className="text-red-600 text-sm">{String(traceResult.error)}</div>
                ) : (
                  <>
                    {/* Canonical Prospect */}
                    <div>
                      <div className="font-semibold text-sm mb-2">Canonical Prospect</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {Object.entries(traceResult.lead as Record<string, unknown>).map(([k, v]) => (
                          <div key={k}>
                            <div className="text-muted-foreground">{k}</div>
                            <div className="font-mono break-all">{v === null ? '—' : String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Source Observations */}
                    <div>
                      <div className="font-semibold text-sm mb-2">Source Observations ({(traceResult.observations as unknown[]).length})</div>
                      {(traceResult.observations as Record<string, unknown>[]).length === 0 ? (
                        <div className="text-xs text-muted-foreground">No source observations found — this prospect may lack Trulia provenance</div>
                      ) : (traceResult.observations as Record<string, unknown>[]).map((obs, i) => (
                        <div key={i} className="border border-border rounded-lg p-3 mb-2 text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(obs).map(([k, v]) => (
                            <div key={k}>
                              <div className="text-muted-foreground">{k}</div>
                              <div className="font-mono break-all">{v === null ? '—' : String(v)}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Pipeline Audit Log */}
                    <div>
                      <div className="font-semibold text-sm mb-2">Pipeline Audit Log ({(traceResult.auditLogs as unknown[]).length})</div>
                      {(traceResult.auditLogs as Record<string, unknown>[]).length === 0 ? (
                        <div className="text-xs text-muted-foreground">No pipeline audit events found</div>
                      ) : (traceResult.auditLogs as Record<string, unknown>[]).map((log, i) => (
                        <div key={i} className="border border-border/50 rounded p-2 mb-1 text-xs flex items-start gap-3">
                          <span className="font-mono text-muted-foreground">{new Date(log.created_at as string).toLocaleTimeString()}</span>
                          <span className={`font-semibold ${String(log.event_type).includes('ERROR') || String(log.event_type).includes('MISMATCH') ? 'text-red-600' : 'text-foreground'}`}>{String(log.event_type)}</span>
                          <span className="text-muted-foreground">{JSON.stringify(log.event_data)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PROVENANCE AUDIT TAB ── */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                <GitBranch size={16} className="text-primary" />
                Existing Trulia-Associated Prospect Audit
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Audit all current canonical prospects associated with Trulia source configurations.
                Checks provenance, state match, portfolio match, listing URL validity, luxury classification, pipeline contamination, and synthetic suspects.
              </p>
              <button
                onClick={runProvenanceAudit}
                disabled={auditRunning}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {auditRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                {auditRunning ? 'Running Audit…' : 'Run Provenance Audit'}
              </button>
            </div>

            {auditResults && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="font-semibold text-sm mb-4">Audit Results — {new Date(auditResults.auditRunAt as string).toLocaleString()}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Trulia-Associated', value: auditResults.totalTruliaAssociated as number, color: 'text-foreground' },
                    { label: 'Missing Source ID', value: auditResults.missingSourceId as number, color: (auditResults.missingSourceId as number) > 0 ? 'text-red-600' : 'text-emerald-600' },
                    { label: 'Missing Provider IDs', value: auditResults.missingProviderIds as number, color: (auditResults.missingProviderIds as number) > 0 ? 'text-amber-600' : 'text-emerald-600' },
                    { label: 'Missing Listing URL', value: auditResults.missingListingUrl as number, color: 'text-muted-foreground' },
                    { label: 'Luxury Matches', value: auditResults.luxuryMatches as number, color: 'text-purple-600' },
                    { label: 'Synthetic Suspects', value: auditResults.syntheticSuspects as number, color: (auditResults.syntheticSuspects as number) > 0 ? 'text-red-600' : 'text-emerald-600' },
                    { label: 'Pipeline Contamination', value: auditResults.pipelineContamination as number, color: (auditResults.pipelineContamination as number) > 0 ? 'text-red-600' : 'text-emerald-600' },
                  ].map((item) => (
                    <div key={item.label} className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className={`text-2xl font-bold ${item.color}`}>{(item.value as number).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>

                {(auditResults.pipelineContamination as number) > 0 && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <strong>⚠ Pipeline Contamination Detected:</strong> {auditResults.pipelineContamination as number} Trulia-sourced prospect(s) are in active pipeline stages (Contacted/Interested/Proposal/Under Contract).
                    Source sync must never advance pipeline stage. These records require manual review.
                  </div>
                )}

                {(auditResults.syntheticSuspects as number) > 0 && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    <strong>⚠ Synthetic Suspects:</strong> {auditResults.syntheticSuspects as number} record(s) marked as Trulia source but flagged as synthetic. These should be reviewed for DATA_INTEGRITY_REVIEW.
                  </div>
                )}

                {(auditResults.pipelineContamination as number) === 0 && (auditResults.syntheticSuspects as number) === 0 && (
                  <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                    ✓ No pipeline contamination detected. ✓ No synthetic suspects. Provenance audit passed.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
