import type { SupabaseClient } from '@supabase/supabase-js';

export type DateRange = '30d' | '90d';
export type ReviewFilter = 'all' | 'unreviewed' | 'reviewed' | 'needs_coaching' | 'escalated' | 'scored';
export type QaFlag = 'excellently_handled' | 'needs_coaching' | 'escalate_for_review' | null;

export interface ReviewSession {
  sessionId: string;
  scoreId: string | null;
  agentId: string | null;
  agentName: string;
  startedAt: string;
  durationSeconds: number | null;
  outcome: string | null;
  recordingUrl: string | null;
  hasTranscript: boolean;
  transcriptPreview: string[];
  summaryText: string | null;
  dispositionNotes: string | null;
  notes: string | null;
  qaFlag: QaFlag;
  coachingNotes: string | null;
  overallScore: number | null;
  paceScore: number | null;
  objectionScore: number | null;
  closeTriggerScore: number | null;
  rapportScore: number | null;
  strengths: string[];
  improvementAreas: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ReviewTrendPoint {
  label: string;
  averageScore: number;
  scoredCalls: number;
  reviewedCalls: number;
}

export interface ReviewData {
  sessions: ReviewSession[];
  scoreCount: number;
  reviewedCount: number;
  escalatedCount: number;
  flaggedCount: number;
  trend: ReviewTrendPoint[];
}

const PAGE_SIZE = 200;

function getDays(range: DateRange) {
  return range === '30d' ? 30 : 90;
}

function normalizeOutcome(callOutcome: string | null, legacyOutcome: string | null, scoreOutcome: string | null) {
  return callOutcome ?? legacyOutcome ?? scoreOutcome ?? null;
}

function hasTranscriptValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function extractTranscriptPreview(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const speaker = typeof (entry as { speaker?: unknown }).speaker === 'string' ? (entry as { speaker?: string }).speaker : 'Speaker';
        const text = typeof (entry as { text?: unknown }).text === 'string' ? (entry as { text?: string }).text?.trim() : '';
        return text ? [`${speaker}: ${text}`] : [];
      })
      .slice(0, 4);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }
  return [];
}

function extractSummaryText(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const summary = value as { summary_text?: unknown };
  return typeof summary.summary_text === 'string' && summary.summary_text.trim() ? summary.summary_text : null;
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

function buildTrend(sessions: ReviewSession[]) {
  const buckets = new Map<string, { label: string; sortKey: number; totalScore: number; scoredCalls: number; reviewedCalls: number }>();
  for (const session of sessions) {
    const date = new Date(session.startedAt);
    const bucket = new Date(date);
    bucket.setDate(date.getDate() - date.getDay());
    const sortKey = bucket.getTime();
    const key = String(sortKey);
    const entry = buckets.get(key) ?? {
      label: bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sortKey,
      totalScore: 0,
      scoredCalls: 0,
      reviewedCalls: 0,
    };
    if (session.overallScore !== null) {
      entry.totalScore += session.overallScore;
      entry.scoredCalls += 1;
    }
    if (session.qaFlag || session.coachingNotes || session.reviewedAt) {
      entry.reviewedCalls += 1;
    }
    buckets.set(key, entry);
  }

  return Array.from(buckets.values())
    .map((value) => ({
      label: value.label,
      sortKey: value.sortKey,
      averageScore: value.scoredCalls > 0 ? Math.round(value.totalScore / value.scoredCalls) : 0,
      scoredCalls: value.scoredCalls,
      reviewedCalls: value.reviewedCalls,
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey: _sortKey, ...point }) => point)
    .slice(-12);
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatOutcomeLabel(outcome: string | null) {
  return outcome ? outcome.replace(/_/g, ' ') : 'No disposition';
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

export async function loadReviewData(supabase: SupabaseClient, range: DateRange): Promise<ReviewData> {
  const days = getDays(range);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const sinceIso = start.toISOString();

  const [sessionRows, scoreRows] = await Promise.all([
    fetchPagedRows(
      supabase,
      'call_sessions',
      'id, user_id, agent_name, started_at, duration_seconds, call_outcome, outcome, recording_url, transcript, call_summary, disposition_notes, notes, qa_flag, coaching_notes',
      'started_at',
      sinceIso,
    ),
    fetchPagedRows(
      supabase,
      'call_quality_scores',
      'id, session_id, agent_name, agent_id, call_date, duration_seconds, recording_url, pace_score, objection_handling_score, close_trigger_score, rapport_score, overall_score, strengths, improvement_areas, coaching_notes, outcome, reviewed_by, reviewed_at',
      'call_date',
      sinceIso,
    ),
  ]);

  const scoresBySession = new Map<string, Record<string, unknown>>();
  for (const row of scoreRows) {
    const sessionId = typeof row.session_id === 'string' ? row.session_id : null;
    if (sessionId) scoresBySession.set(sessionId, row);
  }

  const sessions: ReviewSession[] = sessionRows.map((row) => {
    const sessionId = String(row.id);
    const score = scoresBySession.get(sessionId);
    return {
      sessionId,
      scoreId: typeof score?.id === 'string' ? score.id as string : null,
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
        typeof row.outcome === 'string' ? row.outcome : null,
        typeof score?.outcome === 'string' ? score.outcome as string : null,
      ),
      recordingUrl: typeof row.recording_url === 'string'
        ? row.recording_url
        : typeof score?.recording_url === 'string'
        ? score.recording_url as string
        : null,
      hasTranscript: hasTranscriptValue(row.transcript),
      transcriptPreview: extractTranscriptPreview(row.transcript),
      summaryText: extractSummaryText(row.call_summary),
      dispositionNotes: typeof row.disposition_notes === 'string' ? row.disposition_notes : null,
      notes: typeof row.notes === 'string' ? row.notes : null,
      qaFlag: typeof row.qa_flag === 'string' ? row.qa_flag as QaFlag : null,
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
      strengths: Array.isArray(score?.strengths) ? score?.strengths as string[] : [],
      improvementAreas: Array.isArray(score?.improvement_areas) ? score?.improvement_areas as string[] : [],
      reviewedBy: typeof score?.reviewed_by === 'string' ? score.reviewed_by as string : null,
      reviewedAt: typeof score?.reviewed_at === 'string' ? score.reviewed_at as string : null,
    };
  });

  return {
    sessions: sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    scoreCount: sessions.filter((session) => session.overallScore !== null).length,
    reviewedCount: sessions.filter((session) => !!session.qaFlag || !!session.coachingNotes || !!session.reviewedAt).length,
    escalatedCount: sessions.filter((session) => session.qaFlag === 'escalate_for_review').length,
    flaggedCount: sessions.filter((session) => session.qaFlag === 'needs_coaching' || session.qaFlag === 'escalate_for_review').length,
    trend: buildTrend(sessions),
  };
}

export async function saveReview(
  supabase: SupabaseClient,
  session: ReviewSession,
  values: { qaFlag: QaFlag; coachingNotes: string },
  reviewerLabel: string,
) {
  const sessionUpdate = supabase
    .from('call_sessions')
    .update({
      qa_flag: values.qaFlag,
      coaching_notes: values.coachingNotes.trim() || null,
    })
    .eq('id', session.sessionId);

  const tasks: PromiseLike<{ error: { message: string } | null }>[] = [sessionUpdate];

  if (session.scoreId) {
    tasks.push(
      supabase
        .from('call_quality_scores')
        .update({
          coaching_notes: values.coachingNotes.trim() || null,
          reviewed_by: reviewerLabel,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', session.scoreId),
    );
  }

  const results = await Promise.all(tasks);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(failed.error.message);
  }
}
