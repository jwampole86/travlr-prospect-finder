'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Database, ChevronDown, ChevronUp, Activity, Radio, TrendingUp, Shield, ArrowRight, Loader2, Terminal, Eye, Bell, Mail, Settings, Zap, Send, Info } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

// Explicit sync status — never "success" unless all pipeline stages completed
type SyncStatus = 'SUCCESS' | 'NO_DATA' | 'DATA_ERROR' | 'SOURCE_ERROR' | 'SOURCE_UNAVAILABLE' | 'AUTH_ERROR' | 'TIMEOUT' | 'VALIDATION_ERROR' | 'PARTIAL';

interface PortfolioSyncState {
  portfolio: string;
  stateCode: string;
  // UI status (for card styling)
  status: 'idle' | 'running' | 'success' | 'error' | 'skipped';
  // Explicit pipeline status
  syncStatus: SyncStatus | null;
  // Validated numeric counters — never NaN, never undefined
  candidatesFetched: number;
  propertiesVerified: number;
  listingsVerified: number;
  rejectedInvalid: number;
  deduped: number;
  inserted: number;
  updated: number;
  dbTotal: number;
  dbReal: number;
  dbSynthetic: number;
  errors: string[];
  completionTime: number | null;
  sourcesRun: number;
  startedAt: string | null;
  completedAt: string | null;
  // Diagnostics
  diagnostics: PortfolioDiagnostics | null;
  // Data contract validation
  missingFields: string[];
  rawApiResponse: Record<string, unknown> | null;
}

interface PortfolioDiagnostics {
  sourceName: string;
  httpStatus: number | null;
  requestSuccessful: boolean;
  rawCandidatesReturned: number;
  normalizedCandidates: number;
  propertiesVerified: number;
  listingsVerified: number;
  rejectedInvalid: number;
  deduped: number;
  inserted: number;
  errors: string[];
  durationMs: number;
  responseValidation: { field: string; present: boolean }[];
  errorCode: string | null;
}

interface E2EValidationRow {
  portfolio: string;
  stateCode: string;
  leadsIngested: number;
  dedupRan: boolean;
  scoringCompleted: boolean;
  enrichmentProgress: number;
  outreachReadyCount: number;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  issues: string[];
}

interface SyncAlertEvent {
  id: string;
  alert_type: string;
  portfolio: string | null;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
}

