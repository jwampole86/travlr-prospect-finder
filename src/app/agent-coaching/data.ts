import type { SupabaseClient } from '@supabase/supabase-js';

export type DateRange = '30d' | '90d';

export interface CoachingSession {
  sessionId: string;
  agentId: string | null;
  agentName: string;
  startedAt: string;
  durationSeconds: number | null;
  outcome: string | null;
  recordingUrl: string | null;
  qaFlag: string | null;
  coachingNotes: string | null;
  overallScore: number | null;
  paceScore: number | null;
  objectionScore: number | null;
  closeTriggerScore: number | null;
  rapportScore: number | null;
  strengths: string[];
  improvementAreas: string[];
  reviewedAt: string | null;
}

export interface AgentCoachingSummary {
  agentId: string;
  agentName: string;
  totalCalls: number;
  reviewedCalls: number;
  flaggedCalls: number;
  scoredCalls: number;
  avgDurationSeconds: number;
  averageScore: number | null;
  positiveOutcomeRate: number;
  lastCallAt: string;
}

export interface CoachingQueueItem extends CoachingSession {
  priority: 'escalated' | 'coaching' | 'score';
  reason: string;
}

export interface CoachingNoteItem {
  sessionId: string;
  agentId: string | null;
  agentName: string;
  startedAt: string;
  note: string;
  source: 'session' | 'score';
}

export interface ScoreDimensionAverage {
  label: string;
  value: number;
}

export interface AgentCoachingData {
  rangeStartIso: string;
  sessionCount: number;
  scoredCount: number;
  reviewedCount: number;
  flaggedCount: number;
  agentRows: AgentCoachingSummary[];
  scoredSessions: CoachingSession[];
  queue: CoachingQueueItem[];
  notes: CoachingNoteItem[];
}

const PAGE_SIZE = 200;
const POSITIVE_OUTCOMES = new Set([
  'interested',
  'callback',
  'questionnaire_sent',
  'follow_up_scheduled',
  'proposal_conversation',
]);

function getRangeDays(range: DateRange) {
  return range === '30d' ? 30 : 90;
}

function normalizeOutcome(callOutcome: string | null, legacyOutcome: string | null) {
  return callOutcome ?? legacyOutcome ?? null;
}

function isPositiveOutcome(outcome: string | null) {
  return outcome ? POSITIVE_OUTCOMES.has(outcome) : false;
}

function hasReview(session: CoachingSession) {
  return !!session.qaFlag || !!session.coachingNotes || !!session.reviewedAt;
}

function isFlagged(session: CoachingSession) {
  return session.qaFlag === 'escalate_for_review'
    || session.qaFlag === 'needs_coaching'
    || (session.overallScore !== null && session.overallScore < 70);
}

