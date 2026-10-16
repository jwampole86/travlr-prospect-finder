import type { SupabaseClient } from '@supabase/supabase-js';

export type DateRange = '7d' | '30d' | '90d';

export interface AnalyticsSession {
  id: string;
  agentName: string;
  startedAt: string;
  durationSeconds: number | null;
  outcome: string | null;
  recordingUrl: string | null;
  hasTranscript: boolean;
  isInProgress: boolean;
  notes: string | null;
  dispositionNotes: string | null;
}

export interface TrendPoint {
  label: string;
  calls: number;
  completed: number;
  positive: number;
}

export interface OutcomeStat {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface AgentRow {
  agentName: string;
  totalCalls: number;
  completedCalls: number;
  positiveCalls: number;
  interestedCalls: number;
  callbackCalls: number;
  voicemailCalls: number;
  noAnswerCalls: number;
  averageDurationSeconds: number;
  lastCallAt: string;
}

export interface CallAnalyticsData {
  rangeStartIso: string;
  totalCalls: number;
  completedCalls: number;
  recordedCalls: number;
  connectedCalls: number;
  callsWithDisposition: number;
  averageDurationSeconds: number;
  positiveOutcomeRate: number;
  interestedCalls: number;
  callbackCalls: number;
  voicemailCalls: number;
  noAnswerCalls: number;
  trend: TrendPoint[];
  outcomes: OutcomeStat[];
  agentRows: AgentRow[];
  recentCalls: AnalyticsSession[];
}

const PAGE_SIZE = 250;
const OUTCOME_LABELS: Record<string, string> = {
  connected: 'Connected',
  voicemail: 'Voicemail',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  interested: 'Interested',
  not_interested: 'Not interested',
  callback: 'Callback',
  other: 'Other',
  questionnaire_sent: 'Questionnaire sent',
  follow_up_scheduled: 'Follow-up scheduled',
  proposal_conversation: 'Proposal conversation',
};

const POSITIVE_OUTCOMES = new Set([
  'interested',
  'callback',
  'questionnaire_sent',
  'follow_up_scheduled',
  'proposal_conversation',
]);

const NON_CONNECTED_OUTCOMES = new Set(['voicemail', 'no_answer', 'busy', 'failed']);

function getDays(range: DateRange) {
  return range === '7d' ? 7 : range === '30d' ? 30 : 90;
}

function normalizeOutcome(callOutcome: string | null, legacyOutcome: string | null) {
  return callOutcome ?? legacyOutcome ?? null;
}

function hasTranscriptValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isPositiveOutcome(outcome: string | null) {
  return outcome ? POSITIVE_OUTCOMES.has(outcome) : false;
}

export function isConnectedOutcome(outcome: string | null) {
  return outcome ? !NON_CONNECTED_OUTCOMES.has(outcome) : false;
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatOutcomeLabel(outcome: string | null) {
  if (!outcome) return 'No disposition';
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, ' ');
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absoluteSeconds < 60) return rtf.format(Math.round(deltaSeconds), 'second');
  if (absoluteSeconds < 3600) return rtf.format(Math.round(deltaSeconds / 60), 'minute');
  if (absoluteSeconds < 86400) return rtf.format(Math.round(deltaSeconds / 3600), 'hour');
  return rtf.format(Math.round(deltaSeconds / 86400), 'day');
}

