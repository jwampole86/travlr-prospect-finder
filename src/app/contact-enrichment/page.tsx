'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Database, RefreshCw, Shield, Play, Pause, RotateCcw, XCircle, CheckCircle2, AlertCircle, Activity, DollarSign, Settings, BarChart2, Users, Phone, Zap, ChevronDown, Loader2, Eye, X, TrendingDown, AlertTriangle, Info, FlaskConical, Server, Layers, Target, Check, Search,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewStats {
  eligibleProperties: number;
  missingOwner: number;
  missingPhone: number;
  fullyVerified: number;
  jobsToday: number;
  ownersFound: number;
  phonesFound: number;
  reviewRequired: number;
  providerErrors: number;
  spendThisMonthCents: number;
  queued: number;
  running: number;
}

interface BatchJob {
  id: string;
  batch_name: string;
  scope: string;
  status: string;
  total_leads: number;
  processed: number;
  property_matches: number;
  owners_found: number;
  phones_found: number;
  auto_accepted: number;
  review_required: number;
  no_match: number;
  errors: number;
  actual_cost_cents: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface QueueItem {
  id: string;
  lead_id: string;
  status: string;
  priority: number;
  provider: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  result_type: string | null;
  cost_cents: number;
  error_code: string | null;
  address?: string;
}

interface ReviewItem {
  id: string;
  lead_id: string;
  current_owner_name: string | null;
  suggested_owner_name: string | null;
  current_phone: string | null;
  suggested_phone: string | null;
  confidence: string | null;
  match_score: number;
  evidence: Record<string, unknown>;
  provider: string | null;
  reason: string | null;
  review_status: string;
  match_id: string | null;
  address?: string;
}

interface BenchmarkRun {
  id: string;
  run_name: string;
  provider: string;
  status: string;
  sample_size: number;
  properties_tested: number;
  owner_exact_match_pct: number;
  phone_exact_match_pct: number;
  wrong_owner_pct: number;
  wrong_phone_pct: number;
  no_match_count: number;
  review_required_pct: number;
  avg_cost_per_property_cents: number;
  avg_response_ms: number;
  true_match_count: number;
  false_match_count: number;
  created_at: string;
  completed_at: string | null;
}

interface Provider {
  provider_name: string;
  provider_type: string;
  health_status: string;
  enabled: boolean;
  automation_allowed: boolean;
  rate_limit_per_day: number;
  api_configured: boolean | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  requests_today: number;
  successes_today: number;
  avg_response_ms: number;
  success_rate: number | null;
  notes: string | null;
}

interface Economics {
  requestsThisMonth: number;
  estimatedSpendDollars: string;
  monthlyBudgetDollars: string;
  budgetUsedPct: number;
  budgetStatus: string;
  propertiesProcessed: number;
  ownersFound: number;
  phonesFound: number;
  emailsFound: number;
  fullyVerifiedNew: number;
  reviewRequired: number;
  noMatch: number;
  costPerPropertyCents: number;
  costPerOwnerCents: number;
  costPerPhoneCents: number;
  costPerFullyVerifiedCents: number;
  coverage: {
    totalLeads: number;
    ownerVerified: number;
    addressVerified: number;
    phoneVerified: number;
    fullyVerified: number;
    missingOwner: number;
    missingPhone: number;
    ownerVerifiedPct: number;
    phoneVerifiedPct: number;
    fullyVerifiedPct: number;
  };
}

interface EnrichmentSetting {
  setting_key: string;
  setting_value: string;
  setting_type: string;
  label: string;
  description: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'queue', label: 'Queue', icon: Layers },
  { id: 'review', label: 'Review Required', icon: Eye },
  { id: 'benchmark', label: 'Benchmark', icon: FlaskConical },
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'economics', label: 'Economics', icon: DollarSign },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabId = typeof TABS[number]['id'];

const SCOPE_OPTIONS = [
  { value: 'HIGH_PRIORITY_MISSING_PHONE', label: 'High Priority + Missing Phone', recommended: true },
  { value: 'SELECTED_LEADS', label: 'Selected Leads' },
  { value: 'MISSING_PHONE', label: 'Missing Phone' },
  { value: 'MISSING_OWNER', label: 'Missing Owner' },
  { value: 'MISSING_OWNER_AND_PHONE', label: 'Missing Owner + Phone' },
  { value: 'VERIFIED_ADDRESS_MISSING_PHONE', label: 'Verified Address + Missing Phone' },
  { value: 'ENTIRE_PORTFOLIO', label: 'Entire Portfolio' },
  { value: 'ALL_ELIGIBLE', label: 'All Eligible Leads' },
];

