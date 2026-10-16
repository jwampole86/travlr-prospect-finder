'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BarChart3, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3, LineChart, RefreshCw, Target, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  type Stat,
  buttonPrimary,
  buttonSecondary,
} from '@/components/ops';
import DistributionBars, { type DistributionDatum } from './components/DistributionBars';
import RoleBreakdownTable, { type RoleMetricRow } from './components/RoleBreakdownTable';

type AnalyticsTab = 'overview' | 'quality' | 'roles';
type PeriodKey = '30' | '90' | '180' | 'all';
type QueryError = { code?: string; message: string } | null;

interface CandidateRow {
  id: string;
  full_name: string;
  candidate_status: string | null;
  pipeline_status: string | null;
  created_at: string;
  updated_at: string;
  first_interview_at: string | null;
  latest_interview_at: string | null;
  interview_count: number | null;
  latest_scorecard_average: number | null;
}

interface InterviewSessionRow {
  id: string;
  candidate_id: string | null;
  candidate_name: string;
  role_title: string | null;
  scheduled_at: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

interface ScorecardRow {
  id: string;
  candidate_id: string;
  hire_recommendation: string | null;
  created_at: string;
}

interface PipelineAuditRow {
  id: string;
  candidate_id: string;
  new_status: string;
  changed_at: string;
}

const PAGE_SIZE = 500;
const MOVING_FORWARD_STAGES = new Set(['FOLLOW_UP', 'MOVE_FORWARD', 'SECOND_INTERVIEW', 'HIRED']);
const MONTH_LABELS = 6;

function stageOf(candidate: CandidateRow) {
  return candidate.pipeline_status || candidate.candidate_status || 'UNKNOWN';
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function daysBetween(from: string, to: string) {
  return (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
}

async function paginateQuery<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: QueryError }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) return { data: [] as T[], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

function makeMonthBuckets() {
  const buckets: { key: string; label: string }[] = [];
  for (let index = MONTH_LABELS - 1; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  return buckets;
}

export default function HiringAnalyticsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState<PeriodKey>('90');
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [sessions, setSessions] = useState<InterviewSessionRow[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardRow[]>([]);
  const [pipelineAudit, setPipelineAudit] = useState<PipelineAuditRow[]>([]);
  const [counts, setCounts] = useState({ candidates: 0, sessions: 0, scorecards: 0, candidateProfiles: 0, pipelineAudit: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cutoff = period === 'all' ? null : new Date(Date.now() - Number(period) * 86400000).toISOString();
    const withCutoff = <T,>(query: T, column: string) => (cutoff ? (query as any).gte(column, cutoff) : query);

    const [candidateRows, sessionRows, scorecardRows, pipelineAuditRows, candidateCount, sessionCount, scorecardCount, profileCount, auditCount] = await Promise.all([
      paginateQuery<CandidateRow>((from, to) => {
        let query = supabase
          .from('candidates')
          .select('id,full_name,candidate_status,pipeline_status,created_at,updated_at,first_interview_at,latest_interview_at,interview_count,latest_scorecard_average')
          .order('created_at', { ascending: false })
          .range(from, to);
        query = withCutoff(query, 'created_at');
        return query;
      }),
      paginateQuery<InterviewSessionRow>((from, to) => {
        let query = supabase
          .from('interview_sessions')
          .select('id,candidate_id,candidate_name,role_title,scheduled_at,status')
          .order('scheduled_at', { ascending: false })
          .range(from, to);
        query = withCutoff(query, 'scheduled_at');
        return query;
      }),
      paginateQuery<ScorecardRow>((from, to) => {
        let query = supabase
          .from('candidate_scorecards')
          .select('id,candidate_id,hire_recommendation,created_at')
          .order('created_at', { ascending: false })
          .range(from, to);
        query = withCutoff(query, 'created_at');
        return query;
      }),
      paginateQuery<PipelineAuditRow>((from, to) => {
        let query = supabase
          .from('candidate_pipeline_audit')
          .select('id,candidate_id,new_status,changed_at')
          .order('changed_at', { ascending: false })
          .range(from, to);
        query = withCutoff(query, 'changed_at');
        return query;
      }),
      withCutoff(supabase.from('candidates').select('id', { count: 'exact', head: true }), 'created_at'),
      withCutoff(supabase.from('interview_sessions').select('id', { count: 'exact', head: true }), 'scheduled_at'),
      withCutoff(supabase.from('candidate_scorecards').select('id', { count: 'exact', head: true }), 'created_at'),
      withCutoff(supabase.from('candidate_profiles').select('id', { count: 'exact', head: true }), 'created_at'),
      withCutoff(supabase.from('candidate_pipeline_audit').select('id', { count: 'exact', head: true }), 'changed_at'),
    ]);

    const fatalError = candidateRows.error || sessionRows.error || scorecardRows.error || pipelineAuditRows.error || candidateCount.error || sessionCount.error || scorecardCount.error || profileCount.error || auditCount.error;
    if (fatalError) {
      setError(fatalError.message ?? 'Unable to load hiring analytics.');
      setLoading(false);
      return;
    }

    setCandidates(candidateRows.data);
    setSessions(sessionRows.data);
    setScorecards(scorecardRows.data);
    setPipelineAudit(pipelineAuditRows.data);
    setCounts({
      candidates: candidateCount.count ?? 0,
      sessions: sessionCount.count ?? 0,
      scorecards: scorecardCount.count ?? 0,
      candidateProfiles: profileCount.count ?? 0,
      pipelineAudit: auditCount.count ?? 0,
    });
    setLoading(false);
  }, [period, supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const candidateById = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const candidateIdByName = useMemo(() => new Map(candidates.map((candidate) => [normalizeName(candidate.full_name), candidate.id])), [candidates]);

  const candidateKeyForSession = useCallback((session: InterviewSessionRow) => {
    return session.candidate_id ?? candidateIdByName.get(normalizeName(session.candidate_name)) ?? `name:${normalizeName(session.candidate_name)}`;
  }, [candidateIdByName]);

  const scheduledCandidateKeys = useMemo(
    () => new Set(sessions.filter((session) => session.status !== 'cancelled').map(candidateKeyForSession)),
    [candidateKeyForSession, sessions]
  );
  const completedCandidateKeys = useMemo(() => new Set(sessions.filter((session) => session.status === 'completed').map(candidateKeyForSession)), [candidateKeyForSession, sessions]);

  const interviewedCandidateCount = useMemo(() => {
    const fromCandidates = candidates.filter((candidate) => candidate.first_interview_at || (candidate.interview_count ?? 0) > 0).map((candidate) => candidate.id);
    const ids = new Set([...fromCandidates, ...completedCandidateKeys]);
    return ids.size;
  }, [candidates, completedCandidateKeys]);

  const movingForwardCount = useMemo(() => candidates.filter((candidate) => MOVING_FORWARD_STAGES.has(stageOf(candidate))).length, [candidates]);
  const hiredCandidates = useMemo(() => candidates.filter((candidate) => stageOf(candidate) === 'HIRED'), [candidates]);

  const daysToFirstInterview = useMemo(() => {
    return candidates
      .filter((candidate) => candidate.first_interview_at)
      .map((candidate) => daysBetween(candidate.created_at, candidate.first_interview_at as string))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }, [candidates]);

  const timeToHireDays = useMemo(() => {
    return pipelineAudit
      .filter((entry) => entry.new_status === 'HIRED')
      .map((entry) => {
        const candidate = candidateById.get(entry.candidate_id);
        return candidate ? daysBetween(candidate.created_at, entry.changed_at) : null;
      })
      .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  }, [candidateById, pipelineAudit]);

  const scorecardCoverage = useMemo(() => {
    if (interviewedCandidateCount === 0) return null;
    const distinct = new Set(scorecards.map((scorecard) => scorecard.candidate_id));
    return distinct.size / interviewedCandidateCount;
  }, [interviewedCandidateCount, scorecards]);

  const funnelRows = useMemo<DistributionDatum[]>(() => ([
    { label: 'Candidate records', value: counts.candidates, tone: 'default', hint: 'Rows in candidates for the selected period' },
    { label: 'Interview scheduled', value: scheduledCandidateKeys.size, tone: 'primary', hint: 'Distinct candidates with an interview session' },
    { label: 'Interview completed', value: interviewedCandidateCount, tone: 'warning', hint: 'Completed sessions or candidates with interview activity' },
    { label: 'Moving forward', value: movingForwardCount, tone: 'success', hint: 'FOLLOW_UP, MOVE_FORWARD, SECOND_INTERVIEW, or HIRED' },
    { label: 'Hired', value: hiredCandidates.length, tone: 'success', hint: 'Candidates currently marked HIRED' },
  ]), [counts.candidates, hiredCandidates.length, interviewedCandidateCount, movingForwardCount, scheduledCandidateKeys.size]);

  const stageDistribution = useMemo<DistributionDatum[]>(() => {
    const grouped = new Map<string, number>();
    for (const candidate of candidates) {
      const stage = stageOf(candidate);
      grouped.set(stage, (grouped.get(stage) ?? 0) + 1);
    }
    return [...grouped.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label: label.replaceAll('_', ' '),
        value,
        tone: label === 'HIRED' ? 'success' : label === 'READY_TO_INTERVIEW' ? 'primary' : label === 'NOT_MOVING_FORWARD' ? 'danger' : 'warning',
      }));
  }, [candidates]);

  const recommendationDistribution = useMemo<DistributionDatum[]>(() => {
    const grouped = new Map<string, number>();
    for (const scorecard of scorecards) {
      const key = scorecard.hire_recommendation ?? 'PENDING';
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    return [...grouped.entries()].map(([label, value]) => ({
      label: label.replaceAll('_', ' '),
      value,
      tone: label === 'STRONG_YES' || label === 'YES' ? 'success' : label === 'NO' ? 'danger' : 'warning',
    }));
  }, [scorecards]);

  const monthlyActivity = useMemo(() => {
    const buckets = makeMonthBuckets().map((bucket) => ({ ...bucket, candidates: 0, completed: 0 }));
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const candidate of candidates) {
      const key = candidate.created_at.slice(0, 7);
      const bucket = byKey.get(key);
      if (bucket) bucket.candidates += 1;
    }

    for (const session of sessions) {
      if (session.status !== 'completed' || !session.scheduled_at) continue;
      const key = session.scheduled_at.slice(0, 7);
      const bucket = byKey.get(key);
      if (bucket) bucket.completed += 1;
    }

    return buckets;
  }, [candidates, sessions]);

  const maxMonthly = useMemo(() => Math.max(1, ...monthlyActivity.map((bucket) => Math.max(bucket.candidates, bucket.completed))), [monthlyActivity]);

  const roleRows = useMemo<RoleMetricRow[]>(() => {
    const grouped = new Map<string, RoleMetricRow & { candidateKeys: Set<string>; hiredKeys: Set<string>; scoreByCandidate: Map<string, number> }>();

    for (const session of sessions) {
      const key = session.role_title ?? 'Unspecified role';
      const current = grouped.get(key) ?? {
        roleTitle: key,
        candidates: 0,
        scheduled: 0,
        completed: 0,
        hired: 0,
        averageScore: null,
        lastInterviewAt: null,
        candidateKeys: new Set<string>(),
        hiredKeys: new Set<string>(),
        scoreByCandidate: new Map<string, number>(),
      };

      if (session.status === 'completed') current.completed += 1;
      if (session.status === 'scheduled' || session.status === 'in_progress') current.scheduled += 1;
      if (!current.lastInterviewAt || (session.scheduled_at && session.scheduled_at > current.lastInterviewAt)) {
        current.lastInterviewAt = session.scheduled_at;
      }

      const candidateId = candidateKeyForSession(session);
      const candidateKey = String(candidateId);
      current.candidateKeys.add(candidateKey);
      const candidate = candidateKey.startsWith('name:') ? null : candidateById.get(candidateKey);
      if (candidate && candidate.latest_scorecard_average != null) current.scoreByCandidate.set(candidateKey, candidate.latest_scorecard_average);
      if (candidate && stageOf(candidate) === 'HIRED') current.hiredKeys.add(candidateKey);
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .map(({ candidateKeys, hiredKeys, scoreByCandidate, ...row }) => ({
        ...row,
        candidates: candidateKeys.size,
        hired: hiredKeys.size,
        averageScore: scoreByCandidate.size
          ? [...scoreByCandidate.values()].reduce((sum, value) => sum + value, 0) / scoreByCandidate.size
          : null,
      }))
      .sort((a, b) => b.candidates - a.candidates || a.roleTitle.localeCompare(b.roleTitle));
  }, [candidateById, candidateKeyForSession, sessions]);

  const upcomingSessions = useMemo(() => {
    return sessions
      .filter((session) => session.status === 'scheduled' || session.status === 'in_progress')
      .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
      .slice(0, 6);
  }, [sessions]);

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (counts.candidateProfiles === 0) {
      list.push('candidate_profiles has no rows, so this page reads from candidates and interview_sessions instead of showing empty metrics.');
    }
    if (completedCandidateKeys.size > 0 && counts.scorecards < completedCandidateKeys.size) {
      list.push(`Only ${counts.scorecards} scorecard row${counts.scorecards === 1 ? '' : 's'} exist for ${completedCandidateKeys.size} completed interview candidate${completedCandidateKeys.size === 1 ? '' : 's'}.`);
    }
    if (hiredCandidates.length > 0 && counts.pipelineAudit === 0) {
      list.push('No HIRED stage transitions are recorded in candidate_pipeline_audit yet, so exact time-to-hire cannot be calculated reliably.');
    }
    return list;
  }, [completedCandidateKeys.size, counts.candidateProfiles, counts.pipelineAudit, counts.scorecards, hiredCandidates.length]);

  const stats = useMemo<Stat[]>(() => ([
    {
      label: 'Candidates',
      value: counts.candidates,
      hint: `${counts.sessions} interview sessions in period`,
      icon: Users,
      tone: 'default',
    },
    {
      label: 'Scheduled interviews',
      value: scheduledCandidateKeys.size,
      hint: 'Distinct candidates with a session',
      icon: CalendarClock,
      tone: 'primary',
    },
    {
      label: 'Completed interviews',
      value: interviewedCandidateCount,
      hint: counts.scorecards + ' scorecard row' + (counts.scorecards === 1 ? '' : 's'),
      icon: CheckCircle2,
      tone: interviewedCandidateCount > 0 ? 'success' : 'default',
    },
    {
      label: 'Median days to first interview',
      value: median(daysToFirstInterview) == null ? '—' : `${Math.round(median(daysToFirstInterview) as number)}d`,
      hint: daysToFirstInterview.length > 0 ? 'From candidate created_at to first_interview_at' : 'No first_interview_at timestamps in range',
      icon: Clock3,
      tone: daysToFirstInterview.length > 0 ? 'warning' : 'default',
    },
    {
      label: 'Hired',
      value: hiredCandidates.length,
      hint: timeToHireDays.length > 0 ? `Median time-to-hire ${Math.round(median(timeToHireDays) as number)}d` : 'Time-to-hire awaits pipeline audit data',
      icon: Target,
      tone: hiredCandidates.length > 0 ? 'success' : 'default',
    },
  ]), [counts.candidates, counts.scorecards, counts.sessions, daysToFirstInterview, hiredCandidates.length, interviewedCandidateCount, scheduledCandidateKeys.size, timeToHireDays]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={BarChart3}
          title="Hiring Analytics"
          description="Real funnel and timing metrics derived from the live candidates, interview_sessions, scorecards, and pipeline audit tables."
          actions={(
            <>
              <div className="rounded-2xl border border-border bg-card p-1">
                {(['30', '90', '180', 'all'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium ${period === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {value === 'all' ? 'All time' : `${value}d`}
                  </button>
                ))}
              </div>
              <Link href="/candidate-sequences" className={buttonSecondary}>Candidate sequences</Link>
              <button onClick={() => void fetchData()} className={buttonPrimary}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </>
          )}
        />

        {error && <ErrorBanner message={error} onRetry={() => void fetchData()} />}

        {loading ? (
          <LoadingState label="Loading hiring metrics…" />
        ) : (
          <>
            <StatGrid stats={stats} columns={5} />

            {warnings.length > 0 && (
              <Panel title="Data quality flags" icon={AlertTriangle}>
                <div className="space-y-2">
                  {warnings.map((warning) => (
                    <div key={warning} className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                      {warning}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <SegmentedTabs
              tabs={[
                { key: 'overview', label: 'Overview', icon: LineChart },
                { key: 'quality', label: 'Quality', icon: AlertTriangle, badge: warnings.length || undefined },
                { key: 'roles', label: 'Roles', icon: BriefcaseBusiness },
              ]}
              value={tab}
              onChange={(value) => setTab(value as AnalyticsTab)}
            />

            {tab === 'overview' && (
              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-6">
                  <Panel title="Hiring funnel" icon={Target}>
                    <DistributionBars
                      rows={funnelRows}
                      emptyTitle="No funnel data"
                      emptyHint="Candidate intake and interview activity will appear here once records exist in the selected period."
                    />
                  </Panel>

                  <Panel title="Candidate intake vs completed interviews" icon={LineChart}>
                    <div className="space-y-4">
                      {monthlyActivity.map((bucket) => (
                        <div key={bucket.key} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 text-sm">
                          <div className="font-medium text-foreground">{bucket.label}</div>
                          <div className="space-y-2">
                            <div>
                              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Candidate intake</span><span className="tabular-nums">{bucket.candidates}</span></div>
                              <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary/80" style={{ width: `${(bucket.candidates / maxMonthly) * 100}%` }} /></div>
                            </div>
                            <div>
                              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Completed interviews</span><span className="tabular-nums">{bucket.completed}</span></div>
                              <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-success/80" style={{ width: `${(bucket.completed / maxMonthly) * 100}%` }} /></div>
                            </div>
                          </div>
                          <StatusPill tone={bucket.completed > 0 ? 'success' : 'default'}>{bucket.completed}</StatusPill>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>

                <div className="space-y-6">
                  <Panel title="Upcoming interviews" icon={CalendarClock}>
                    {upcomingSessions.length === 0 ? (
                      <EmptyState
                        icon={CalendarClock}
                        title="No upcoming interviews"
                        hint="Scheduled or in-progress interviews will appear here."
                      />
                    ) : (
                      <div className="space-y-3">
                        {upcomingSessions.map((session) => (
                          <div key={session.id} className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-foreground">{session.candidate_name}</div>
                                <div className="text-xs text-muted-foreground">{session.role_title ?? 'Role not captured yet'}</div>
                              </div>
                              <StatusPill tone={session.status === 'in_progress' ? 'warning' : 'primary'}>{session.status.replaceAll('_', ' ')}</StatusPill>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {session.scheduled_at ? new Date(session.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Schedule missing'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title="Time-to-hire" icon={Clock3}>
                    {timeToHireDays.length > 0 ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Median</div>
                          <div className="text-2xl font-bold tabular-nums text-foreground">{Math.round(median(timeToHireDays) as number)}d</div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Computed from candidates.created_at to candidate_pipeline_audit.changed_at for rows that reached HIRED.
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        icon={Clock3}
                        title="Exact time-to-hire is not available yet"
                        hint="This requires HIRED transitions in candidate_pipeline_audit. The live database currently has hired candidates but no recorded HIRED transition history in the selected period."
                      />
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {tab === 'quality' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Pipeline stage distribution" icon={Users}>
                  <DistributionBars
                    rows={stageDistribution}
                    emptyTitle="No pipeline stages"
                    emptyHint="Candidate stage counts will appear once candidates exist in the selected period."
                  />
                </Panel>

                <Panel title="Hire recommendation coverage" icon={CheckCircle2}>
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                    <StatusPill tone={scorecardCoverage && scorecardCoverage >= 0.8 ? 'success' : 'warning'}>
                      {scorecardCoverage == null ? 'No completed interviews yet' : `${Math.round(scorecardCoverage * 100)}% coverage`}
                    </StatusPill>
                    <span className="text-muted-foreground">Completed interview candidates with at least one scorecard</span>
                  </div>
                  <DistributionBars
                    rows={recommendationDistribution}
                    emptyTitle="No scorecards in range"
                    emptyHint="Recommendation breakdown appears when candidate_scorecards are saved."
                  />
                </Panel>
              </div>
            )}

            {tab === 'roles' && (
              <Panel title="Role breakdown" icon={BriefcaseBusiness}>
                <RoleBreakdownTable rows={roleRows} />
              </Panel>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
