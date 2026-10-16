'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Database, Radar, RefreshCcw, Scale, Sparkles } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonSecondary,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import {
  calculateProspectScore,
  DEFAULT_PROSPECT_SCORING_WEIGHTS,
  leadRowToScoringInput,
  SCORING_LEAD_COLUMNS,
  SCORE_MODEL_VERSION,
} from '@/lib/scoring/prospectScoring';
import { loadScoreSignals } from '@/lib/services/leadScoreSignals';
import WeightEditor from './components/WeightEditor';
import SimulationOverview from './components/SimulationOverview';
import RetrainingSignalsPanel from './components/RetrainingSignalsPanel';
import LeadPreviewTable from './components/LeadPreviewTable';
import type {
  LeadSimulationSample,
  RegionalSignalRow,
  ScoreSimulatorSummary,
  SimulatorTab,
} from './components/types';

const SAMPLE_LIMIT = 60;

export default function ScoreSimulatorPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<SimulatorTab>('weights');
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signalWarning, setSignalWarning] = useState<string | null>(null);
  const [samples, setSamples] = useState<LeadSimulationSample[]>([]);
  const [regionalSignals, setRegionalSignals] = useState<RegionalSignalRow[]>([]);
  const [summary, setSummary] = useState<ScoreSimulatorSummary>({
    totalActiveLeads: 0,
    currentModelLeads: 0,
    feedbackCount: 0,
    signalCount: 0,
  });
  const [weights, setWeights] = useState(DEFAULT_PROSPECT_SCORING_WEIGHTS);

  useEffect(() => {
    let live = true;

    async function load() {
      setLoading(true);
      setError(null);
      setSignalWarning(null);

      const activeCountQuery = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .neq('stage', 'Not a Fit')
        .neq('stage', 'Live')
        .neq('stage', 'closed_dead')
        .neq('stage', 'Lost');

      const currentModelCountQuery = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('score_model_version', SCORE_MODEL_VERSION);

      const feedbackCountQuery = supabase
        .from('outcome_feedback')
        .select('id', { count: 'exact', head: true });

      const signalCountQuery = supabase
        .from('score_weight_signals')
        .select('id', { count: 'exact', head: true });

      const sampleQuery = supabase
        .from('leads')
        .select(`id,address,city,state,created_at,prospect_score,score_model_version,${SCORING_LEAD_COLUMNS}`)
        .neq('stage', 'Not a Fit')
        .neq('stage', 'Live')
        .neq('stage', 'closed_dead')
        .neq('stage', 'Lost')
        .order('created_at', { ascending: false })
        .limit(SAMPLE_LIMIT);

      const retrainingQuery = supabase
        .from('score_weight_signals')
        .select('region,property_type,conversion_rate,avg_converted_score,avg_lost_score,suggested_threshold,sample_count,last_updated')
        .order('last_updated', { ascending: false })
        .limit(8);

      const [
        activeCountResult,
        currentModelCountResult,
        feedbackCountResult,
        signalCountResult,
        sampleResult,
        retrainingResult,
      ] = await Promise.all([
        activeCountQuery,
        currentModelCountQuery,
        feedbackCountQuery,
        signalCountQuery,
        sampleQuery,
        retrainingQuery,
      ]);

      const firstError = [
        activeCountResult.error,
        currentModelCountResult.error,
        feedbackCountResult.error,
        signalCountResult.error,
        sampleResult.error,
        retrainingResult.error,
      ].find(Boolean);

      if (firstError) {
        if (!live) return;
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const rows = sampleResult.data ?? [];
      let signalMap: Awaited<ReturnType<typeof loadScoreSignals>> | undefined;
      if (rows.length > 0) {
        try {
          signalMap = await loadScoreSignals(supabase as never, rows.map((row) => String(row.id)));
        } catch (signalError) {
          setSignalWarning(signalError instanceof Error ? signalError.message : 'Could not load live engagement signals; using row data only.');
        }
      }

      const nextSamples = rows.map((row) => {
        const input = leadRowToScoringInput(row as Record<string, unknown>, signalMap?.get(String(row.id)) ?? null);
        return {
          id: String(row.id),
          address: typeof row.address === 'string' ? row.address : '',
          city: typeof row.city === 'string' ? row.city : null,
          state: typeof row.state === 'string' ? row.state : null,
          stage: typeof row.stage === 'string' ? row.stage : null,
          createdAt: typeof row.created_at === 'string' ? row.created_at : null,
          storedScore: Number(row.prospect_score || 0),
          scoreModelVersion: typeof row.score_model_version === 'string' ? row.score_model_version : null,
          input,
          baseline: calculateProspectScore(input),
        } satisfies LeadSimulationSample;
      });

      if (!live) return;
      setSamples(nextSamples);
      setRegionalSignals((retrainingResult.data ?? []) as RegionalSignalRow[]);
      setSummary({
        totalActiveLeads: activeCountResult.count ?? 0,
        currentModelLeads: currentModelCountResult.count ?? 0,
        feedbackCount: feedbackCountResult.count ?? 0,
        signalCount: signalCountResult.count ?? 0,
      });
      setLoading(false);
    }

    load().catch((loadError) => {
      if (!live) return;
      setError(loadError instanceof Error ? loadError.message : 'Failed to load score simulator data.');
      setLoading(false);
    });

    return () => {
      live = false;
    };
  }, [refreshToken, supabase]);

  const simulatedRows = useMemo(() => {
    return samples.map((sample) => {
      const simulated = calculateProspectScore(sample.input, weights);
      const topFactor = simulated.factors.slice().sort((a, b) => b.weightedPoints - a.weightedPoints)[0];
      return {
        ...sample,
        simulated,
        delta: simulated.score - sample.baseline.score,
        storedDelta: sample.baseline.score - sample.storedScore,
        primaryFactor: topFactor?.label ?? 'No factor data',
      };
    });
  }, [samples, weights]);

  const metrics = useMemo(() => {
    const count = simulatedRows.length || 1;
    const averageBaseline = Math.round(simulatedRows.reduce((sum, row) => sum + row.baseline.score, 0) / count);
    const averageSimulated = Math.round(simulatedRows.reduce((sum, row) => sum + row.simulated.score, 0) / count);
    const changed = simulatedRows.filter((row) => row.delta !== 0).length;
    const improved = simulatedRows.filter((row) => row.delta > 0).length;
    const staleStored = simulatedRows.filter((row) => row.storedDelta !== 0 || row.scoreModelVersion !== SCORE_MODEL_VERSION).length;
    return { averageBaseline, averageSimulated, changed, improved, staleStored };
  }, [simulatedRows]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-5 sm:px-6">
        <PageHeader
          icon={Radar}
          title="Score Simulator"
          description="Preview weight changes against the live v4-live-signals prospect model. This page recalculates a read-only sample of real leads and never writes scores back to production."
          actions={
            <button type="button" onClick={() => setRefreshToken((value) => value + 1)} className={buttonSecondary}>
              <RefreshCcw size={14} /> Refresh sample
            </button>
          }
        />

        <StatGrid
          stats={[
            {
              label: 'Active leads in DB',
              value: summary.totalActiveLeads.toLocaleString(),
              hint: `${samples.length} most-recent leads previewed here`,
              icon: Database,
              tone: 'default',
            },
            {
              label: 'Current v4 model rows',
              value: summary.currentModelLeads.toLocaleString(),
              hint: `Stored with ${SCORE_MODEL_VERSION}`,
              icon: Scale,
              tone: 'success',
            },
            {
              label: 'Avg baseline → simulated',
              value: `${metrics.averageBaseline} → ${metrics.averageSimulated}`,
              hint: `${metrics.changed} of ${samples.length} sample leads move`,
              icon: Sparkles,
              tone: metrics.averageSimulated >= metrics.averageBaseline ? 'primary' : 'warning',
            },
            {
              label: 'Retraining evidence',
              value: `${summary.signalCount.toLocaleString()} signals / ${summary.feedbackCount.toLocaleString()} outcomes`,
              hint: 'Regional retraining rows vs. raw deal feedback rows',
              icon: BarChart3,
              tone: summary.signalCount > 0 ? 'primary' : 'warning',
            },
          ]}
        />

        {error && <ErrorBanner message={error} onRetry={() => setRefreshToken((value) => value + 1)} />}
        {signalWarning && <ErrorBanner message={`Signal load warning: ${signalWarning}`} />}

        <Panel padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <SegmentedTabs
              tabs={[
                { key: 'weights', label: 'Weights', icon: Scale },
                { key: 'signals', label: 'Retraining signals', icon: BarChart3, badge: summary.signalCount || undefined },
                { key: 'preview', label: 'Lead preview', icon: Sparkles },
              ]}
              value={tab}
              onChange={setTab}
            />
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <StatusPill tone="primary">Scenario only</StatusPill>
              <StatusPill tone={metrics.staleStored > 0 ? 'warning' : 'success'}>
                {metrics.staleStored} stored scores differ from live baseline
              </StatusPill>
              <StatusPill tone={metrics.improved > 0 ? 'success' : 'default'}>
                {metrics.improved} leads improve in this scenario
              </StatusPill>
            </div>
          </div>
        </Panel>

        {loading ? (
          <LoadingState label="Loading live scoring sample…" />
        ) : samples.length === 0 ? (
          <Panel>
            <div className="py-6">
              <ErrorBanner message="The live database returned no leads for score simulation." />
            </div>
          </Panel>
        ) : (
          <>
            {tab === 'weights' && (
              <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                <WeightEditor
                  weights={weights}
                  defaults={DEFAULT_PROSPECT_SCORING_WEIGHTS}
                  onChange={setWeights}
                  onReset={() => setWeights(DEFAULT_PROSPECT_SCORING_WEIGHTS)}
                />
                <div className="space-y-4">
                  <SimulationOverview rows={simulatedRows} />
                  <Panel title="What this simulates" icon={AlertTriangle}>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        This page now reuses <strong className="text-foreground">calculateProspectScore()</strong>, <strong className="text-foreground">leadRowToScoringInput()</strong>, and the shared <strong className="text-foreground">{SCORE_MODEL_VERSION}</strong> weights from the production scoring library instead of hardcoded DOM / market-average math.
                      </p>
                      <p>
                        The live database currently has <strong className="text-foreground">{summary.signalCount}</strong> retraining rows in <code className="rounded bg-muted px-1 py-0.5 text-[11px]">score_weight_signals</code>, so there are no server-side weight overrides to apply on top of the shared defaults.
                      </p>
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {tab === 'signals' && <RetrainingSignalsPanel rows={regionalSignals} />}
            {tab === 'preview' && <LeadPreviewTable rows={simulatedRows} />}
          </>
        )}
      </div>
    </AppLayout>
  );
}