const STATUS_BADGE: Record<string, string> = {
  QUEUED: 'bg-muted text-muted-foreground',
  RUNNING: 'bg-blue-500/10 text-blue-600',
  PAUSED: 'bg-amber-500/10 text-amber-600',
  COMPLETED: 'bg-emerald-500/10 text-emerald-600',
  CANCELLED: 'bg-muted text-muted-foreground',
  FAILED: 'bg-red-500/10 text-red-600',
  PROPERTY_MATCHED: 'bg-teal-500/10 text-teal-600',
  OWNER_FOUND: 'bg-emerald-500/10 text-emerald-600',
  CONTACT_FOUND: 'bg-green-500/10 text-green-600',
  AUTO_ACCEPTED: 'bg-emerald-500/10 text-emerald-600',
  REVIEW_REQUIRED: 'bg-amber-500/10 text-amber-600',
  NO_MATCH: 'bg-orange-500/10 text-orange-600',
  RATE_LIMITED: 'bg-purple-500/10 text-purple-600',
  PROVIDER_ERROR: 'bg-red-500/10 text-red-600',
  ACTIVE: 'bg-emerald-500/10 text-emerald-600',
  DEGRADED: 'bg-amber-500/10 text-amber-600',
  AUTH_ERROR: 'bg-red-500/10 text-red-600',
  DISABLED: 'bg-muted text-muted-foreground',
};