export async function loadCallAnalyticsData(supabase: SupabaseClient, range: DateRange): Promise<CallAnalyticsData> {
  const days = getDays(range);
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));
  const rangeStartIso = rangeStart.toISOString();

  const { count, error: countError } = await supabase
    .from('call_sessions')
    .select('id', { count: 'exact', head: true })
    .gte('started_at', rangeStartIso);

  if (countError) {
    throw new Error(countError.message);
  }

  const total = count ?? 0;
  const rawRows: Array<Record<string, unknown>> = [];

  for (let from = 0; from < total; from += PAGE_SIZE) {
    const to = Math.min(total - 1, from + PAGE_SIZE - 1);
    const { data, error } = await supabase
      .from('call_sessions')
      .select('id, agent_name, started_at, duration_seconds, call_outcome, outcome, recording_url, transcript, is_in_progress, notes, disposition_notes')
      .gte('started_at', rangeStartIso)
      .order('started_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    rawRows.push(...(data ?? []));
  }

  const sessions: AnalyticsSession[] = rawRows.map((row) => ({
    id: String(row.id),
    agentName: typeof row.agent_name === 'string' && row.agent_name.trim() ? row.agent_name : 'Unassigned',
    startedAt: String(row.started_at),
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    outcome: normalizeOutcome(
      typeof row.call_outcome === 'string' ? row.call_outcome : null,
      typeof row.outcome === 'string' ? row.outcome : null,
    ),
    recordingUrl: typeof row.recording_url === 'string' ? row.recording_url : null,
    hasTranscript: hasTranscriptValue(row.transcript),
    isInProgress: row.is_in_progress === true,
    notes: typeof row.notes === 'string' ? row.notes : null,
    dispositionNotes: typeof row.disposition_notes === 'string' ? row.disposition_notes : null,
  }));

  const completedCalls = sessions.filter((session) => (session.durationSeconds ?? 0) > 0).length;
  const callsWithDisposition = sessions.filter((session) => session.outcome).length;
  const connectedCalls = sessions.filter((session) => isConnectedOutcome(session.outcome)).length;
  const recordedCalls = sessions.filter((session) => !!session.recordingUrl).length;
  const durationTotal = sessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0);
  const averageDurationSeconds = completedCalls > 0 ? Math.round(durationTotal / completedCalls) : 0;
  const positiveCalls = sessions.filter((session) => isPositiveOutcome(session.outcome)).length;
  const positiveOutcomeRate = callsWithDisposition > 0 ? Math.round((positiveCalls / callsWithDisposition) * 100) : 0;

  const outcomeCounts = new Map<string, number>();
  for (const session of sessions) {
    const key = session.outcome ?? 'undispositioned';
    outcomeCounts.set(key, (outcomeCounts.get(key) ?? 0) + 1);
  }

  const outcomes: OutcomeStat[] = Array.from(outcomeCounts.entries())
    .map(([key, countValue]) => ({
      key,
      label: key === 'undispositioned' ? 'No disposition' : formatOutcomeLabel(key),
      count: countValue,
      share: total > 0 ? Math.round((countValue / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const trendMap = new Map<string, TrendPoint>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(rangeStart);
    date.setDate(rangeStart.getDate() + i);
    const label = formatDayLabel(date);
    trendMap.set(label, { label, calls: 0, completed: 0, positive: 0 });
  }
  for (const session of sessions) {
    const label = formatDayLabel(new Date(session.startedAt));
    const point = trendMap.get(label);
    if (!point) continue;
    point.calls += 1;
    if ((session.durationSeconds ?? 0) > 0) point.completed += 1;
    if (isPositiveOutcome(session.outcome)) point.positive += 1;
  }

  const agentMap = new Map<string, AgentRow>();
  for (const session of sessions) {
    const existing = agentMap.get(session.agentName) ?? {
      agentName: session.agentName,
      totalCalls: 0,
      completedCalls: 0,
      positiveCalls: 0,
      interestedCalls: 0,
      callbackCalls: 0,
      voicemailCalls: 0,
      noAnswerCalls: 0,
      averageDurationSeconds: 0,
      lastCallAt: session.startedAt,
    };
    existing.totalCalls += 1;
    if ((session.durationSeconds ?? 0) > 0) {
      existing.completedCalls += 1;
      const durationTotalForAgent = existing.averageDurationSeconds * (existing.completedCalls - 1) + (session.durationSeconds ?? 0);
      existing.averageDurationSeconds = Math.round(durationTotalForAgent / existing.completedCalls);
    }
    if (isPositiveOutcome(session.outcome)) existing.positiveCalls += 1;
    if (session.outcome === 'interested') existing.interestedCalls += 1;
    if (session.outcome === 'callback') existing.callbackCalls += 1;
    if (session.outcome === 'voicemail') existing.voicemailCalls += 1;
    if (session.outcome === 'no_answer') existing.noAnswerCalls += 1;
    if (new Date(session.startedAt).getTime() > new Date(existing.lastCallAt).getTime()) {
      existing.lastCallAt = session.startedAt;
    }
    agentMap.set(session.agentName, existing);
  }

  return {
    rangeStartIso,
    totalCalls: total,
    completedCalls,
    recordedCalls,
    connectedCalls,
    callsWithDisposition,
    averageDurationSeconds,
    positiveOutcomeRate,
    interestedCalls: sessions.filter((session) => session.outcome === 'interested').length,
    callbackCalls: sessions.filter((session) => session.outcome === 'callback').length,
    voicemailCalls: sessions.filter((session) => session.outcome === 'voicemail').length,
    noAnswerCalls: sessions.filter((session) => session.outcome === 'no_answer').length,
    trend: Array.from(trendMap.values()),
    outcomes,
    agentRows: Array.from(agentMap.values()).sort((a, b) => b.totalCalls - a.totalCalls || b.positiveCalls - a.positiveCalls),
    recentCalls: sessions.slice(0, 40),
  };
}