interface SyncAlertConfig {
  id: string;
  alert_type: string;
  enabled: boolean;
  threshold_value: number | null;
  slack_webhook_url: string | null;
  alert_email: string | null;
  notify_slack: boolean;
  notify_email: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// PORTFOLIOS is kept for backward compat but the component uses dynamic portfolios from context
const STATUS_CONFIG = {
  idle: { label: 'Idle', color: 'text-muted-foreground', bg: 'bg-muted/30', icon: Clock },
  running: { label: 'Running…', color: 'text-blue-600', bg: 'bg-blue-50', icon: Loader2 },
  success: { label: 'Success', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
  error: { label: 'Error', color: 'text-danger', bg: 'bg-danger/10', icon: XCircle },
  skipped: { label: 'Skipped', color: 'text-muted-foreground', bg: 'bg-muted/20', icon: ArrowRight },
};

const SYNC_STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; bg: string }> = {
  SUCCESS: { label: 'SUCCESS', color: 'text-success', bg: 'bg-success/10' },
  NO_DATA: { label: 'NO_DATA', color: 'text-blue-600', bg: 'bg-blue-50' },
  DATA_ERROR: { label: 'DATA_ERROR', color: 'text-danger', bg: 'bg-danger/10' },
  SOURCE_ERROR: { label: 'SOURCE_ERROR', color: 'text-danger', bg: 'bg-danger/10' },
  SOURCE_UNAVAILABLE: { label: 'SOURCE_UNAVAILABLE', color: 'text-warning', bg: 'bg-warning/10' },
  AUTH_ERROR: { label: 'AUTH_ERROR', color: 'text-danger', bg: 'bg-danger/10' },
  TIMEOUT: { label: 'TIMEOUT', color: 'text-warning', bg: 'bg-warning/10' },
  VALIDATION_ERROR: { label: 'VALIDATION_ERROR', color: 'text-warning', bg: 'bg-warning/10' },
  PARTIAL: { label: 'PARTIAL', color: 'text-warning', bg: 'bg-warning/10' },
};

// Required fields in the API response — if any are missing it's a DATA_ERROR
const REQUIRED_SYNC_FIELDS = [
  'candidates_discovered',
  'duplicates',
  'inserted',
  'db_total',
  'errors',
];

const ALERT_LABELS: Record<string, { label: string; desc: string }> = {
  provider_unavailable: { label: 'Provider Unavailable', desc: 'Alert when data provider is unreachable during sync' },
  verification_failure_rate: { label: 'Verification Failure Rate >10%', desc: 'Alert when verification failures exceed threshold' },
  suspicious_zero_result: { label: 'Suspicious Zero-Result Sync', desc: 'Alert when portfolio returns 0 records but previously had data' },
};

// ─── Safe numeric helper — NEVER returns NaN ─────────────────────────────────
function safeNum(val: unknown): number {
  if (val === null || val === undefined) return -1; // -1 = missing (not zero)
  const n = Number(val);
  return isNaN(n) ? -1 : n;
}

function safeNumOrZero(val: unknown): number {
  const n = safeNum(val);
  return n < 0 ? 0 : n;
}

// ─── Validate API response fields ────────────────────────────────────────────
function validateSyncResponse(raw: Record<string, unknown>): { missingFields: string[]; syncStatus: SyncStatus } {
  const missingFields: string[] = [];
  for (const field of REQUIRED_SYNC_FIELDS) {
    if (!(field in raw) || raw[field] === undefined || raw[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return { missingFields, syncStatus: 'DATA_ERROR' };
  }

  const errors = Array.isArray(raw.errors) ? raw.errors : [];
  const hasErrors = errors.length > 0;
  const sourceUnavailable = errors.some((error) => error.includes('SOURCE_ACCESS_UNAVAILABLE') || error.includes('No authorized property data provider'));
  const candidatesFetched = safeNum(raw.candidates_discovered);
  const inserted = safeNum(raw.inserted);
  const updated = safeNum(raw.updated);

  if (hasErrors && (inserted <= 0 && updated <= 0)) {
    return { missingFields: [], syncStatus: sourceUnavailable ? 'SOURCE_UNAVAILABLE' : 'SOURCE_ERROR' };
  }
  if (candidatesFetched === 0 && !hasErrors) {
    return { missingFields: [], syncStatus: 'NO_DATA' };
  }
  if (hasErrors && (inserted > 0 || updated > 0)) {
    return { missingFields: [], syncStatus: 'PARTIAL' };
  }
  if (hasErrors) {
    return { missingFields: [], syncStatus: 'DATA_ERROR' };
  }
  return { missingFields: [], syncStatus: 'SUCCESS' };
}

function initPortfolioStateFromList(portfolios: typeof PORTFOLIOS): PortfolioSyncState[] {
  return portfolios
    .filter(p => p.key !== 'all')
    .map((p) => ({
      portfolio: p.label,
      stateCode: p.stateCode,
      status: 'idle' as const,
      syncStatus: null,
      candidatesFetched: 0,
      propertiesVerified: 0,
      listingsVerified: 0,
      rejectedInvalid: 0,
      deduped: 0,
      inserted: 0,
      updated: 0,
      dbTotal: 0,
      dbReal: 0,
      dbSynthetic: 0,
      errors: [],
      completionTime: null,
      sourcesRun: 0,
      startedAt: null,
      completedAt: null,
      diagnostics: null,
      missingFields: [],
      rawApiResponse: null,
    }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SyncOpsDashboardPage() {
  const { configuredPortfolios, portfoliosLoading } = usePortfolio();
  const [activeTab, setActiveTab] = useState<'sync' | 'e2e' | 'alerts'>('sync');
  const [portfolioStates, setPortfolioStates] = useState<PortfolioSyncState[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [expandedPortfolio, setExpandedPortfolio] = useState<string | null>(null);
  const [e2eResults, setE2eResults] = useState<E2EValidationRow[]>([]);
  const [isRunningE2E, setIsRunningE2E] = useState(false);
  const [e2eLog, setE2eLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Alert state
  const [alertEvents, setAlertEvents] = useState<SyncAlertEvent[]>([]);
  const [alertConfigs, setAlertConfigs] = useState<SyncAlertConfig[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [unackedCount, setUnackedCount] = useState(0);
  const [testSendingId, setTestSendingId] = useState<string | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [syncLog, e2eLog]);

  // Real-time subscription for sync_events
  useEffect(() => {
    const channel = supabase
      .channel('sync-ops-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sync_events' },
        (payload) => {
          const ev = payload.new as Record<string, unknown>;
          const portfolio = (ev.operation_id as string) || 'Unknown';
          const meta = (ev.payload as Record<string, unknown>) || {};
          const inserted = safeNumOrZero(meta.inserted);
          const deduped = safeNumOrZero(meta.duplicates);
          addLog(`[RT] ${portfolio}: ${inserted} inserted, ${deduped} deduped`);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // Real-time subscription for sync_alert_events
  useEffect(() => {
    const channel = supabase
      .channel('sync-alert-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sync_alert_events' },
        (payload) => {
          const ev = payload.new as SyncAlertEvent;
          setAlertEvents(prev => [ev, ...prev]);
          setUnackedCount(c => c + 1);
          toast.error(`⚠ Sync Alert: ${ev.message}`, { duration: 6000 });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // Load alert configs and events
  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    const [configsResult, eventsResult] = await Promise.all([
      supabase.from('sync_alert_config').select('*').order('alert_type'),
      supabase.from('sync_alert_events').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    const configs = configsResult.data;
    const events = eventsResult.data;
    setAlertConfigs((configs || []) as SyncAlertConfig[]);
    setAlertEvents((events || []) as SyncAlertEvent[]);
    setUnackedCount((events || []).filter((e: SyncAlertEvent) => !e.acknowledged).length);
    setLoadingAlerts(false);
  }, [supabase]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const saveAlertConfigs = async (updated: SyncAlertConfig[]) => {
    setSavingConfig(true);
    try {
      for (const cfg of updated) {
        await supabase.from('sync_alert_config').upsert({
          id: cfg.id,
          alert_type: cfg.alert_type,
          enabled: cfg.enabled,
          threshold_value: cfg.threshold_value,
          slack_webhook_url: cfg.slack_webhook_url,
          alert_email: cfg.alert_email,
          notify_slack: cfg.notify_slack,
          notify_email: cfg.notify_email,
          updated_at: new Date().toISOString(),
        });
      }
      toast.success('Alert configuration saved');
      await loadAlerts();
    } catch {
      toast.error('Failed to save alert config');
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Test send for Slack/email webhook ────────────────────────────────────────
  const sendTestNotification = useCallback(async (cfg: SyncAlertConfig) => {
    setTestSendingId(cfg.id);
    const testPayload = {
      alert_type: cfg.alert_type,
      message: `[TEST] ${ALERT_LABELS[cfg.alert_type]?.label || cfg.alert_type} — test notification from Sync Ops Dashboard`,
      portfolio: 'Test Portfolio',
      severity: 'info',
      details: { test: true, timestamp: new Date().toISOString() },
    };

    let slackOk = false;
    let emailOk = false;
    const errors: string[] = [];

    // Test Slack webhook
    if (cfg.notify_slack && cfg.slack_webhook_url) {
      try {
        const res = await fetch(cfg.slack_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🔔 *${testPayload.message}*\nAlert Type: \`${cfg.alert_type}\`\nTimestamp: ${testPayload.details.timestamp}`,
          }),
        });
        slackOk = res.ok;
        if (!res.ok) errors.push(`Slack webhook returned HTTP ${res.status}`);
      } catch (e) {
        errors.push(`Slack webhook error: ${e instanceof Error ? e.message : 'Network error'}`);
      }
    }

    // Test email via /api/send-test-email
    if (cfg.notify_email && cfg.alert_email) {
      try {
        const res = await fetch('/api/send-test-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: cfg.alert_email,
            subject: `[TEST] Sync Alert: ${ALERT_LABELS[cfg.alert_type]?.label || cfg.alert_type}`,
            body: `This is a test notification from the Sync Ops Dashboard.\n\nAlert Type: ${cfg.alert_type}\nMessage: ${testPayload.message}\nTimestamp: ${testPayload.details.timestamp}\n\nIf you received this, your email alert is configured correctly.`,
          }),
        });
        const data = await res.json();
        emailOk = res.ok && data.success !== false;
        if (!emailOk) errors.push(`Email send failed: ${data.error || `HTTP ${res.status}`}`);
      } catch (e) {
        errors.push(`Email error: ${e instanceof Error ? e.message : 'Network error'}`);
      }
    }

    setTestSendingId(null);

    if (errors.length > 0) {
      toast.error(`Test failed: ${errors[0]}`);
    } else {
      const channels = [cfg.notify_slack && cfg.slack_webhook_url ? 'Slack' : null, cfg.notify_email && cfg.alert_email ? 'Email' : null].filter(Boolean);
      if (channels.length === 0) {
        toast.warning('No channels configured — enable Slack or Email and add destination first');
      } else {
        toast.success(`Test sent via ${channels.join(' + ')} ✓`);
      }
    }
    // Log the test event
    await supabase.from('sync_alert_events').insert({
      alert_type: cfg.alert_type,
      portfolio: null,
      severity: 'info',
      message: `[TEST] ${ALERT_LABELS[cfg.alert_type]?.label || cfg.alert_type} — test notification`,
      details: { test: true, slack_ok: slackOk, email_ok: emailOk, errors },
    }).catch(() => {});
  }, [supabase]);

  const acknowledgeAlert = async (id: string) => {
    await supabase.from('sync_alert_events').update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', id);
    setAlertEvents(prev => prev.map(e => e.id === id ? { ...e, acknowledged: true } : e));
    setUnackedCount(c => Math.max(0, c - 1));
  };

  function addLog(msg: string) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setSyncLog((prev) => [...prev.slice(-199), `[${ts}] ${msg}`]);
  }

  function addE2ELog(msg: string) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setE2eLog((prev) => [...prev.slice(-199), `[${ts}] ${msg}`]);
  }

  function updatePortfolioState(stateCode: string, patch: Partial<PortfolioSyncState>) {
    setPortfolioStates((prev) =>
      prev.map((p) => (p.stateCode === stateCode ? { ...p, ...patch } : p))
    );
  }

  // ── Check and fire sync alerts ────────────────────────────────────────────────
  const checkAndFireAlerts = useCallback(async (
    portfolioLabel: string,
    result: { candidatesFetched: number; inserted: number; errors: string[] },
    previousCount: number
  ) => {
    const enabledConfigs = alertConfigs.filter(c => c.enabled);

    for (const cfg of enabledConfigs) {
      if (cfg.alert_type === 'provider_unavailable' && result.errors.some(e =>
        e.toLowerCase().includes('unavailable') || e.toLowerCase().includes('timeout') || e.toLowerCase().includes('connection')
      )) {
        try {
          await supabase.from('sync_alert_events').insert({
            alert_type: 'provider_unavailable',
            portfolio: portfolioLabel,
            severity: 'critical',
            message: `Provider unavailable during ${portfolioLabel} sync: ${result.errors[0]}`,
            details: { errors: result.errors },
          });
        } catch (_) {}
      }

      if (cfg.alert_type === 'suspicious_zero_result' && result.candidatesFetched === 0 && previousCount > 0) {
        try {
          await supabase.from('sync_alert_events').insert({
            alert_type: 'suspicious_zero_result',
            portfolio: portfolioLabel,
            severity: 'warning',
            message: `⚠ Suspicious zero-result: ${portfolioLabel} returned 0 records but previously had ${previousCount}`,
            details: { previous_count: previousCount, current_count: 0 },
          });
        } catch (_) {}
      }
    }
  }, [alertConfigs, supabase]);

  // ── Sync a single portfolio ──────────────────────────────────────────────────
  const syncPortfolio = useCallback(async (stateCode: string, portfolioLabel: string) => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    const { count: prevCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('state', stateCode);

    updatePortfolioState(stateCode, {
      status: 'running',
      syncStatus: null,
      startedAt,
      completedAt: null,
      errors: [],
      candidatesFetched: 0,
      propertiesVerified: 0,
      listingsVerified: 0,
      rejectedInvalid: 0,
      deduped: 0,
      inserted: 0,
      updated: 0,
      dbTotal: 0,
      dbReal: 0,
      dbSynthetic: 0,
      sourcesRun: 0,
      completionTime: null,
      diagnostics: null,
      missingFields: [],
      rawApiResponse: null,
    });

    addLog(`▶ Starting sync for ${portfolioLabel} (${stateCode})…`);

    try {
      const res = await fetch('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: portfolioLabel }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data?.error || `HTTP ${res.status}`;
        updatePortfolioState(stateCode, {
          status: 'error',
          syncStatus: 'SOURCE_ERROR',
          errors: [errMsg],
          completedAt: new Date().toISOString(),
          completionTime: Date.now() - t0,
        });
        addLog(`✗ ${portfolioLabel}: SOURCE_ERROR — ${errMsg}`);
        await checkAndFireAlerts(portfolioLabel, { candidatesFetched: 0, inserted: 0, errors: [errMsg] }, prevCount ?? 0);
        return;
      }

      // Find this portfolio's result in the response
      // API returns: data.portfolios[] with fields: candidates_discovered, duplicates, inserted, updated, errors, etc.
      const portfolioResult = Array.isArray(data.portfolios)
        ? (data.portfolios as Record<string, unknown>[]).find(
            (p) => p.portfolio === portfolioLabel || p.state_code === stateCode
          )
        : null;

      if (!portfolioResult) {
        // Portfolio not found in response — DATA_ERROR
        updatePortfolioState(stateCode, {
          status: 'error',syncStatus: 'DATA_ERROR',
          errors: [`DATA_ERROR: Portfolio "${portfolioLabel}" not found in sync response`],
          missingFields: ['portfolio_result'],
          completedAt: new Date().toISOString(),
          completionTime: Date.now() - t0,
          rawApiResponse: data,
        });
        addLog(`✗ ${portfolioLabel}: DATA_ERROR — portfolio not found in response`);
        return;
      }

      // Validate required fields are present
      const { missingFields, syncStatus } = validateSyncResponse(portfolioResult);

      // Extract validated numeric values — NEVER NaN
      const candidatesFetched = safeNumOrZero(portfolioResult.candidates_discovered);
      const propertiesVerified = safeNumOrZero(portfolioResult.verified);
      const listingsVerified = safeNumOrZero(portfolioResult.db_verified_status);
      const rejectedInvalid = safeNumOrZero(portfolioResult.rejected) + safeNumOrZero(portfolioResult.quarantined);
      const deduped = safeNumOrZero(portfolioResult.duplicates);
      const inserted = safeNumOrZero(portfolioResult.inserted);
      const updated = safeNumOrZero(portfolioResult.updated);
      const dbTotal = safeNumOrZero(portfolioResult.db_total);
      const dbReal = safeNumOrZero(portfolioResult.db_real);
      const dbSynthetic = safeNumOrZero(portfolioResult.db_synthetic);
      const sourcesRun = safeNumOrZero(portfolioResult.sources_run);
      const durationMs = safeNumOrZero(portfolioResult.duration_ms) || (Date.now() - t0);
      const errors: string[] = Array.isArray(portfolioResult.errors) ? portfolioResult.errors as string[] : [];

      const elapsed = Date.now() - t0;
      const completedAt = new Date().toISOString();

      // Build diagnostics
      const verificationFailures = (portfolioResult.verification_failures as Record<string, number>) || {};
      const responseValidation = REQUIRED_SYNC_FIELDS.map(f => ({
        field: f,
        present: f in portfolioResult && portfolioResult[f] !== undefined && portfolioResult[f] !== null,
      }));

      const diagnostics: PortfolioDiagnostics = {
        sourceName: 'Verification Pipeline',
        httpStatus: res.status,
        requestSuccessful: res.ok,
        rawCandidatesReturned: candidatesFetched,
        normalizedCandidates: safeNumOrZero(portfolioResult.addresses_normalized),
        propertiesVerified,
        listingsVerified,
        rejectedInvalid,
        deduped,
        inserted,
        errors,
        durationMs,
        responseValidation,
        errorCode: missingFields.length > 0 ? 'MISSING_SYNC_METRIC' : (errors.length > 0 ? 'SYNC_ERRORS' : null),
      };

      const uiStatus = syncStatus === 'SUCCESS' || syncStatus === 'NO_DATA' ? 'success'
        : syncStatus === 'PARTIAL'? 'success' :'error';

      updatePortfolioState(stateCode, {
        status: uiStatus,
        syncStatus,
        candidatesFetched,
        propertiesVerified,
        listingsVerified,
        rejectedInvalid,
        deduped,
        inserted,
        updated,
        dbTotal,
        dbReal,
        dbSynthetic,
        errors: missingFields.length > 0
          ? [`DATA_ERROR: Missing fields: ${missingFields.join(', ')}`, ...errors]
          : errors,
        sourcesRun,
        completedAt,
        completionTime: elapsed,
        diagnostics,
        missingFields,
        rawApiResponse: portfolioResult,
      });

      // Structured log output
      if (missingFields.length > 0) {
        addLog(`✗ ${portfolioLabel}:`);
        addLog(`  SYNC FAILED`);
        addLog(`  Reason: RESPONSE_SCHEMA_MISMATCH`);
        addLog(`  Details: Missing fields: ${missingFields.join(', ')}`);
        addLog(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
      } else if (syncStatus === 'NO_DATA') {
        addLog(`○ ${portfolioLabel}:`);
        addLog(`  0 candidates returned from source`);
        addLog(`  Status: NO_DATA (source responded correctly, zero results)`);
        addLog(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
      } else if (syncStatus === 'SOURCE_ERROR' || syncStatus === 'SOURCE_UNAVAILABLE' || syncStatus === 'DATA_ERROR') {
        addLog(`✗ ${portfolioLabel}:`);
        addLog(`  SYNC FAILED`);
        addLog(`  Reason: ${syncStatus}`);
        if (errors.length > 0) addLog(`  Details: ${errors[0]}`);
        addLog(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
      } else {
        addLog(`✓ ${portfolioLabel}:`);
        addLog(`  ${candidatesFetched} candidates fetched`);
        addLog(`  ${propertiesVerified} properties verified`);
        addLog(`  ${listingsVerified} listings verified`);
        addLog(`  ${rejectedInvalid} invalid records rejected`);
        addLog(`  ${deduped} duplicates removed`);
        addLog(`  ${inserted} records inserted`);
        addLog(`  ${errors.length} errors`);
        addLog(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
        if (syncStatus === 'PARTIAL') {
          errors.forEach((e: string) => addLog(`  ⚠ ${e}`));
        }
      }

      await checkAndFireAlerts(portfolioLabel, { candidatesFetched, inserted, errors }, prevCount ?? 0);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      updatePortfolioState(stateCode, {
        status: 'error',
        syncStatus: 'SOURCE_ERROR',
        errors: [msg],
        completedAt: new Date().toISOString(),
        completionTime: Date.now() - t0,
      });
      addLog(`✗ ${portfolioLabel}: SOURCE_ERROR — ${msg}`);
      await checkAndFireAlerts(portfolioLabel, { candidatesFetched: 0, inserted: 0, errors: [msg] }, prevCount ?? 0);
    }
  }, [checkAndFireAlerts, supabase]);

  // ── Sync all portfolios sequentially ────────────────────────────────────────
  const syncAllPortfolios = useCallback(async () => {
    setIsSyncingAll(true);
    setSyncLog([]);
    setPortfolioStates(initPortfolioStateFromList(configuredPortfolios));
    addLog(`═══ Starting full sync across all ${configuredPortfolios.length} portfolios ═══`);

    for (const p of configuredPortfolios) {
      await syncPortfolio(p.stateCode, p.label);
    }

    addLog('═══ Full sync complete ═══');
    setIsSyncingAll(false);
  }, [syncPortfolio, configuredPortfolios]);

  // ── E2E Validation ───────────────────────────────────────────────────────────
  const runE2EValidation = useCallback(async () => {
    setIsRunningE2E(true);
    setE2eLog([]);
    setE2eResults([]);
    addE2ELog(`═══ Starting E2E validation across all ${configuredPortfolios.length} portfolios ═══`);

    const results: E2EValidationRow[] = [];

    for (const p of configuredPortfolios) {
      addE2ELog(`Validating ${p.label} (${p.stateCode})…`);

      const row: E2EValidationRow = {
        portfolio: p.label,
        stateCode: p.stateCode,
        leadsIngested: 0,
        dedupRan: false,
        scoringCompleted: false,
        enrichmentProgress: 0,
        outreachReadyCount: 0,
        status: 'pending',
        issues: [],
      };

      try {
        const { count: leadCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', p.stateCode);

        row.leadsIngested = safeNumOrZero(leadCount);

        if (row.leadsIngested === 0) {
          row.issues.push('No leads ingested — sync may not have run');
          row.status = 'fail';
          addE2ELog(`  ✗ ${p.label}: 0 leads — sync not run`);
          results.push(row);
          continue;
        }

        const { count: scoredCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', p.stateCode)
          .gt('prospect_score', 0);

        row.scoringCompleted = safeNumOrZero(scoredCount) > 0;
        if (!row.scoringCompleted) {
          row.issues.push('Scoring not completed — prospect_score is 0 for all leads');
        }

        const { data: syncEvents } = await supabase
          .from('sync_events')
          .select('payload')
          .eq('operation_id', p.label)
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(1);

        const lastEvent = syncEvents?.[0];
        const eventPayload = lastEvent?.payload as Record<string, unknown> | null;
        row.dedupRan = !!(eventPayload?.duplicates !== undefined || row.leadsIngested > 0);

        const { count: enrichedCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', p.stateCode)
          .not('enrichment_status', 'is', null)
          .neq('enrichment_status', 'not_started');

        row.enrichmentProgress = row.leadsIngested > 0
          ? Math.round((safeNumOrZero(enrichedCount) / row.leadsIngested) * 100)
          : 0;

        const { count: outreachReady } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', p.stateCode)
          .gte('prospect_score', 60);

        row.outreachReadyCount = safeNumOrZero(outreachReady);

        if (row.outreachReadyCount === 0) {
          row.issues.push('No outreach-ready leads (score ≥ 60)');
        }

        if (row.issues.length === 0) {
          row.status = 'pass';
        } else if (row.leadsIngested > 0 && row.scoringCompleted) {
          row.status = 'warn';
        } else {
          row.status = 'fail';
        }

        addE2ELog(
          `  ${row.status === 'pass' ? '✓' : row.status === 'warn' ? '⚠' : '✗'} ${p.label}: ${row.leadsIngested} leads, scored=${row.scoringCompleted}, enriched=${row.enrichmentProgress}%, outreach-ready=${row.outreachReadyCount}`
        );
      } catch (err) {
        row.issues.push(err instanceof Error ? err.message : 'Query error');
        row.status = 'fail';
        addE2ELog(`  ✗ ${p.label}: query error`);
      }

      results.push(row);
    }

    setE2eResults(results);
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    addE2ELog(`═══ E2E complete: ${passed}/${configuredPortfolios.length} passed, ${failed} failed ═══`);
    setIsRunningE2E(false);
  }, [supabase, configuredPortfolios]);

  // ── Aggregate stats — validated, never NaN ───────────────────────────────────
  const totalFetched = portfolioStates.reduce((s, p) => s + p.candidatesFetched, 0);
  const totalInserted = portfolioStates.reduce((s, p) => s + p.inserted + p.updated, 0);
  const totalErrors = portfolioStates.reduce((s, p) => s + p.errors.length, 0);
  // Only count SUCCESS or PARTIAL as "OK" — NO_DATA, DATA_ERROR, SOURCE_ERROR are NOT OK
  const successCount = portfolioStates.filter((p) => p.syncStatus === 'SUCCESS' || p.syncStatus === 'PARTIAL').length;
  const runningCount = portfolioStates.filter((p) => p.status === 'running').length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity size={24} className="text-primary" />
              Sync Ops Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time per-portfolio sync progress, E2E validation, and alert monitoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveTab('e2e'); runE2EValidation(); }}
              disabled={isRunningE2E || isSyncingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              {isRunningE2E ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              Run E2E Validation
            </button>
            <button
              onClick={syncAllPortfolios}
              disabled={isSyncingAll || isRunningE2E}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSyncingAll ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {isSyncingAll ? `Syncing (${runningCount} active)…` : `Sync All ${configuredPortfolios.length} Portfolios`}
            </button>
          </div>
        </div>

        {/* KPI Strip — validated values, never NaN */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Leads Fetched',
              value: totalFetched.toLocaleString(),
              icon: Database,
              color: 'text-primary',
            },
            {
              label: 'Leads Inserted',
              value: totalInserted.toLocaleString(),
              icon: TrendingUp,
              color: 'text-success',
            },
            {
              label: 'Portfolios OK',
              // Dynamic total — never hardcoded
              value: `${successCount}/${configuredPortfolios.length}`,
              icon: CheckCircle2,
              color: successCount === configuredPortfolios.length ? 'text-success' : successCount > 0 ? 'text-warning' : 'text-muted-foreground',
            },
            {
              label: 'Active Alerts',
              value: unackedCount.toString(),
              icon: Bell,
              color: unackedCount > 0 ? 'text-danger' : 'text-muted-foreground',
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/30 ${kpi.color}`}>
                <kpi.icon size={18} />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: 'sync', label: 'Sync Progress', icon: Radio },
            { key: 'e2e', label: 'E2E Validation', icon: Shield },
            { key: 'alerts', label: `Alerts${unackedCount > 0 ? ` (${unackedCount})` : ''}`, icon: Bell },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'sync' | 'e2e' | 'alerts')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.key === 'alerts' && unackedCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                  {unackedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Sync Progress Tab ── */}
        {activeTab === 'sync' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Portfolio Cards */}
            <div className="lg:col-span-2 space-y-3">
              {portfolioStates.map((ps) => {
                const cfg = STATUS_CONFIG[ps.status];
                const StatusIcon = cfg.icon;
                const isExpanded = expandedPortfolio === ps.stateCode;
                const avgTime = ps.completionTime ? `${(ps.completionTime / 1000).toFixed(1)}s` : '—';
                const syncStatusCfg = ps.syncStatus ? SYNC_STATUS_CONFIG[ps.syncStatus] : null;

                return (
                  <div key={ps.stateCode} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedPortfolio(isExpanded ? null : ps.stateCode)}
                    >
                      <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
                        <StatusIcon
                          size={14}
                          className={`${cfg.color} ${ps.status === 'running' ? 'animate-spin' : ''}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">{ps.portfolio}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                            {ps.stateCode}
                          </span>
                          {/* Explicit sync status badge — not just "Success" */}
                          {syncStatusCfg && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold font-mono ${syncStatusCfg.bg} ${syncStatusCfg.color}`}>
                              {syncStatusCfg.label}
                            </span>
                          )}
                          {ps.status === 'idle' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-muted/30 text-muted-foreground">
                              IDLE
                            </span>
                          )}
                          {ps.status === 'running' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-600">
                              RUNNING
                            </span>
                          )}
                        </div>
                        {ps.status !== 'idle' && (
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                            {/* Show DATA ERROR if fields are missing — not zero */}
                            {ps.missingFields.length > 0 ? (
                              <span className="text-danger font-semibold">
                                DATA ERROR — {ps.missingFields.join(', ')} missing
                              </span>
                            ) : (
                              <>
                                <span>{ps.candidatesFetched} fetched</span>
                                <span>·</span>
                                <span>{ps.deduped} deduped</span>
                                <span>·</span>
                                <span>{ps.inserted} inserted</span>
                                <span>·</span>
                                <span>{ps.sourcesRun} sources</span>
                                <span>·</span>
                                <span>{avgTime}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {ps.status === 'running' && (
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
                        </div>
                      )}

                      {ps.errors.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20 font-semibold">
                          {ps.errors.length} error{ps.errors.length > 1 ? 's' : ''}
                        </span>
                      )}

                      {!isSyncingAll && ps.status !== 'running' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); syncPortfolio(ps.stateCode, ps.portfolio); }}
                          className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title={`Sync ${ps.portfolio}`}
                        >
                          <RefreshCw size={13} />
                        </button>
                      )}

                      {(ps.diagnostics || ps.errors.length > 0) && (
                        isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />
                      )}
                    </div>

                    {/* Expanded diagnostics panel */}
                    {isExpanded && (ps.diagnostics || ps.errors.length > 0) && (
                      <div className="border-t border-border bg-muted/10 px-4 py-3 space-y-3">
                        {ps.diagnostics && (
                          <>
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Sync Diagnostics — {ps.portfolio}
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Source</span>
                                <span className="font-medium text-foreground">{ps.diagnostics.sourceName}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">HTTP Status</span>
                                <span className={`font-medium ${ps.diagnostics.httpStatus === 200 ? 'text-success' : 'text-danger'}`}>
                                  {ps.diagnostics.httpStatus ?? '—'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Raw Candidates</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.rawCandidatesReturned}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Normalized</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.normalizedCandidates}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Properties Verified</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.propertiesVerified}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Listings Verified</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.listingsVerified}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Rejected</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.rejectedInvalid}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Deduped</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.deduped}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Inserted</span>
                                <span className="font-mono text-foreground">{ps.diagnostics.inserted}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Duration</span>
                                <span className="font-mono text-foreground">{(ps.diagnostics.durationMs / 1000).toFixed(1)}s</span>
                              </div>
                            </div>

                            {/* Response field validation */}
                            <div>
                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                                Response Validation
                              </div>
                              <div className="space-y-1">
                                {ps.diagnostics.responseValidation.map(v => (
                                  <div key={v.field} className="flex items-center gap-2 text-[11px]">
                                    {v.present
                                      ? <CheckCircle2 size={11} className="text-success shrink-0" />
                                      : <XCircle size={11} className="text-danger shrink-0" />
                                    }
                                    <span className={`font-mono ${v.present ? 'text-foreground' : 'text-danger font-semibold'}`}>
                                      {v.field}
                                    </span>
                                    {!v.present && (
                                      <span className="text-danger text-[10px]">MISSING</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {ps.diagnostics.errorCode && (
                              <div className="p-2 rounded-lg bg-danger/5 border border-danger/20">
                                <div className="text-[10px] font-semibold text-danger">Error Code: {ps.diagnostics.errorCode}</div>
                              </div>
                            )}
                          </>
                        )}

                        {ps.errors.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Errors</div>
                            {ps.errors.map((e, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs text-danger">
                                <XCircle size={11} className="mt-0.5 shrink-0" />
                                <span>{e}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sync Log */}
            <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Terminal size={14} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Sync Log</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{syncLog.length} entries</span>
                <button
                  onClick={() => setSyncLog([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
              <div
                ref={logRef}
                className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5 bg-muted/5 min-h-[400px] max-h-[600px]"
              >
                {syncLog.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">
                    Run a sync to see live output…
                  </div>
                ) : (
                  syncLog.map((line, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed ${
                        line.includes('✓') ? 'text-success' :
                        line.includes('✗') ? 'text-danger' :
                        line.includes('⚠') || line.includes('PARTIAL') ? 'text-warning' :
                        line.includes('○') ? 'text-blue-500' :
                        line.includes('DATA_ERROR') || line.includes('SOURCE_ERROR') ? 'text-danger' :
                        line.includes('═══') ? 'text-primary font-semibold' :
                        'text-muted-foreground'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── E2E Validation Tab ── */}
        {activeTab === 'e2e' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {e2eResults.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <Shield size={32} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">No validation results yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "Run E2E Validation" to check all {configuredPortfolios.length} portfolios
                  </p>
                  <button
                    onClick={runE2EValidation}
                    disabled={isRunningE2E}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold mx-auto hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isRunningE2E ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    Run E2E Validation
                  </button>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Shield size={15} className="text-primary" />
                      <span className="text-sm font-semibold text-foreground">E2E Validation Results</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 size={11} /> {e2eResults.filter((r) => r.status === 'pass').length} passed
                      </span>
                      <span className="flex items-center gap-1 text-warning">
                        <AlertTriangle size={11} /> {e2eResults.filter((r) => r.status === 'warn').length} warn
                      </span>
                      <span className="flex items-center gap-1 text-danger">
                        <XCircle size={11} /> {e2eResults.filter((r) => r.status === 'fail').length} failed
                      </span>
                      <button
                        onClick={runE2EValidation}
                        disabled={isRunningE2E}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-muted/50 hover:bg-muted text-foreground disabled:opacity-50 transition-colors"
                      >
                        {isRunningE2E ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                        Re-run
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Portfolio</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Ingested</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Dedup</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Scored</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Enriched</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Outreach-Ready</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {e2eResults.map((row) => (
                          <tr key={row.stateCode} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{row.portfolio}</div>
                              {row.issues.length > 0 && (
                                <div className="text-[10px] text-danger mt-0.5 space-y-0.5">
                                  {row.issues.map((issue, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <AlertTriangle size={9} />
                                      {issue}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-foreground">
                              {row.leadsIngested.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {row.dedupRan ? (
                                <CheckCircle2 size={13} className="text-success mx-auto" />
                              ) : (
                                <XCircle size={13} className="text-muted-foreground mx-auto" />
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {row.scoringCompleted ? (
                                <CheckCircle2 size={13} className="text-success mx-auto" />
                              ) : (
                                <XCircle size={13} className="text-danger mx-auto" />
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${row.enrichmentProgress}%` }}
                                  />
                                </div>
                                <span className="font-mono text-foreground w-8 text-right">{row.enrichmentProgress}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-foreground">
                              {row.outreachReadyCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {row.status === 'pass' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold">
                                  <CheckCircle2 size={9} /> Pass
                                </span>
                              )}
                              {row.status === 'warn' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-semibold">
                                  <AlertTriangle size={9} /> Warn
                                </span>
                              )}
                              {row.status === 'fail' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/10 text-danger text-[10px] font-semibold">
                                  <XCircle size={9} /> Fail
                                </span>
                              )}
                              {row.status === 'pending' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground text-[10px] font-semibold">
                                  <Clock size={9} /> Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Terminal size={14} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Validation Log</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{e2eLog.length} entries</span>
                <button onClick={() => setE2eLog([])} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  Clear
                </button>
              </div>
              <div
                ref={logRef}
                className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5 bg-muted/5 min-h-[400px] max-h-[600px]"
              >
                {e2eLog.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">Run validation to see output…</div>
                ) : (
                  e2eLog.map((line, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed ${
                        line.includes('✓') ? 'text-success' :
                        line.includes('✗') ? 'text-danger' :
                        line.includes('⚠') ? 'text-warning' :
                        line.includes('═══') ? 'text-primary font-semibold' :
                        'text-muted-foreground'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Alerts Tab ── */}
        {activeTab === 'alerts' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alert Events */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Bell size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Alert Events</span>
                  {unackedCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-danger text-white text-[9px] font-bold">
                      {unackedCount} new
                    </span>
                  )}
                </div>
                <button onClick={loadAlerts} disabled={loadingAlerts} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50">
                  <RefreshCw size={13} className={loadingAlerts ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="p-4 max-h-[500px] overflow-y-auto">
                {loadingAlerts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={18} className="animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    {alertEvents.filter(e => !e.acknowledged).length === 0 && alertEvents.filter(e => e.acknowledged).length === 0 && (
                      <div className="text-center py-8">
                        <Bell size={24} className="text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No alerts triggered</p>
                        <p className="text-xs text-muted-foreground mt-1">Alerts fire automatically during sync operations</p>
                      </div>
                    )}

                    {alertEvents.filter(e => !e.acknowledged).length > 0 && (
                      <div className="mb-4">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Active ({alertEvents.filter(e => !e.acknowledged).length})
                        </div>
                        <div className="space-y-2">
                          {alertEvents.filter(e => !e.acknowledged).map(ev => {
                            const isTest = (ev.details as Record<string, unknown>)?.test === true;
                            const severityStyle = isTest
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : ev.severity === 'critical' ?'bg-danger/10 text-danger border-danger/20' :'bg-warning/10 text-warning border-warning/20';
                            return (
                              <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-xl border ${severityStyle}`}>
                                {isTest ? <Info size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold">{ev.message}</div>
                                  {ev.portfolio && (
                                    <div className="text-[10px] mt-0.5 opacity-80">Portfolio: {ev.portfolio}</div>
                                  )}
                                  <div className="text-[10px] mt-0.5 opacity-70">
                                    {new Date(ev.created_at).toLocaleString()}
                                  </div>
                                </div>
                                <button
                                  onClick={() => acknowledgeAlert(ev.id)}
                                  className="shrink-0 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-semibold transition-colors"
                                >
                                  Ack
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {alertEvents.filter(e => e.acknowledged).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Acknowledged ({alertEvents.filter(e => e.acknowledged).length})
                        </div>
                        <div className="space-y-1.5">
                          {alertEvents.filter(e => e.acknowledged).slice(0, 10).map(ev => (
                            <div key={ev.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border">
                              <CheckCircle2 size={11} className="text-success shrink-0" />
                              <span className="text-[11px] text-muted-foreground truncate">{ev.message}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                {new Date(ev.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Alert Config with Test Send */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Settings size={15} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Alert Configuration</span>
                <span className="ml-auto text-[10px] text-muted-foreground">Configure + test webhooks</span>
              </div>

              <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                {loadingAlerts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={18} className="animate-spin text-primary" />
                  </div>
                ) : alertConfigs.length === 0 ? (
                  <div className="text-center py-8">
                    <Settings size={24} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No alert configs found</p>
                    <p className="text-xs text-muted-foreground mt-1">Run the migration to seed default configs</p>
                  </div>
                ) : (
                  <>
                    {alertConfigs.map(cfg => {
                      const meta = ALERT_LABELS[cfg.alert_type] || { label: cfg.alert_type, desc: '' };
                      const isTesting = testSendingId === cfg.id;
                      return (
                        <div key={cfg.id} className="bg-muted/10 border border-border rounded-xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{meta.desc}</div>
                            </div>
                            <button
                              onClick={() => {
                                const updated = alertConfigs.map(c =>
                                  c.id === cfg.id ? { ...c, enabled: !c.enabled } : c
                                );
                                setAlertConfigs(updated);
                              }}
                              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${cfg.enabled ? 'bg-primary' : 'bg-muted'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>

                          {cfg.enabled && (
                            <div className="space-y-2">
                              {cfg.alert_type === 'verification_failure_rate' && (
                                <div>
                                  <label className="text-[10px] font-semibold text-muted-foreground">Threshold (%)</label>
                                  <input
                                    type="number" min={1} max={100}
                                    value={cfg.threshold_value ?? 10}
                                    onChange={e => setAlertConfigs(prev => prev.map(c =>
                                      c.id === cfg.id ? { ...c, threshold_value: Number(e.target.value) } : c
                                    ))}
                                    className="mt-1 w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
                                  />
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => setAlertConfigs(prev => prev.map(c =>
                                    c.id === cfg.id ? { ...c, notify_email: !c.notify_email } : c
                                  ))}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                    cfg.notify_email ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                                  }`}
                                >
                                  <Mail size={11} /> Email
                                </button>
                                <button
                                  onClick={() => setAlertConfigs(prev => prev.map(c =>
                                    c.id === cfg.id ? { ...c, notify_slack: !c.notify_slack } : c
                                  ))}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                    cfg.notify_slack ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                                  }`}
                                >
                                  <Zap size={11} /> Slack
                                </button>
                              </div>

                              {cfg.notify_email && (
                                <input
                                  value={cfg.alert_email || ''}
                                  onChange={e => setAlertConfigs(prev => prev.map(c =>
                                    c.id === cfg.id ? { ...c, alert_email: e.target.value } : c
                                  ))}
                                  placeholder="alert@yourcompany.com"
                                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
                                />
                              )}

                              {cfg.notify_slack && (
                                <input
                                  value={cfg.slack_webhook_url || ''}
                                  onChange={e => setAlertConfigs(prev => prev.map(c =>
                                    c.id === cfg.id ? { ...c, slack_webhook_url: e.target.value } : c
                                  ))}
                                  placeholder="https://hooks.slack.com/services/…"
                                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
                                />
                              )}

                              {/* Test Send Button */}
                              <button
                                onClick={() => sendTestNotification(cfg)}
                                disabled={isTesting || (!cfg.notify_email && !cfg.notify_slack)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
                                title={(!cfg.notify_email && !cfg.notify_slack) ? 'Enable Email or Slack first' : 'Send a test notification to verify the webhook'}
                              >
                                {isTesting ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Send size={11} />
                                )}
                                {isTesting ? 'Sending test…' : 'Send Test Notification'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => saveAlertConfigs(alertConfigs)}
                      disabled={savingConfig}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingConfig ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                      Save Alert Config
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}