const centsToDisplay = (cents: number) =>
  cents === 0 ? '—' : `$${(cents / 100).toFixed(2)}`;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactEnrichmentPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);

  // Overview
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);

  // Queue
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [bulkScope, setBulkScope] = useState('HIGH_PRIORITY_MISSING_PHONE');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [batchActionLoading, setBatchActionLoading] = useState<string | null>(null);

  // Review
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewActionLoading, setReviewActionLoading] = useState<string | null>(null);

  // Benchmark
  const [benchmarkRuns, setBenchmarkRuns] = useState<BenchmarkRun[]>([]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkSampleSize, setBenchmarkSampleSize] = useState(100);
  const [selectedBenchmarkRun, setSelectedBenchmarkRun] = useState<BenchmarkRun | null>(null);

  // Providers
  const [providers, setProviders] = useState<Provider[]>([]);

  // Economics
  const [economics, setEconomics] = useState<Economics | null>(null);

  // Settings
  const [settings, setSettings] = useState<EnrichmentSetting[]>([]);
  const [settingsDirty, setSettingsDirty] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [leadsRes, jobsTodayRes, costRes, queueRes] = await Promise.all([
      supabase.from('leads').select('verified_owner, verified_address, verified_number, contact_phone, fully_verified, is_synthetic').eq('is_synthetic', false),
      supabase.from('enrichment_jobs').select('job_status, match_confidence').gte('created_at', todayStr),
      supabase.from('enrichment_cost_records').select('estimated_cost_cents').gte('created_at', monthStart.toISOString()),
      supabase.from('enrichment_jobs').select('job_status').in('job_status', ['PENDING', 'RUNNING']),
    ]);

    const leads = leadsRes.data || [];
    const jobsToday = jobsTodayRes.data || [];
    const costs = costRes.data || [];
    const queuedJobs = queueRes.data || [];

    setOverviewStats({
      eligibleProperties: leads.length,
      missingOwner: leads.filter(l => !l.verified_owner).length,
      missingPhone: leads.filter(l => !l.contact_phone).length,
      fullyVerified: leads.filter(l => l.fully_verified).length,
      jobsToday: jobsToday.length,
      ownersFound: jobsToday.filter(j => j.job_status === 'FOUND').length,
      phonesFound: jobsToday.filter(j => j.match_confidence === 'VERIFIED' || j.match_confidence === 'HIGH_CONFIDENCE').length,
      reviewRequired: jobsToday.filter(j => j.job_status === 'REVIEW_REQUIRED').length,
      providerErrors: jobsToday.filter(j => j.job_status === 'FAILED').length,
      spendThisMonthCents: costs.reduce((sum, c) => sum + (c.estimated_cost_cents || 0), 0),
      queued: queuedJobs.filter(j => j.job_status === 'PENDING').length,
      running: queuedJobs.filter(j => j.job_status === 'RUNNING').length,
    });
  }, [supabase]);

  const loadQueue = useCallback(async () => {
    const [batchRes, itemsRes] = await Promise.all([
      supabase.from('enrichment_batch_jobs').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('enrichment_queue_items').select('id, lead_id, status, priority, provider, started_at, completed_at, duration_ms, result_type, cost_cents, error_code').order('created_at', { ascending: false }).limit(50),
    ]);
    setBatchJobs((batchRes.data || []) as BatchJob[]);
    setQueueItems((itemsRes.data || []) as QueueItem[]);
  }, [supabase]);

  const loadReview = useCallback(async () => {
    setReviewLoading(true);
    const { data } = await supabase
      .from('enrichment_review_queue')
      .select('*')
      .eq('review_status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(50);
    setReviewItems((data || []) as ReviewItem[]);
    setReviewLoading(false);
  }, [supabase]);

  const loadBenchmark = useCallback(async () => {
    const { data } = await supabase
      .from('enrichment_benchmark_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    setBenchmarkRuns((data || []) as BenchmarkRun[]);
  }, [supabase]);

  const loadProviders = useCallback(async () => {
    const res = await fetch('/api/enrichment/provider-health');
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers || []);
    }
  }, []);

  const loadEconomics = useCallback(async () => {
    const res = await fetch('/api/enrichment/economics');
    if (res.ok) {
      const data = await res.json();
      setEconomics(data);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/enrichment/settings');
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings || []);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOverview(), loadQueue(), loadReview(), loadBenchmark(), loadProviders(), loadEconomics(), loadSettings()]);
    setLoading(false);
  }, [loadOverview, loadQueue, loadReview, loadBenchmark, loadProviders, loadEconomics, loadSettings]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleStartBulk() {
    setBulkRunning(true);
    try {
      const res = await fetch('/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: bulkScope, batchSize: 50, concurrencyLimit: 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Batch job created — ${data.queued} leads queued`);
        loadQueue();
        loadOverview();
      } else {
        toast.error(data.message || data.error || 'Failed to create batch job');
      }
    } catch {
      toast.error('Failed to start bulk enrichment');
    }
    setBulkRunning(false);
  }

  async function handleBatchAction(batchJobId: string, action: string) {
    setBatchActionLoading(batchJobId + action);
    try {
      const res = await fetch('/api/enrichment/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchJobId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Batch ${action.toLowerCase()}d`);
        loadQueue();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Action failed');
    }
    setBatchActionLoading(null);
  }

  async function handleReviewAction(item: ReviewItem, action: string, reason?: string) {
    setReviewActionLoading(item.id + action);
    try {
      const res = await fetch('/api/enrichment/review-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: item.id,
          matchId: item.match_id,
          leadId: item.lead_id,
          action,
          reason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Contact ${action.toLowerCase()}ed`);
        setReviewItems(prev => prev.filter(r => r.id !== item.id));
        loadOverview();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Action failed');
    }
    setReviewActionLoading(null);
  }

  async function handleStartBenchmark() {
    setBenchmarkRunning(true);
    try {
      const res = await fetch('/api/enrichment/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleSize: benchmarkSampleSize }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Benchmark started — ${data.sampleSize} leads`);
        loadBenchmark();
      } else {
        toast.error(data.message || data.error || 'Failed to start benchmark');
      }
    } catch {
      toast.error('Failed to start benchmark');
    }
    setBenchmarkRunning(false);
  }

  async function handleToggleProvider(providerName: string, enabled: boolean) {
    const res = await fetch('/api/enrichment/provider-health', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerName, enabled }),
    });
    if (res.ok) {
      toast.success(`${providerName} ${enabled ? 'enabled' : 'disabled'}`);
      loadProviders();
    } else {
      toast.error('Failed to update provider');
    }
  }

  async function handleSaveSettings() {
    setSettingsSaving(true);
    const updates = Object.entries(settingsDirty).map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
    if (!updates.length) { setSettingsSaving(false); return; }

    const res = await fetch('/api/enrichment/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (res.ok) {
      toast.success('Settings saved');
      setSettingsDirty({});
      loadSettings();
    } else {
      toast.error('Failed to save settings');
    }
    setSettingsSaving(false);
  }

  function updateSetting(key: string, value: string) {
    setSettingsDirty(prev => ({ ...prev, [key]: value }));
    setSettings(prev => prev.map(s => s.setting_key === key ? { ...s, setting_value: value } : s));
  }

  const getSettingValue = (key: string) => settings.find(s => s.setting_key === key)?.setting_value || '';

  // ─── Render helpers ───────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[status] || 'bg-muted text-muted-foreground'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );

  const ProgressBar = ({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  // ─── Tab: Overview ────────────────────────────────────────────────────────

  const renderOverview = () => {
    const kpis = [
      { label: 'Eligible Properties', value: overviewStats?.eligibleProperties, icon: Database, color: 'text-blue-600', bg: 'bg-blue-500/10' },
      { label: 'Missing Owner', value: overviewStats?.missingOwner, icon: Users, color: 'text-amber-600', bg: 'bg-amber-500/10' },
      { label: 'Missing Phone', value: overviewStats?.missingPhone, icon: Phone, color: 'text-orange-600', bg: 'bg-orange-500/10' },
      { label: 'Fully Verified', value: overviewStats?.fullyVerified, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
      { label: 'Jobs Today', value: overviewStats?.jobsToday, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-500/10' },
      { label: 'Owners Found', value: overviewStats?.ownersFound, icon: Users, color: 'text-teal-600', bg: 'bg-teal-500/10' },
      { label: 'Phones Found', value: overviewStats?.phonesFound, icon: Phone, color: 'text-green-600', bg: 'bg-green-500/10' },
      { label: 'Review Required', value: overviewStats?.reviewRequired, icon: Eye, color: 'text-amber-600', bg: 'bg-amber-500/10' },
      { label: 'Provider Errors', value: overviewStats?.providerErrors, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-500/10' },
      { label: 'Spend This Month', value: overviewStats ? centsToDisplay(overviewStats.spendThisMonthCents) : '—', icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-500/10' },
    ];

    return (
      <div className="space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
                <kpi.icon size={15} className={kpi.color} />
              </div>
              <div className="text-xl font-bold text-foreground">{loading ? '—' : (kpi.value ?? '—')}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Bulk Enrichment Panel */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-primary" />
            <h2 className="font-semibold text-foreground">Bulk Contact Enrichment</h2>
            <span className="ml-auto text-xs text-muted-foreground">Recommended default: High Priority + Verified Address + Missing Phone</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enrichment Scope</label>
              <div className="relative">
                <button
                  onClick={() => setShowScopeMenu(!showScopeMenu)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded-lg bg-background hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {SCOPE_OPTIONS.find(s => s.value === bulkScope)?.label}
                    {SCOPE_OPTIONS.find(s => s.value === bulkScope)?.recommended && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">RECOMMENDED</span>
                    )}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {showScopeMenu && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-20">
                    {SCOPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setBulkScope(opt.value); setShowScopeMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center justify-between ${bulkScope === opt.value ? 'text-primary font-medium' : 'text-foreground'}`}
                      >
                        <span>{opt.label}</span>
                        {opt.recommended && <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">BEST ROI</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col justify-end">
              <div className="text-xs text-muted-foreground mb-2">
                <span className="font-medium text-foreground">Priority order:</span> High Priority → Verified Address → Missing Phone → Score DESC
              </div>
              <div className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={11} />
                Skips: synthetic, DNC, quarantined, terminal, duplicate records
              </div>
            </div>

            <div className="flex flex-col justify-end">
              <button
                onClick={handleStartBulk}
                disabled={bulkRunning}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {bulkRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {bulkRunning ? 'Creating Batch...' : 'Start Bulk Enrichment'}
              </button>
            </div>
          </div>
        </div>

        {/* Compliance Notice */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <Shield size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
            <div><span className="font-semibold">Compliance Guardrails Active:</span> Phone found ≠ SMS consent. DNC/suppression preserved. Manual research data protected. No fake owners/phones generated.</div>
            <div><span className="font-semibold">Auto-Accept:</span> Disabled until benchmark validates accuracy (&lt;1% wrong owner). Run benchmark first.</div>
            <div><span className="font-semibold">Pipeline/Stage/Score:</span> Enrichment never changes lead stage, active pipeline, or prospect score.</div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Tab: Queue ───────────────────────────────────────────────────────────

  const renderQueue = () => (
    <div className="space-y-5">
      {/* Batch Jobs */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Layers size={15} className="text-primary" /> Batch Jobs</h2>
          <button onClick={loadQueue} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>
        </div>

        {batchJobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No batch jobs yet. Start one from the Overview tab.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batchJobs.map(batch => (
              <div key={batch.id} className="border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{batch.batch_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{batch.scope.replace(/_/g, ' ')} · {new Date(batch.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={batch.status} />
                    {batch.status === 'RUNNING' && (
                      <button onClick={() => handleBatchAction(batch.id, 'PAUSE')} disabled={!!batchActionLoading} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-amber-600" title="Pause">
                        {batchActionLoading === batch.id + 'PAUSE' ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
                      </button>
                    )}
                    {batch.status === 'PAUSED' && (
                      <button onClick={() => handleBatchAction(batch.id, 'RESUME')} disabled={!!batchActionLoading} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-emerald-600" title="Resume">
                        {batchActionLoading === batch.id + 'RESUME' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      </button>
                    )}
                    {(batch.status === 'RUNNING' || batch.status === 'PAUSED' || batch.status === 'QUEUED') && (
                      <button onClick={() => handleBatchAction(batch.id, 'CANCEL')} disabled={!!batchActionLoading} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-red-600" title="Cancel">
                        {batchActionLoading === batch.id + 'CANCEL' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                      </button>
                    )}
                    {batch.status === 'FAILED' && (
                      <button onClick={() => handleBatchAction(batch.id, 'RETRY_FAILED')} disabled={!!batchActionLoading} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-blue-600" title="Retry Failed">
                        {batchActionLoading === batch.id + 'RETRY_FAILED' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Processed: {batch.processed.toLocaleString()} / {batch.total_leads.toLocaleString()}</span>
                    <span>{batch.total_leads > 0 ? Math.round((batch.processed / batch.total_leads) * 100) : 0}%</span>
                  </div>
                  <ProgressBar value={batch.processed} max={batch.total_leads} />
                </div>

                <div className="grid grid-cols-4 md:grid-cols-8 gap-2 text-[10px]">
                  {[
                    { label: 'Prop Match', value: batch.property_matches },
                    { label: 'Owners', value: batch.owners_found },
                    { label: 'Phones', value: batch.phones_found },
                    { label: 'Auto Accepted', value: batch.auto_accepted },
                    { label: 'Review', value: batch.review_required },
                    { label: 'No Match', value: batch.no_match },
                    { label: 'Errors', value: batch.errors },
                    { label: 'Cost', value: centsToDisplay(batch.actual_cost_cents) },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <div className="font-semibold text-foreground">{stat.value}</div>
                      <div className="text-muted-foreground">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Queue Items */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><Activity size={15} className="text-primary" /> Recent Queue Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Property', 'Priority', 'Provider', 'Status', 'Started', 'Duration', 'Result', 'Cost'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queueItems.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No queue items</td></tr>
              ) : queueItems.map(item => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 text-foreground font-mono text-[10px] max-w-[120px] truncate">{item.lead_id.slice(0, 8)}…</td>
                  <td className="py-2 px-3 text-foreground">{item.priority}</td>
                  <td className="py-2 px-3 text-foreground">{item.provider}</td>
                  <td className="py-2 px-3"><StatusBadge status={item.status} /></td>
                  <td className="py-2 px-3 text-muted-foreground">{item.started_at ? new Date(item.started_at).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{item.duration_ms ? `${item.duration_ms}ms` : '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{item.result_type?.replace(/_/g, ' ') || item.error_code || '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{centsToDisplay(item.cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── Tab: Review Required ─────────────────────────────────────────────────

  const renderReview = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Contact Enrichment Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Ambiguous or conflicting results requiring human review. Accept, reject, or flag for manual research.</p>
        </div>
        <button onClick={loadReview} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {reviewLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
      ) : reviewItems.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
          <p className="text-sm text-muted-foreground">No items pending review. All enrichment results have been processed.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Property', 'Current Owner', 'Suggested Owner', 'Current Phone', 'Suggested Phone', 'Confidence', 'Reason', 'Actions'].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewItems.map(item => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-3 font-mono text-[10px] text-muted-foreground">{item.lead_id.slice(0, 8)}…</td>
                  <td className="py-3 px-3 text-foreground">{item.current_owner_name || <span className="text-muted-foreground italic">None</span>}</td>
                  <td className="py-3 px-3 text-emerald-600 font-medium">{item.suggested_owner_name || '—'}</td>
                  <td className="py-3 px-3 text-foreground font-mono">{item.current_phone || <span className="text-muted-foreground italic">None</span>}</td>
                  <td className="py-3 px-3 text-emerald-600 font-mono">{item.suggested_phone || '—'}</td>
                  <td className="py-3 px-3">
                    {item.confidence && <StatusBadge status={item.confidence} />}
                    {item.match_score > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">{item.match_score}%</div>}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground max-w-[140px] truncate" title={item.reason || ''}>{item.reason || '—'}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleReviewAction(item, 'ACCEPT')}
                        disabled={!!reviewActionLoading}
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 transition-colors"
                        title="Accept"
                      >
                        {reviewActionLoading === item.id + 'ACCEPT' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      </button>
                      <button
                        onClick={() => handleReviewAction(item, 'REJECT', 'Rejected by reviewer')}
                        disabled={!!reviewActionLoading}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors"
                        title="Reject"
                      >
                        {reviewActionLoading === item.id + 'REJECT' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                      </button>
                      <button
                        onClick={() => handleReviewAction(item, 'MANUAL_RESEARCH', 'Flagged for manual research')}
                        disabled={!!reviewActionLoading}
                        className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-colors"
                        title="Manual Research"
                      >
                        <Search size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ─── Tab: Benchmark ───────────────────────────────────────────────────────

  const renderBenchmark = () => (
    <div className="space-y-5">
      {/* Benchmark Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
        <FlaskConical size={15} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-700 dark:text-blue-400">
          <div className="font-semibold mb-1">Benchmark Mode — Read Only</div>
          <div>Tests PropertyReach against your existing manually verified leads. Does NOT modify canonical data. Run this before enabling auto-accept to measure real false-match rate.</div>
          <div className="mt-1 font-medium">Target: Wrong Owner Auto-Accepted &lt;1% · Wrong Phone Auto-Accepted &lt;1–2%</div>
        </div>
      </div>

      {/* Start Benchmark */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><Target size={15} className="text-primary" /> Run New Benchmark</h2>
        <div className="flex items-end gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sample Size (max 200)</label>
            <input
              type="number"
              value={benchmarkSampleSize}
              onChange={e => setBenchmarkSampleSize(Math.min(200, Math.max(10, parseInt(e.target.value) || 100)))}
              className="w-32 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              min={10} max={200}
            />
          </div>
          <div className="text-xs text-muted-foreground pb-2">
            Uses manually verified leads (verified_owner=true, verified_number=true) as ground truth.
          </div>
          <button
            onClick={handleStartBenchmark}
            disabled={benchmarkRunning}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 ml-auto"
          >
            {benchmarkRunning ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
            {benchmarkRunning ? 'Starting...' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {/* Benchmark Results */}
      {benchmarkRuns.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><BarChart2 size={15} className="text-primary" /> Benchmark Results</h2>
          <div className="space-y-3">
            {benchmarkRuns.map(run => (
              <div
                key={run.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${selectedBenchmarkRun?.id === run.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                onClick={() => setSelectedBenchmarkRun(selectedBenchmarkRun?.id === run.id ? null : run)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{run.run_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString()} · {run.provider}</div>
                  </div>
                  <StatusBadge status={run.status} />
                </div>

                {run.status === 'COMPLETED' && (
                  <div className="grid grid-cols-3 md:grid-cols-7 gap-3 text-xs mt-3">
                    {[
                      { label: 'Sample', value: run.sample_size },
                      { label: 'Owner Exact', value: `${run.owner_exact_match_pct}%`, good: run.owner_exact_match_pct >= 80 },
                      { label: 'Phone Exact', value: `${run.phone_exact_match_pct}%`, good: run.phone_exact_match_pct >= 80 },
                      { label: 'Wrong Owner', value: `${run.wrong_owner_pct}%`, bad: run.wrong_owner_pct > 1 },
                      { label: 'Wrong Phone', value: `${run.wrong_phone_pct}%`, bad: run.wrong_phone_pct > 2 },
                      { label: 'No Match', value: run.no_match_count },
                      { label: 'Avg Cost', value: centsToDisplay(run.avg_cost_per_property_cents) },
                    ].map(stat => (
                      <div key={stat.label} className="text-center">
                        <div className={`font-semibold ${stat.bad ? 'text-red-600' : stat.good ? 'text-emerald-600' : 'text-foreground'}`}>{stat.value}</div>
                        <div className="text-muted-foreground">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedBenchmarkRun?.id === run.id && run.status === 'COMPLETED' && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="font-medium text-foreground mb-1">Confusion Matrix</div>
                        <div className="space-y-0.5 text-muted-foreground">
                          <div>True Match: <span className="text-emerald-600 font-medium">{run.true_match_count}</span></div>
                          <div>False Match: <span className="text-red-600 font-medium">{run.false_match_count}</span></div>
                          <div>No Match: {run.no_match_count}</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="font-medium text-foreground mb-1">Performance</div>
                        <div className="space-y-0.5 text-muted-foreground">
                          <div>Avg Response: {run.avg_response_ms}ms</div>
                          <div>Review Required: {run.review_required_pct}%</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="font-medium text-foreground mb-1">Auto-Accept Readiness</div>
                        <div className="space-y-0.5">
                          {run.wrong_owner_pct <= 1 && run.wrong_phone_pct <= 2 ? (
                            <div className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={11} /> Meets threshold</div>
                          ) : (
                            <div className="text-red-600 font-medium flex items-center gap-1"><AlertCircle size={11} /> Does NOT meet threshold</div>
                          )}
                          <div className="text-muted-foreground text-[10px]">Wrong owner &lt;1%, wrong phone &lt;2%</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="font-medium text-foreground mb-1">Recommendation</div>
                        <div className="text-xs text-muted-foreground">
                          {run.wrong_owner_pct <= 1 && run.wrong_phone_pct <= 2
                            ? 'Enable auto-accept in Settings → Contact Enrichment' :'Keep auto-accept disabled. Review false matches before enabling.'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Tab: Providers ───────────────────────────────────────────────────────

  const renderProviders = () => (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Provider Configuration</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Manage enrichment data providers. Only call configured, licensed providers.</p>
      </div>

      <div className="space-y-3">
        {providers.map(p => (
          <div key={p.provider_name} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{p.provider_name}</span>
                  {p.provider_name === 'PROPERTYREACH' && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">PRIMARY · PRIORITY 1</span>
                  )}
                  <StatusBadge status={p.health_status} />
                  {p.api_configured === false && (
                    <span className="text-[9px] bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">API KEY MISSING</span>
                  )}
                  {p.api_configured === true && (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">API CONFIGURED</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.provider_type} · {p.automation_allowed ? 'Automation allowed' : 'Manual only'}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-muted-foreground">
                  <div>Rate limit: {p.rate_limit_per_day}/day</div>
                  {p.requests_today > 0 && <div>Today: {p.requests_today} req</div>}
                </div>
                {p.automation_allowed && (
                  <button
                    onClick={() => handleToggleProvider(p.provider_name, !p.enabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${p.enabled ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Last Success</div>
                <div className="text-foreground">{p.last_success_at ? new Date(p.last_success_at).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last Failure</div>
                <div className="text-foreground">{p.last_failure_at ? new Date(p.last_failure_at).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg Response</div>
                <div className="text-foreground">{p.avg_response_ms > 0 ? `${p.avg_response_ms}ms` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Success Rate</div>
                <div className="text-foreground">{p.success_rate !== null ? `${p.success_rate}%` : '—'}</div>
              </div>
            </div>

            {p.notes && (
              <div className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                <Info size={11} className="mt-0.5 shrink-0" />
                {p.notes}
              </div>
            )}

            {p.provider_name === 'PROPERTYREACH' && !p.api_configured && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-700 dark:text-red-400">
                <span className="font-semibold">Configuration Error:</span> Set <code className="bg-red-500/10 px-1 rounded">PROPERTYREACH_API_KEY</code> in your environment variables to enable enrichment.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Future providers */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"><Layers size={14} className="text-muted-foreground" /> Future Provider Waterfall</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          {[
            { name: 'PROPERTYREACH', status: 'PRIMARY · ACTIVE', note: 'Confident result? YES → TRAVLR Validation' },
            { name: 'ATTOM / REGRID', status: 'NOT CONFIGURED', note: 'Secondary property/owner provider' },
            { name: 'MELISSA', status: 'NOT CONFIGURED', note: 'Still missing phone?' },
            { name: 'MANUAL REVIEW', status: 'ALWAYS AVAILABLE', note: 'Still ambiguous?' },
          ].map((step, i) => (
            <div key={step.name} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">{i + 1}</div>
              <div className="flex-1">
                <span className="font-medium text-foreground">{step.name}</span>
                <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{step.status}</span>
              </div>
              <div className="text-muted-foreground">{step.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground">Do NOT call unconfigured providers. Architecture is ready for future waterfall expansion.</div>
      </div>
    </div>
  );

  // ─── Tab: Economics ───────────────────────────────────────────────────────

  const renderEconomics = () => {
    if (!economics) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;

    const budgetColor = economics.budgetStatus === 'EXCEEDED' ? 'text-red-600' : economics.budgetStatus === 'WARNING' ? 'text-amber-600' : 'text-emerald-600';
    const budgetBarColor = economics.budgetStatus === 'EXCEEDED' ? 'bg-red-500' : economics.budgetStatus === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500';

    return (
      <div className="space-y-5">
        {/* Monthly Spend */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><DollarSign size={15} className="text-primary" /> Monthly Budget</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-xs text-muted-foreground">Requests This Month</div>
              <div className="text-xl font-bold text-foreground">{economics.requestsThisMonth.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Estimated Spend</div>
              <div className={`text-xl font-bold ${budgetColor}`}>${economics.estimatedSpendDollars}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Monthly Budget</div>
              <div className="text-xl font-bold text-foreground">${economics.monthlyBudgetDollars}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Budget Used</div>
              <div className={`text-xl font-bold ${budgetColor}`}>{economics.budgetUsedPct}%</div>
            </div>
          </div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Budget utilization</span>
            <span className={budgetColor}>{economics.budgetStatus}</span>
          </div>
          <ProgressBar value={economics.budgetUsedPct} max={100} color={budgetBarColor} />
          {economics.budgetStatus === 'WARNING' && (
            <div className="mt-2 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={11} /> Approaching monthly budget limit. Automatic bulk enrichment will pause at 100%.</div>
          )}
          {economics.budgetStatus === 'EXCEEDED' && (
            <div className="mt-2 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> Monthly budget exceeded. Automatic bulk enrichment is paused. Manual Admin requests require explicit confirmation.</div>
          )}
        </div>

        {/* Outcomes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Properties Processed', value: economics.propertiesProcessed },
            { label: 'Owners Found', value: economics.ownersFound },
            { label: 'Phones Found', value: economics.phonesFound },
            { label: 'Emails Found', value: economics.emailsFound },
            { label: 'Fully Verified Created', value: economics.fullyVerifiedNew },
            { label: 'Review Required', value: economics.reviewRequired },
            { label: 'No Match', value: economics.noMatch },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
              <div className="text-xl font-bold text-foreground">{stat.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Cost per Outcome */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><TrendingDown size={15} className="text-primary" /> Cost per Outcome</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Cost / Property Processed', value: centsToDisplay(economics.costPerPropertyCents) },
              { label: 'Cost / Owner Found', value: centsToDisplay(economics.costPerOwnerCents) },
              { label: 'Cost / Verified Phone', value: centsToDisplay(economics.costPerPhoneCents) },
              { label: 'Cost / Newly Fully Verified Lead', value: centsToDisplay(economics.costPerFullyVerifiedCents) },
            ].map(stat => (
              <div key={stat.label} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-lg font-bold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Coverage */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><Database size={15} className="text-primary" /> Enrichment Coverage</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Total Canonical Properties', value: economics.coverage.totalLeads, pct: null },
              { label: 'Owner Verified', value: economics.coverage.ownerVerified, pct: economics.coverage.ownerVerifiedPct },
              { label: 'Address Verified', value: economics.coverage.addressVerified, pct: null },
              { label: 'Phone Verified', value: economics.coverage.phoneVerified, pct: economics.coverage.phoneVerifiedPct },
              { label: 'Fully Verified', value: economics.coverage.fullyVerified, pct: economics.coverage.fullyVerifiedPct },
              { label: 'Missing Owner', value: economics.coverage.missingOwner, pct: null },
              { label: 'Missing Phone', value: economics.coverage.missingPhone, pct: null },
            ].map(stat => (
              <div key={stat.label} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-lg font-bold text-foreground">{stat.value.toLocaleString()}</div>
                {stat.pct !== null && <div className="text-xs text-primary font-medium">{stat.pct}%</div>}
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ─── Tab: Settings ────────────────────────────────────────────────────────

  const renderSettings = () => {
    const settingGroups = [
      {
        title: 'PropertyReach Configuration',
        keys: ['propertyreach_enabled', 'auto_enrichment_enabled'],
      },
      {
        title: 'Auto-Accept (Disabled Until Benchmark Validates)',
        keys: ['auto_accept_enabled', 'auto_accept_threshold', 'review_threshold'],
      },
      {
        title: 'Monthly Budget Guard',
        keys: ['monthly_budget_cents', 'budget_warn_pct'],
      },
      {
        title: 'Batch & Concurrency',
        keys: ['batch_size', 'concurrency_limit', 'retry_limit'],
      },
      {
        title: 'Re-Enrichment & Freshness',
        keys: ['re_enrichment_interval_days', 'enrichment_priority_strategy'],
      },
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Contact Enrichment Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Admin-configurable enrichment parameters. Changes take effect on next job.</p>
          </div>
          {Object.keys(settingsDirty).length > 0 && (
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {settingsSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save Changes
            </button>
          )}
        </div>

        {settingGroups.map(group => (
          <div key={group.title} className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">{group.title}</h3>
            <div className="space-y-4">
              {group.keys.map(key => {
                const setting = settings.find(s => s.setting_key === key);
                if (!setting) return null;
                const value = getSettingValue(key);
                const isDirty = key in settingsDirty;

                return (
                  <div key={key} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground flex items-center gap-2">
                        {setting.label}
                        {isDirty && <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">UNSAVED</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{setting.description}</div>
                    </div>
                    <div className="shrink-0">
                      {setting.setting_type === 'boolean' ? (
                        <button
                          onClick={() => updateSetting(key, value === 'true' ? 'false' : 'true')}
                          className={`relative w-10 h-5 rounded-full transition-colors ${value === 'true' ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      ) : (
                        <input
                          type={setting.setting_type === 'integer' || setting.setting_type === 'decimal' ? 'number' : 'text'}
                          value={value}
                          onChange={e => updateSetting(key, e.target.value)}
                          className="w-32 px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary text-right"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Auto-Accept Warning */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
          <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs text-red-700 dark:text-red-400">
            <div className="font-semibold mb-1">Auto-Accept is disabled by default</div>
            <div>Run the benchmark against your manually verified leads first. Only enable auto-accept after benchmark shows wrong owner rate &lt;1% and wrong phone rate &lt;1–2%. Enabling prematurely risks attaching wrong homeowners to your leads.</div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────

  const tabContent: Record<TabId, React.ReactNode> = {
    overview: renderOverview(),
    queue: renderQueue(),
    review: renderReview(),
    benchmark: renderBenchmark(),
    providers: renderProviders(),
    economics: renderEconomics(),
    settings: renderSettings(),
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Database size={22} className="text-primary" />
              Contact Enrichment
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              DATA &amp; SYNC → PropertyReach enrichment engine — benchmark-first, precision-optimized
            </p>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.id === 'review' && reviewItems.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {reviewItems.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>{tabContent[activeTab]}</div>
      </div>
    </AppLayout>
  );
}
