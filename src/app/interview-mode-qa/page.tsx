'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, FileText, Info, Play, RefreshCw, Search, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
} from '@/components/ops';
import { ConfigAuditPanel } from './components/ConfigAuditPanel';
import { QaResultPanel } from './components/QaResultPanel';
import type { QAResponse, QAResult } from './types';

type FilterValue = 'ALL' | 'PASS' | 'WARN' | 'FAIL';

function setupGuidance(message?: string) {
  const text = message?.toLowerCase() || '';
  if (!text.includes('relation') && !text.includes('column')) return null;
  return [
    '20260908210000_candidates_resume_interview_upgrade.sql',
    '20260909000000_interview_phase2_pipeline_consistency_qa.sql',
  ];
}

export default function InterviewModeQAPage() {
  const [data, setData] = useState<QAResponse | null>(null);
  const [filter, setFilter] = useState<FilterValue>('ALL');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/candidates/batch-qa');
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details?.message || payload?.error || 'Failed to load interview QA');
      setData(payload as QAResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interview QA');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/candidates/batch-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details?.message || payload?.error || 'Failed to run QA audit');
      setData(payload as QAResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run QA audit');
    } finally {
      setRunning(false);
    }
  }, []);

  const configuration = data?.configuration;
  const summary = data?.summary;
  const filteredResults = useMemo(() => {
    const results = data?.results || [];
    return filter === 'ALL' ? results : results.filter((item) => item.qaStatus === filter);
  }, [data?.results, filter]);
  const setupMigrations = useMemo(() => setupGuidance(error || undefined), [error]);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={Zap}
          title="Anthropic Interview QA"
          description="Audits saved interview scripts for personalization quality without spending Anthropic credits during QA. The page verifies server model, env handling, and browser-secret safety before any human runs the route."
          actions={(
            <>
              <Link href="/candidate-tracker" className={buttonSecondary}><Users size={16} />Candidate tracker</Link>
              <Link href="/consistency-report" className={buttonSecondary}><FileText size={16} />Consistency report</Link>
            </>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void loadData()} /> : null}

        {loading && !data ? <LoadingState label="Loading saved QA audits…" /> : null}

        {configuration ? <ConfigAuditPanel configuration={configuration} /> : null}

        {configuration ? (
          <StatGrid
            columns={4}
            stats={[
              { label: 'Candidates in pipeline', value: configuration.totalCandidatesCount, icon: Users, tone: 'default' },
              { label: 'Saved interview scripts', value: configuration.scriptedCandidatesCount, icon: Sparkles, tone: configuration.scriptedCandidatesCount > 0 ? 'success' : 'warning' },
              { label: 'Audited candidates', value: configuration.latestAuditedCandidatesCount, icon: ShieldCheck, tone: configuration.latestAuditedCandidatesCount > 0 ? 'primary' : 'default' },
              { label: 'QA mode', value: configuration.qaRunsPaidCalls ? 'Paid' : 'Offline', icon: Eye, tone: configuration.qaRunsPaidCalls ? 'warning' : 'success' },
            ]}
          />
        ) : null}

        <Panel
          title="Saved script audit"
          icon={ShieldCheck}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void loadData()} className={buttonSecondary} disabled={loading || running}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
              </button>
              <button
                onClick={() => void runAudit()}
                className={buttonPrimary}
                disabled={running || !configuration || configuration.scriptedCandidatesCount === 0}
              >
                <Play size={16} />{running ? 'Running audit…' : 'Run offline QA audit'}
              </button>
            </div>
          )}
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              This audit reads only <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">candidates.interview_script</code> and saved QA rows.
              It does <span className="font-semibold text-foreground">not</span> call Anthropic while verifying or re-reading results.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={configuration?.apiKeyConfigured ? 'success' : 'warning'}>{configuration?.anthropicEnvVar || 'ANTHROPIC_API_KEY'} {configuration?.apiKeyConfigured ? 'configured' : 'missing'}</StatusPill>
              <StatusPill tone={configuration?.browserKeyExposed ? 'danger' : 'success'}>{configuration?.browserKeyExposed ? 'Public key exposed' : 'No browser key exposure'}</StatusPill>
              <StatusPill tone="primary">Model {configuration?.scriptModel || '—'}</StatusPill>
            </div>
          </div>
        </Panel>

        {summary ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs
                value={filter}
                onChange={setFilter}
                tabs={[
                  { key: 'ALL', label: 'All', badge: data?.results.length || 0 },
                  { key: 'PASS', label: 'Pass', badge: summary.pass },
                  { key: 'WARN', label: 'Warn', badge: summary.warn },
                  { key: 'FAIL', label: 'Fail', badge: summary.fail },
                ]}
              />
              <StatusPill tone="default">Last run {new Date(summary.runAt).toLocaleString()}</StatusPill>
            </div>

            <StatGrid
              columns={5}
              stats={[
                { label: 'Candidates audited', value: summary.totalCandidates, icon: Users, tone: 'default' },
                { label: 'Pass', value: summary.pass, icon: ShieldCheck, tone: 'success' },
                { label: 'Warn', value: summary.warn, icon: Info, tone: 'warning' },
                { label: 'Fail', value: summary.fail, icon: Search, tone: 'danger' },
                { label: 'Avg personalization', value: `${summary.averagePersonalizationPct}%`, icon: Sparkles, tone: 'primary' },
              ]}
            />

            <div className="space-y-4">
              {filteredResults.map((result: QAResult) => <QaResultPanel key={result.candidateId} result={result} />)}
              {filteredResults.length === 0 ? <EmptyState icon={Search} title="No results for this filter" hint="Try another QA status segment." /> : null}
            </div>
          </>
        ) : null}

        {!loading && configuration && configuration.scriptedCandidatesCount === 0 ? (
          <EmptyState
            icon={Zap}
            title="No saved interview scripts yet"
            hint="The QA route is configured, the server-only AI key is safe, and the audit itself is offline — but there is nothing to inspect until candidates.interview_script is populated."
          />
        ) : null}

        {!loading && configuration && configuration.scriptedCandidatesCount > 0 && (data?.results.length || 0) === 0 && !summary ? (
          <EmptyState
            icon={ShieldCheck}
            title="No QA runs saved yet"
            hint="Saved scripts exist, but no offline QA audit has been written to candidate_qa_results yet."
          />
        ) : null}

        {setupMigrations ? (
          <Panel title="Schema setup required" icon={Info}>
            <p className="text-sm text-muted-foreground">This page depends on candidate script and QA result tables that are not available in the current database.</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {setupMigrations.map((migration) => <li key={migration}>• {migration}</li>)}
            </ul>
          </Panel>
        ) : null}
      </div>
    </AppLayout>
  );
}