async function fetchPagedRows(
  supabase: SupabaseClient,
  table: 'call_sessions' | 'call_quality_scores',
  selectClause: string,
  dateColumn: 'started_at' | 'call_date',
  sinceIso: string,
): Promise<Array<Record<string, unknown>>> {
  const { count, error: countError } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte(dateColumn, sinceIso);

  if (countError) throw new Error(countError.message);

  const rows: Array<Record<string, unknown>> = [];
  const total = count ?? 0;
  for (let from = 0; from < total; from += PAGE_SIZE) {
    const to = Math.min(total - 1, from + PAGE_SIZE - 1);
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .gte(dateColumn, sinceIso)
      .order(dateColumn, { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    if (Array.isArray(data)) {
      rows.push(...(data as unknown as Array<Record<string, unknown>>));
    }
  }

  return rows;
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absoluteSeconds < 3600) return formatter.format(Math.round(deltaSeconds / 60), 'minute');
  if (absoluteSeconds < 86400) return formatter.format(Math.round(deltaSeconds / 3600), 'hour');
  return formatter.format(Math.round(deltaSeconds / 86400), 'day');
}

export async function loadAgentCoachingData(supabase: SupabaseClient, range: DateRange): Promise<AgentCoachingData> {
  const days = getRangeDays(range);
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));
  const rangeStartIso = rangeStart.toISOString();

  const [sessionRows, scoreRows] = await Promise.all([
    fetchPagedRows(
      supabase,
      'call_sessions',
      'id, user_id, agent_name, started_at, duration_seconds, call_outcome, outcome, recording_url, qa_flag, coaching_notes',
      'started_at',
      rangeStartIso,
    ),
    fetchPagedRows(
      supabase,
      'call_quality_scores',
      'id, session_id, agent_name, agent_id, call_date, duration_seconds, recording_url, pace_score, objection_handling_score, close_trigger_score, rapport_score, overall_score, strengths, improvement_areas, coaching_notes, reviewed_at, outcome',
      'call_date',
      rangeStartIso,
    ),
  ]);

  const scoresBySession = new Map<string, Record<string, unknown>>();
  for (const row of scoreRows) {
    const sessionId = typeof row.session_id === 'string' ? row.session_id : null;
    if (sessionId) scoresBySession.set(sessionId, row);
  }

  const sessions: CoachingSession[] = sessionRows.map((row) => {
    const sessionId = String(row.id);
    const score = scoresBySession.get(sessionId);
    return {
      sessionId,
      agentId: typeof row.user_id === 'string'
        ? row.user_id
        : typeof score?.agent_id === 'string'
        ? score.agent_id as string
        : null,
      agentName: typeof row.agent_name === 'string' && row.agent_name.trim()
        ? row.agent_name
        : typeof score?.agent_name === 'string' && (score.agent_name as string).trim()
        ? score.agent_name as string
        : 'Unassigned',
      startedAt: String(row.started_at),
      durationSeconds: typeof row.duration_seconds === 'number'
        ? row.duration_seconds
        : typeof score?.duration_seconds === 'number'
        ? score.duration_seconds as number
        : null,
      outcome: normalizeOutcome(
        typeof row.call_outcome === 'string' ? row.call_outcome : null,
        typeof row.outcome === 'string' ? row.outcome : typeof score?.outcome === 'string' ? score.outcome as string : null,
      ),
      recordingUrl: typeof row.recording_url === 'string'
        ? row.recording_url
        : typeof score?.recording_url === 'string'
        ? score.recording_url as string
        : null,
      qaFlag: typeof row.qa_flag === 'string' ? row.qa_flag : null,
      coachingNotes: typeof row.coaching_notes === 'string'
        ? row.coaching_notes
        : typeof score?.coaching_notes === 'string'
        ? score.coaching_notes as string
        : null,
      overallScore: typeof score?.overall_score === 'number' ? score.overall_score as number : null,
      paceScore: typeof score?.pace_score === 'number' ? score.pace_score as number : null,
      objectionScore: typeof score?.objection_handling_score === 'number' ? score.objection_handling_score as number : null,
      closeTriggerScore: typeof score?.close_trigger_score === 'number' ? score.close_trigger_score as number : null,
      rapportScore: typeof score?.rapport_score === 'number' ? score.rapport_score as number : null,
      strengths: Array.isArray(score?.strengths) ? (score?.strengths as string[]) : [],
      improvementAreas: Array.isArray(score?.improvement_areas) ? (score?.improvement_areas as string[]) : [],
      reviewedAt: typeof score?.reviewed_at === 'string' ? score.reviewed_at as string : null,
    };
  });

  const agentMap = new Map<string, AgentCoachingSummary & { durationCount: number; positiveCount: number }>();
  for (const session of sessions) {
    const agentId = session.agentId ?? session.agentName;
    const existing = agentMap.get(agentId) ?? {
      agentId,
      agentName: session.agentName,
      totalCalls: 0,
      reviewedCalls: 0,
      flaggedCalls: 0,
      scoredCalls: 0,
      avgDurationSeconds: 0,
      durationCount: 0,
      positiveCount: 0,
      averageScore: null,
      positiveOutcomeRate: 0,
      lastCallAt: session.startedAt,
    };

    existing.totalCalls += 1;
    if (hasReview(session)) existing.reviewedCalls += 1;
    if (isFlagged(session)) existing.flaggedCalls += 1;
    if ((session.durationSeconds ?? 0) > 0) {
      const runningTotal = existing.avgDurationSeconds * existing.durationCount + (session.durationSeconds ?? 0);
      existing.durationCount += 1;
      existing.avgDurationSeconds = Math.round(runningTotal / existing.durationCount);
    }
    if (session.overallScore !== null) {
      const nextScoredCalls = existing.scoredCalls + 1;
      const previousTotal = (existing.averageScore ?? 0) * existing.scoredCalls;
      existing.scoredCalls = nextScoredCalls;
      existing.averageScore = Math.round((previousTotal + session.overallScore) / nextScoredCalls);
    }
    if (isPositiveOutcome(session.outcome)) {
      existing.positiveCount += 1;
    }
    existing.positiveOutcomeRate = existing.totalCalls > 0 ? Math.round((existing.positiveCount / existing.totalCalls) * 100) : 0;
    if (new Date(session.startedAt).getTime() > new Date(existing.lastCallAt).getTime()) {
      existing.lastCallAt = session.startedAt;
    }
    agentMap.set(agentId, existing);
  }

  const queue: CoachingQueueItem[] = [];
  for (const session of sessions) {
    if (session.qaFlag === 'escalate_for_review') {
      queue.push({ ...session, priority: 'escalated', reason: 'Escalated for review' });
      continue;
    }
    if (session.qaFlag === 'needs_coaching') {
      queue.push({ ...session, priority: 'coaching', reason: 'Flagged as needs coaching' });
      continue;
    }
    if (session.overallScore !== null && session.overallScore < 70) {
      queue.push({ ...session, priority: 'score', reason: 'Overall score below 70' });
    }
  }

  const priorityOrder: Record<CoachingQueueItem['priority'], number> = { escalated: 0, coaching: 1, score: 2 };
  queue.sort((a, b) => {
    return priorityOrder[a.priority] - priorityOrder[b.priority] || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  const notes = sessions
    .filter((session) => !!session.coachingNotes)
    .map((session) => ({
      sessionId: session.sessionId,
      agentId: session.agentId,
      agentName: session.agentName,
      startedAt: session.startedAt,
      note: session.coachingNotes as string,
      source: 'session' as const,
    }));

  return {
    rangeStartIso,
    sessionCount: sessions.length,
    scoredCount: sessions.filter((session) => session.overallScore !== null).length,
    reviewedCount: sessions.filter(hasReview).length,
    flaggedCount: sessions.filter(isFlagged).length,
    agentRows: Array.from(agentMap.values())
      .map(({ durationCount: _durationCount, positiveCount: _positiveCount, ...row }) => row)
      .sort((a, b) => b.totalCalls - a.totalCalls || (b.averageScore ?? -1) - (a.averageScore ?? -1)),
    scoredSessions: sessions.filter((session) => session.overallScore !== null),
    queue,
    notes: notes.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
  };
}

export function buildScoreAverages(sessions: CoachingSession[]): ScoreDimensionAverage[] {
  const scored = sessions.filter((session) => session.overallScore !== null);
  if (scored.length === 0) return [];
  const average = (values: Array<number | null>) => {
    const filtered = values.filter((value): value is number => typeof value === 'number');
    return filtered.length > 0 ? Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length) : 0;
  };
  return [
    { label: 'Pace', value: average(scored.map((session) => session.paceScore)) },
    { label: 'Objections', value: average(scored.map((session) => session.objectionScore)) },
    { label: 'Close triggers', value: average(scored.map((session) => session.closeTriggerScore)) },
    { label: 'Rapport', value: average(scored.map((session) => session.rapportScore)) },
  ];
}
