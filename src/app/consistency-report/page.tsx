'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, FileText, Lightbulb, Loader2, MessageSquareText, RefreshCw, Sparkles, Target, Users } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
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
import { CandidateRail } from './components/CandidateRail';
import { ClaimPanel } from './components/ClaimPanel';
import { ReadinessPanel } from './components/ReadinessPanel';
import type { CandidateListItem, ConsistencyReportResponse } from './types';

type DetailTab = 'overview' | 'claims' | 'follow-up';

function humanize(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : '—';
}

function formatWhen(value?: string | null) {
  if (!value) return 'Not yet';
  return new Date(value).toLocaleString();
}

function setupGuidance(message?: string) {
  const text = message?.toLowerCase() || '';
  if (!text.includes('relation') && !text.includes('column')) return null;
  return [
    '20260908210000_candidates_resume_interview_upgrade.sql',
    '20260909000000_interview_phase2_pipeline_consistency_qa.sql',
  ];
}

function ConsistencyReportContent() {
  const searchParams = useSearchParams();
  const candidateIdParam = searchParams.get('candidateId') || '';

  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState(candidateIdParam);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<DetailTab>('overview');
  const [data, setData] = useState<ConsistencyReportResponse | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    setError(null);
    try {
      const res = await fetch('/api/candidates');
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.details?.message || payload?.error || 'Failed to load candidates');
      }

      const list = (payload.candidates || []) as CandidateListItem[];
      setCandidates(list);
      if (!selectedCandidateId && list.length > 0) {
        setSelectedCandidateId(candidateIdParam || list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setLoadingCandidates(false);
    }
  }, [candidateIdParam, selectedCandidateId]);

  const loadDetail = useCallback(async (candidateId: string) => {
    if (!candidateId) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/consistency-report?candidateId=${encodeURIComponent(candidateId)}`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.details?.message || payload?.error || 'Failed to load report context');
      }
      setData(payload as ConsistencyReportResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load report context');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!selectedCandidateId) return;
    void loadDetail(selectedCandidateId);
  }, [loadDetail, selectedCandidateId]);

  const generateReport = useCallback(async () => {
    if (!selectedCandidateId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/candidates/consistency-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: selectedCandidateId }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.details?.message || payload?.error || 'Failed to generate report');
      }
      setData((current) => current ? { ...current, report: payload.report ?? current.report } : payload);
      await loadDetail(selectedCandidateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }, [loadDetail, selectedCandidateId]);

  const report = data?.report;
  const candidate = data?.candidate;
  const readiness = data?.readiness;
  const setupMigrations = useMemo(() => setupGuidance(error || undefined), [error]);

  const stats = report ? [
    { label: 'Validated claims', value: report.validated_claims?.length || 0, icon: Sparkles, tone: 'success' as const },
    { label: 'Partial claims', value: report.partially_validated_claims?.length || 0, icon: BookOpen, tone: 'warning' as const },
    { label: 'Needs follow-up', value: report.needs_clarification?.length || 0, icon: AlertTriangle, tone: 'danger' as const },
    { label: 'Generated', value: report.generated_at ? new Date(report.generated_at).toLocaleDateString() : '—', icon: FileText, tone: 'primary' as const },
  ] : [];

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={FileText}
          title="Resume vs. Interview"
          description="Real candidate resume evidence, saved interview notes, and scorecards feed the analysis. Any generated report comes from the server API route — never hardcoded client data."
          actions={(
            <>
              <Link href="/candidate-tracker" className={buttonSecondary}><Users size={16} />Candidate tracker</Link>
              <Link href="/interview-mode-qa" className={buttonSecondary}><Sparkles size={16} />Interview QA</Link>
            </>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => selectedCandidateId ? void loadDetail(selectedCandidateId) : void loadCandidates()} /> : null}

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Panel title="Candidates" icon={Users} padded={false}>
            <div className="p-4">
              <CandidateRail
                candidates={candidates}
                loading={loadingCandidates}
                selectedId={selectedCandidateId}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedCandidateId}
              />
            </div>
          </Panel>

          <div className="space-y-6">
            {loadingDetail && !data ? <LoadingState label="Loading candidate report context…" /> : null}

            {!selectedCandidateId && !loadingCandidates ? (
              <EmptyState icon={Users} title="No candidate selected" hint="Choose a candidate to inspect real interview evidence and any saved consistency report." />
            ) : null}

            {candidate && readiness && data ? (
              <>
                <Panel
                  title="Candidate summary"
                  icon={Users}
                  actions={(
                    <button
                      onClick={() => void loadDetail(candidate.id)}
                      className={buttonSecondary}
                      disabled={loadingDetail || generating}
                    >
                      <RefreshCw size={16} className={loadingDetail ? 'animate-spin' : ''} />Refresh
                    </button>
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {candidate.candidate_rank ? <StatusPill tone="primary">Rank #{candidate.candidate_rank}</StatusPill> : null}
                        <StatusPill tone="default">{humanize(candidate.interview_priority)}</StatusPill>
                        <StatusPill tone="default">{humanize(candidate.pipeline_status)}</StatusPill>
                        {typeof candidate.latest_scorecard_average === 'number' ? <StatusPill tone="success">Score {candidate.latest_scorecard_average.toFixed(1)}</StatusPill> : null}
                      </div>
                      <h2 className="mt-3 text-2xl font-semibold text-foreground">{candidate.full_name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{candidate.current_title || candidate.current_company || 'No current title saved'}</p>
                      <p className="mt-3 text-xs text-muted-foreground">Latest interview: {formatWhen(candidate.latest_interview_at)}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <button
                        onClick={() => void generateReport()}
                        disabled={generating || loadingDetail || !readiness.readyForAnalysis || !data.meta.apiKeyConfigured}
                        className={buttonPrimary}
                      >
                        {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {report ? 'Regenerate report' : 'Generate report'}
                      </button>
                      <p className="text-xs text-muted-foreground">Model {data.meta.model} · prompt {data.meta.promptVersion}</p>
                    </div>
                  </div>
                </Panel>

                <ReadinessPanel candidate={candidate} readiness={readiness} meta={data.meta} />

                {report && report.generation_status === 'COMPLETED' ? (
                  <>
                    <StatGrid stats={stats} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SegmentedTabs
                        value={tab}
                        onChange={setTab}
                        tabs={[
                          { key: 'overview', label: 'Overview' },
                          { key: 'claims', label: 'Claims' },
                          { key: 'follow-up', label: 'Follow-up' },
                        ]}
                      />
                      <StatusPill tone="default">Generated {formatWhen(report.generated_at)}</StatusPill>
                    </div>

                    {tab === 'overview' ? (
                      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                        <Panel title="Executive summary" icon={BookOpen}>
                          <p className="text-sm leading-7 text-muted-foreground">{report.executive_summary || 'No summary saved.'}</p>
                        </Panel>
                        <div className="space-y-6">
                          <Panel title="Strongest evidence" icon={Sparkles}>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {(report.strongest_interview_evidence || []).map((item) => <li key={item}>• {item}</li>)}
                              {(report.strongest_interview_evidence || []).length === 0 ? <li>No interview evidence highlighted yet.</li> : null}
                            </ul>
                          </Panel>
                          <Panel title="Role gaps" icon={Target}>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {(report.role_gaps || []).map((item) => <li key={item}>• {item}</li>)}
                              {(report.role_gaps || []).length === 0 ? <li>No role-specific gaps captured.</li> : null}
                            </ul>
                          </Panel>
                          <Panel title="New information" icon={Lightbulb}>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {(report.new_information || []).map((item) => <li key={item}>• {item}</li>)}
                              {(report.new_information || []).length === 0 ? <li>No new interview-only facts captured.</li> : null}
                            </ul>
                          </Panel>
                        </div>
                      </div>
                    ) : null}

                    {tab === 'claims' ? (
                      <div className="grid gap-6 xl:grid-cols-2">
                        <ClaimPanel title="Validated claims" claims={report.validated_claims || []} emptyHint="No validated claims were saved." />
                        <ClaimPanel title="Partially validated claims" claims={report.partially_validated_claims || []} emptyHint="No partial validations were saved." />
                        <ClaimPanel title="Not yet validated" claims={report.not_yet_validated || []} emptyHint="No untested claims were saved." />
                        <ClaimPanel title="Needs clarification" claims={report.needs_clarification || []} emptyHint="No clarification items were saved." />
                      </div>
                    ) : null}

                    {tab === 'follow-up' ? (
                      <div className="grid gap-6 xl:grid-cols-2">
                        <Panel title="Unanswered questions" icon={MessageSquareText}>
                          <ol className="space-y-3 text-sm text-muted-foreground">
                            {(report.unanswered_questions || []).map((item, index) => <li key={item}>{index + 1}. {item}</li>)}
                            {(report.unanswered_questions || []).length === 0 ? <li>No unanswered questions saved.</li> : null}
                          </ol>
                        </Panel>
                        <Panel title="Second interview questions" icon={ArrowRight}>
                          <ol className="space-y-3 text-sm text-muted-foreground">
                            {(report.second_interview_questions || []).map((item, index) => <li key={item}>{index + 1}. {item}</li>)}
                            {(report.second_interview_questions || []).length === 0 ? <li>No follow-up questions saved.</li> : null}
                          </ol>
                        </Panel>
                        <Panel title="Suggested next-step topics" icon={Target} className="xl:col-span-2">
                          <div className="space-y-3">
                            {(report.next_step_topics || []).map((item, index) => (
                              <div key={`${item.topic}-${index}`} className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusPill tone={item.priority === 'HIGH' ? 'danger' : item.priority === 'MEDIUM' ? 'warning' : 'default'}>{item.priority}</StatusPill>
                                  <p className="text-sm font-semibold text-foreground">{item.topic}</p>
                                </div>
                                {item.reason ? <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p> : null}
                              </div>
                            ))}
                            {(report.next_step_topics || []).length === 0 ? <p className="text-sm text-muted-foreground">No next-step topics saved.</p> : null}
                          </div>
                        </Panel>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    icon={FileText}
                    title={report?.generation_status === 'FAILED' ? 'Last report failed' : 'No consistency report yet'}
                    hint={report?.generation_status === 'FAILED'
                      ? report.generation_error || 'The last attempt failed before a report was saved.'
                      : readiness.readyForAnalysis
                        ? 'This candidate has enough real resume and interview evidence to generate a report when you are ready.'
                        : 'This candidate still needs real interview evidence before the report route should be used.'}
                    action={readiness.readyForAnalysis && data.meta.apiKeyConfigured ? (
                      <button onClick={() => void generateReport()} className={buttonPrimary} disabled={generating}>
                        {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate report
                      </button>
                    ) : undefined}
                  />
                )}
              </>
            ) : null}

            {setupMigrations ? (
              <Panel title="Schema setup required" icon={AlertTriangle}>
                <p className="text-sm text-muted-foreground">This page needs the hiring candidate tables or columns that power the consistency workflow.</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {setupMigrations.map((migration) => <li key={migration}>• {migration}</li>)}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function ConsistencyReportPage() {
  return (
    <Suspense fallback={<AppLayout><LoadingState label="Loading consistency report…" /></AppLayout>}>
      <ConsistencyReportContent />
    </Suspense>
  );
}
