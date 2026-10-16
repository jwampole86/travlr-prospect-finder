'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Brain, Lightbulb, RefreshCw, Shield, Users, Waypoints } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { ErrorBanner, LoadingState, PageHeader, Panel, SegmentedTabs, StatGrid, StatusPill, buttonPrimary } from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import CohortCards from './components/CohortCards';
import RecommendationList from './components/RecommendationList';
import WarningsTable from './components/WarningsTable';
import { loadCadenceInsightData, type CadenceInsightData } from './lib';

type TabKey = 'recommendations' | 'cohorts' | 'warnings' | 'evidence';

export default function CadenceAIInsightsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>('recommendations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CadenceInsightData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadCadenceInsightData(supabase);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cadence insights.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    if (!data) return [];
    const coveragePct = data.evidence.stepCount > 0
      ? Math.round((data.evidence.templateCoverageCount / data.evidence.stepCount) * 100)
      : 0;

    return [
      { label: 'Health score', value: `${data.healthScore}/100`, hint: 'Derived from live cadence activity and queue coverage', icon: Brain, tone: data.healthScore >= 70 ? 'success' as const : data.healthScore >= 40 ? 'warning' as const : 'danger' as const },
      { label: 'Configured cadence', value: `${data.evidence.activeSequenceCount}/${data.evidence.sequenceCount}`, hint: `${data.evidence.stepCount} live steps · ${coveragePct}% template coverage`, icon: Waypoints, tone: 'primary' as const },
      { label: 'Activation evidence', value: `${data.evidence.enrollmentCount}/${data.evidence.sendCount}`, hint: 'Enrollments / send-log rows', icon: Activity, tone: data.evidence.enrollmentCount > 0 && data.evidence.sendCount > 0 ? 'success' as const : 'warning' as const },
      { label: 'Human queue', value: data.evidence.humanOutreachCount.toLocaleString(), hint: `${data.evidence.unassignedHumanOutreachCount} unassigned escalations`, icon: AlertTriangle, tone: data.evidence.humanOutreachCount > 0 ? 'warning' as const : 'default' as const },
      { label: 'Phone-ready leads', value: data.evidence.phoneReadyCount.toLocaleString(), hint: `${data.evidence.smsOptInCount} SMS opt-ins`, icon: Users, tone: data.evidence.smsOptInCount > 0 ? 'success' as const : 'warning' as const },
      { label: 'Follow-up coverage', value: data.evidence.scheduledTouchCount.toLocaleString(), hint: `${data.evidence.contactedWithoutNextTouchCount} contacted with no next touch`, icon: Shield, tone: data.evidence.scheduledTouchCount > 0 ? 'success' as const : 'warning' as const },
    ];
  }, [data]);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={Brain}
          title="Cadence AI Insights"
          description="Evidence-backed insights derived from live cadence tables and queue data — no paid model calls required."
          actions={(
            <button type="button" onClick={() => void loadData()} disabled={loading} className={buttonPrimary}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh insights
            </button>
          )}
        />

        {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}
        {loading && <LoadingState label="Building insights from live cadence data…" />}

        {!loading && data && (
          <>
            <Panel padded className="bg-gradient-to-br from-primary/10 via-card to-card">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusPill tone="primary">Deterministic analysis</StatusPill>
                    <StatusPill tone="default">Live DB only</StatusPill>
                    <StatusPill tone="warning">No paid AI requests</StatusPill>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">Current health score: {data.healthScore}/100</h2>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{data.summary}</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/80 px-5 py-4 text-center shadow-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Warnings</div>
                  <div className="mt-1 text-4xl font-bold tabular-nums text-foreground">{data.warnings.length}</div>
                  <div className="text-xs text-muted-foreground">live queue risks</div>
                </div>
              </div>
            </Panel>

            <StatGrid stats={stats} columns={3} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs
                tabs={[
                  { key: 'recommendations', label: 'Recommendations', icon: Lightbulb, badge: data.recommendations.filter((item) => item.priority === 'high').length || undefined },
                  { key: 'cohorts', label: 'Cohorts', icon: Users },
                  { key: 'warnings', label: 'Warnings', icon: AlertTriangle, badge: data.warnings.filter((warning) => warning.risk === 'critical').length || undefined },
                  { key: 'evidence', label: 'Evidence', icon: Activity },
                ]}
                value={tab}
                onChange={setTab}
              />
              <div className="text-xs text-muted-foreground">Updated {new Date(data.generatedAt).toLocaleString()}</div>
            </div>

            {tab === 'recommendations' && (
              <Panel title="Priority actions" icon={Lightbulb}>
                <RecommendationList items={data.recommendations} />
              </Panel>
            )}

            {tab === 'cohorts' && (
              <Panel title="Live cohorts" icon={Users}>
                <CohortCards items={data.cohorts} />
              </Panel>
            )}

            {tab === 'warnings' && (
              <Panel title="Early warning queue" icon={AlertTriangle}>
                <WarningsTable items={data.warnings} />
              </Panel>
            )}

            {tab === 'evidence' && (
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Raw evidence used in scoring" icon={Activity}>
                  <div className="space-y-3 text-sm">
                    <EvidenceRow label="Cadence sequences" value={data.evidence.sequenceCount} />
                    <EvidenceRow label="Active sequences" value={data.evidence.activeSequenceCount} />
                    <EvidenceRow label="Configured steps" value={data.evidence.stepCount} />
                    <EvidenceRow label="Template-covered steps" value={data.evidence.templateCoverageCount} />
                    <EvidenceRow label="Cadence enrollments" value={data.evidence.enrollmentCount} />
                    <EvidenceRow label="Cadence sends" value={data.evidence.sendCount} />
                    <EvidenceRow label="New leads" value={data.evidence.newLeadCount} />
                    <EvidenceRow label="Scheduled touches" value={data.evidence.scheduledTouchCount} />
                    <EvidenceRow label="Contacted without next touch" value={data.evidence.contactedWithoutNextTouchCount} warning />
                  </div>
                </Panel>

                <Panel title="Interpretation notes" icon={Shield}>
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <p>This page does not call Anthropic or any paid AI provider. Every recommendation, cohort, and warning is generated locally from the live cadence tables and lead queue fields.</p>
                    <p>When cadence_enrollments and cadence_send_log are empty, the page deliberately avoids inventing winners, engagement rates, or content advice. Instead, it highlights setup and workflow gaps that can be proven from the current database state.</p>
                    <p>Once live send history exists, the same view will automatically start surfacing richer evidence without changing the page contract.</p>
                  </div>
                </Panel>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function EvidenceRow({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-3 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${warning && value > 0 ? 'text-warning' : 'text-foreground'}`}>{value.toLocaleString()}</span>
    </div>
  );
}
