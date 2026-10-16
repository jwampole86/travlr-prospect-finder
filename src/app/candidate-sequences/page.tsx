'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Copy, Mail, PlayCircle, RefreshCw, Search, Settings2, Sparkles, UserRound } from 'lucide-react';
import { toast } from 'sonner';
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
  inputClass,
} from '@/components/ops';
import CandidateCohortTable, { type CandidateSequenceRow } from './components/CandidateCohortTable';
import TemplatePreviewPanel, { type SequencePreview } from './components/TemplatePreviewPanel';

type CohortKey = 'interview_invite' | 'follow_up' | 'second_interview' | 'rejection' | 'congratulations';

type QueryError = { code?: string; message: string } | null;

interface CandidateRow {
  id: string;
  full_name: string;
  email: string | null;
  candidate_status: string | null;
  pipeline_status: string | null;
  created_at: string;
  updated_at: string;
}

interface InterviewSessionRow {
  id: string;
  candidate_id: string | null;
  candidate_name: string;
  role_title: string | null;
  scheduled_at: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

interface WorkflowRow {
  id: string;
  name: string;
  is_active: boolean | null;
  updated_at: string | null;
}

const PAGE_SIZE = 500;

const COHORT_CONFIG: Record<CohortKey, { label: string; description: string; statuses: string[]; icon: React.ElementType; tone: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  interview_invite: {
    label: 'Interview invites',
    description: 'Candidates who are ready for their first conversation.',
    statuses: ['READY_TO_INTERVIEW', 'INTERVIEW_SCHEDULED'],
    icon: PlayCircle,
    tone: 'primary',
  },
  follow_up: {
    label: 'Post-interview follow-up',
    description: 'Candidates that should hear back after an interview round.',
    statuses: ['INTERVIEWED', 'FOLLOW_UP', 'MOVE_FORWARD'],
    icon: Mail,
    tone: 'warning',
  },
  second_interview: {
    label: 'Second interviews',
    description: 'Candidates moving into deeper evaluation.',
    statuses: ['SECOND_INTERVIEW'],
    icon: Sparkles,
    tone: 'primary',
  },
  rejection: {
    label: 'Not moving forward',
    description: 'Respectful close-out notes for declined candidates.',
    statuses: ['NOT_MOVING_FORWARD'],
    icon: AlertTriangle,
    tone: 'danger',
  },
  congratulations: {
    label: 'Hired candidates',
    description: 'Welcome and onboarding-style follow-ups.',
    statuses: ['HIRED'],
    icon: CheckCircle2,
    tone: 'success',
  },
};

function stageOf(candidate: CandidateRow) {
  return candidate.pipeline_status || candidate.candidate_status || 'UNKNOWN';
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function firstName(fullName: string) {
  return fullName.split(' ')[0] || fullName;
}

function buildPreview(cohort: CohortKey, candidate: CandidateSequenceRow | null): SequencePreview {
  const name = firstName(candidate?.full_name ?? 'Candidate');
  const role = candidate?.roleTitle ?? 'the role';

  switch (cohort) {
    case 'interview_invite':
      return {
        label: COHORT_CONFIG[cohort].label,
        description: COHORT_CONFIG[cohort].description,
        note: 'This is a local preview only. The page never calls a send API while candidate enrollment storage is unavailable.',
        subject: `Interview invitation for ${role}`,
        body: `Hi ${name},\n\nThanks for your interest in TRAVLR. We'd love to schedule an interview to learn more about your background and talk through ${role}.\n\nReply with a few windows that work for you this week and we will coordinate the next step.\n\nBest,\nTRAVLR recruiting`,
      };
    case 'follow_up':
      return {
        label: COHORT_CONFIG[cohort].label,
        description: COHORT_CONFIG[cohort].description,
        note: 'Use after a completed interview when you need to keep the candidate warm without promising a decision.',
        subject: `Update on your ${role} interview`,
        body: `Hi ${name},\n\nThank you again for taking time to speak with us about ${role}. Our team is reviewing feedback now and we wanted to let you know you're still in process.\n\nWe'll share the next update as soon as we have it. Please reach out if any new timing constraints come up on your side.\n\nBest,\nTRAVLR recruiting`,
      };
    case 'second_interview':
      return {
        label: COHORT_CONFIG[cohort].label,
        description: COHORT_CONFIG[cohort].description,
        note: 'Best for candidates explicitly tagged for the second round or move-forward stages.',
        subject: `Next-round interview for ${role}`,
        body: `Hi ${name},\n\nWe'd like to invite you to the next interview round for ${role}. The conversation will focus on how you approach the role in practice and give you time to meet more of the team.\n\nSend over your availability for the next few days and we'll lock something in.\n\nBest,\nTRAVLR recruiting`,
      };
    case 'rejection':
      return {
        label: COHORT_CONFIG[cohort].label,
        description: COHORT_CONFIG[cohort].description,
        note: 'This page only previews copy and never sends. Review the message before using it elsewhere.',
        subject: `Update on your application for ${role}`,
        body: `Hi ${name},\n\nThank you for spending time with our team. After reviewing the process, we have decided not to move forward for ${role}.\n\nWe appreciate your interest in TRAVLR and wish you the best in your search.\n\nBest,\nTRAVLR recruiting`,
      };
    case 'congratulations':
      return {
        label: COHORT_CONFIG[cohort].label,
        description: COHORT_CONFIG[cohort].description,
        note: 'Ideal once onboarding tasks are confirmed elsewhere in the hiring stack.',
        subject: `Welcome to TRAVLR, ${name}`,
        body: `Hi ${name},\n\nCongratulations and welcome to TRAVLR. We're excited to have you joining us for ${role}.\n\nWe'll follow up shortly with onboarding details, first-day logistics, and anything you need before you start.\n\nBest,\nTRAVLR recruiting`,
      };
  }
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

export default function CandidateSequencesPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyWithEmail, setOnlyWithEmail] = useState(false);
  const [cohort, setCohort] = useState<CohortKey>('interview_invite');
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [sessions, setSessions] = useState<InterviewSessionRow[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateProfilesCount, setCandidateProfilesCount] = useState(0);
  const [candidateSequenceStorageReady, setCandidateSequenceStorageReady] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSetupMessage(null);

    const [candidateResult, sessionResult, workflowResult, candidateProfilesResult, candidateSequenceStorageResult] = await Promise.all([
      paginateQuery<CandidateRow>((from, to) =>
        supabase
          .from('candidates')
          .select('id,full_name,email,candidate_status,pipeline_status,created_at,updated_at')
          .order('created_at', { ascending: false })
          .range(from, to)
      ),
      paginateQuery<InterviewSessionRow>((from, to) =>
        supabase
          .from('interview_sessions')
          .select('id,candidate_id,candidate_name,role_title,scheduled_at,status')
          .order('scheduled_at', { ascending: false })
          .range(from, to)
      ),
      paginateQuery<WorkflowRow>((from, to) =>
        supabase
          .from('follow_up_sequences')
          .select('id,name,is_active,updated_at')
          .order('updated_at', { ascending: false })
          .range(from, to)
      ),
      supabase.from('candidate_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('candidate_sequence_enrollments').select('id', { count: 'exact', head: true }),
    ]);

    if (candidateResult.error || sessionResult.error || workflowResult.error || candidateProfilesResult.error) {
      const firstError = candidateResult.error || sessionResult.error || workflowResult.error || candidateProfilesResult.error;
      setError(firstError?.message ?? 'Unable to load candidate sequence data.');
      setLoading(false);
      return;
    }

    if (candidateSequenceStorageResult.error) {
      const missingCandidateSequenceTable = candidateSequenceStorageResult.error.code === '42P01'
        || candidateSequenceStorageResult.error.code === 'PGRST205'
        || candidateSequenceStorageResult.error.message.includes('candidate_sequence_enrollments');
      if (missingCandidateSequenceTable) {
        setSetupMessage('Candidate enrollment storage is not provisioned yet. The missing table is candidate_sequence_enrollments, so enroll and pause actions stay disabled on purpose.');
        setCandidateSequenceStorageReady(false);
      } else {
        setSetupMessage(candidateSequenceStorageResult.error.message);
      }
    } else {
      setCandidateSequenceStorageReady(true);
    }

    setCandidates(candidateResult.data);
    setSessions(sessionResult.data);
    setWorkflows(workflowResult.data);
    setCandidateProfilesCount(candidateProfilesResult.count ?? 0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const latestSessionByCandidate = useMemo(() => {
    const byId = new Map<string, InterviewSessionRow>();
    const byName = new Map<string, InterviewSessionRow>();

    for (const session of sessions) {
      if (session.candidate_id && !byId.has(session.candidate_id)) byId.set(session.candidate_id, session);
      const normalized = normalizeName(session.candidate_name);
      if (!byName.has(normalized)) byName.set(normalized, session);
    }

    return { byId, byName };
  }, [sessions]);

  const rows = useMemo<CandidateSequenceRow[]>(() => {
    return candidates.map((candidate) => {
      const session = latestSessionByCandidate.byId.get(candidate.id)
        ?? latestSessionByCandidate.byName.get(normalizeName(candidate.full_name));
      return {
        id: candidate.id,
        full_name: candidate.full_name,
        email: candidate.email,
        stage: stageOf(candidate),
        roleTitle: session?.role_title ?? null,
        sessionAt: session?.scheduled_at ?? null,
      };
    });
  }, [candidates, latestSessionByCandidate]);

  const countsByCohort = useMemo(() => {
    return Object.fromEntries(
      (Object.keys(COHORT_CONFIG) as CohortKey[]).map((key) => [key, rows.filter((row) => COHORT_CONFIG[key].statuses.includes(row.stage)).length])
    ) as Record<CohortKey, number>;
  }, [rows]);

  useEffect(() => {
    const ordered = (Object.keys(COHORT_CONFIG) as CohortKey[]).find((key) => countsByCohort[key] > 0);
    if (ordered && countsByCohort[cohort] === 0) setCohort(ordered);
  }, [cohort, countsByCohort]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!COHORT_CONFIG[cohort].statuses.includes(row.stage)) return false;
      if (onlyWithEmail && !row.email) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return row.full_name.toLowerCase().includes(needle)
        || row.stage.toLowerCase().includes(needle)
        || (row.roleTitle ?? '').toLowerCase().includes(needle)
        || (row.email ?? '').toLowerCase().includes(needle);
    });
  }, [cohort, onlyWithEmail, rows, search]);

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedCandidateId(null);
      return;
    }
    if (!selectedCandidateId || !filteredRows.some((row) => row.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredRows[0].id);
    }
  }, [filteredRows, selectedCandidateId]);

  const selectedCandidate = filteredRows.find((row) => row.id === selectedCandidateId) ?? null;
  const preview = buildPreview(cohort, selectedCandidate);

  const copyDraft = useCallback(async (row: CandidateSequenceRow | null) => {
    if (!row) return;
    const draft = buildPreview(cohort, row);
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      toast.success(`Copied draft for ${row.full_name}`);
    } catch {
      toast.error('Unable to copy the draft right now.');
    }
  }, [cohort]);

  const stats = useMemo<Stat[]>(() => ([
    {
      label: 'Candidate records',
      value: rows.length,
      hint: `${candidateProfilesCount} candidate_profiles row${candidateProfilesCount === 1 ? '' : 's'} live` ,
      icon: UserRound,
      tone: 'default',
    },
    {
      label: 'Reachable by email',
      value: rows.filter((row) => Boolean(row.email)).length,
      hint: 'Live candidates with an email address on file',
      icon: Mail,
      tone: 'primary',
    },
    {
      label: 'Saved workflows',
      value: workflows.length,
      hint: workflows.filter((workflow) => workflow.is_active).length + ' active in follow_up_sequences',
      icon: Settings2,
      tone: workflows.length > 0 ? 'success' : 'warning',
    },
    {
      label: 'Selected cohort',
      value: filteredRows.length,
      hint: COHORT_CONFIG[cohort].label,
      icon: COHORT_CONFIG[cohort].icon,
      tone: COHORT_CONFIG[cohort].tone,
    },
  ]), [candidateProfilesCount, cohort, filteredRows.length, rows.length, workflows]);

  const workflowSummary = useMemo(() => {
    if (workflows.length === 0) return 'No live follow_up_sequences are configured yet.';
    const active = workflows.filter((workflow) => workflow.is_active).length;
    return `${active} of ${workflows.length} follow_up_sequences are active in the live database.`;
  }, [workflows]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={Mail}
          title="Candidate Sequences"
          description="Audit-ready candidate communication cohorts with preview-only messaging and honest automation status."
          actions={(
            <>
              <Link href="/follow-up-sequences" className={buttonSecondary}>Template builder</Link>
              <Link href="/hiring-analytics" className={buttonSecondary}>Hiring analytics</Link>
              <button onClick={() => void fetchData()} className={buttonPrimary}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </>
          )}
        />

        {error && <ErrorBanner message={error} onRetry={() => void fetchData()} />}
        {setupMessage && <ErrorBanner message={setupMessage} />}

        {loading ? (
          <LoadingState label="Loading candidate cohorts…" />
        ) : (
          <>
            <StatGrid stats={stats} columns={4} />

            <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
              <div className="space-y-6">
                <Panel title="Candidate cohorts" icon={Sparkles}>
                  <div className="space-y-4">
                    <SegmentedTabs
                      tabs={(Object.keys(COHORT_CONFIG) as CohortKey[]).map((key) => ({
                        key,
                        label: COHORT_CONFIG[key].label,
                        icon: COHORT_CONFIG[key].icon,
                        badge: countsByCohort[key] || undefined,
                      }))}
                      value={cohort}
                      onChange={setCohort}
                    />

                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <label className="relative block flex-1">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search by name, stage, role, or email"
                          className={`${inputClass} pl-9`}
                        />
                      </label>
                      <button className={buttonSecondary} onClick={() => setOnlyWithEmail((value) => !value)}>
                        {onlyWithEmail ? 'Showing email-ready only' : 'Filter to email-ready'}
                      </button>
                    </div>

                    <CandidateCohortTable
                      rows={filteredRows}
                      selectedId={selectedCandidateId}
                      onSelect={setSelectedCandidateId}
                      onCopy={(row) => void copyDraft(row)}
                    />
                  </div>
                </Panel>

                <Panel title="Live schema findings" icon={Settings2}>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="primary">candidates: {rows.length}</StatusPill>
                      <StatusPill tone={candidateProfilesCount > 0 ? 'success' : 'warning'}>candidate_profiles: {candidateProfilesCount}</StatusPill>
                      <StatusPill tone={workflows.length > 0 ? 'success' : 'warning'}>follow_up_sequences: {workflows.length}</StatusPill>
                    </div>
                    <p>{workflowSummary}</p>
                    <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
                      {candidateSequenceStorageReady
                        ? 'candidate_sequence_enrollments is available, so persisted enroll / pause state can be backed by the live database.'
                        : 'candidate_sequence_enrollments is missing from the live database, so the page does not expose fake enroll or pause controls.'}
                    </div>
                  </div>
                </Panel>
              </div>

              <TemplatePreviewPanel
                candidate={selectedCandidate}
                preview={preview}
                workflowCount={workflows.length}
                automationReady={candidateSequenceStorageReady}
                onCopy={() => void copyDraft(selectedCandidate)}
              />
            </div>

            {!rows.length && !error && (
              <EmptyState
                icon={UserRound}
                title="No candidates available"
                hint="Add candidate records first. This page reads from the live candidates and interview_sessions tables instead of fabricating demo rows."
              />
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
