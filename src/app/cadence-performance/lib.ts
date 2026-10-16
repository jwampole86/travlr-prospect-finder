import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;
const TREND_WEEKS = 12;

export interface CadenceStepBlueprint {
  step: number;
  label: string;
  channel: string;
  delayDays: number;
  delayHours: number;
  templateKey: string;
  subject: string | null;
  templateReady: boolean;
}

export interface SequencePerformanceRow {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  steps: CadenceStepBlueprint[];
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  escalatedEnrollments: number;
  pausedEnrollments: number;
  unsubscribedEnrollments: number;
  totalSends: number;
  deliveredSends: number;
  failedSends: number;
  skippedSends: number;
  openedSends: number;
  clickedSends: number;
  engagedSends: number;
  engagementRate: number;
  lastEnrollmentAt: string | null;
  lastSendAt: string | null;
}

export interface TrendPoint {
  weekLabel: string;
  enrollments: number;
  sends: number;
  completions: number;
  escalations: number;
}

export interface FollowUpLead {
  id: string;
  name: string;
  address: string;
  state: string;
  stage: string;
  lastContactedAt: string | null;
  nextScheduledTouchAt: string | null;
  assignedAgentId: string | null;
  cadenceStep: number;
  queueType: 'human_outreach' | 'missing_next_touch';
}

export interface CadencePerformanceData {
  generatedAt: string;
  summary: {
    sequenceCount: number;
    activeSequenceCount: number;
    defaultSequenceCount: number;
    totalSteps: number;
    readyTemplateSteps: number;
    enrollmentCount: number;
    activeEnrollmentCount: number;
    completedEnrollmentCount: number;
    escalatedEnrollmentCount: number;
    pausedEnrollmentCount: number;
    unsubscribedEnrollmentCount: number;
    sendCount: number;
    deliveredSendCount: number;
    failedSendCount: number;
    skippedSendCount: number;
    engagedSendCount: number;
    openedSendCount: number;
    clickedSendCount: number;
    recent30DaySendCount: number;
    scheduledTouchCount: number;
    contactedWithoutNextTouchCount: number;
    humanOutreachCount: number;
    phoneReadyCount: number;
    smsOptInCount: number;
    newLeadCount: number;
    totalLeadCount: number;
  };
  trend: TrendPoint[];
  sequences: SequencePerformanceRow[];
  followUpQueue: FollowUpLead[];
}

interface SequenceRowRecord {
  id: string;
  name: string;
  is_active: boolean | null;
  is_default: boolean | null;
  steps: unknown;
}

interface TemplateRecord {
  category: string | null;
}

interface EnrollmentRecord {
  sequence_id: string | null;
  status: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  escalated_at: string | null;
}

interface SendLogRecord {
  sequence_id: string | null;
  channel: string | null;
  status: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

interface LeadQueueRecord {
  id: string;
  contact_name: string | null;
  address: string | null;
  state: string | null;
  stage: string | null;
  last_contacted_at: string | null;
  next_scheduled_touch_at: string | null;
  assigned_agent_id: string | null;
  cadence_step: number | null;
}

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

function startOfWeek(input: Date) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function weekKey(input: string | null) {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return startOfWeek(date).toISOString();
}

function weekLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseSteps(raw: unknown, templateKeys: Set<string>): CadenceStepBlueprint[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((step, index) => {
    const item = typeof step === 'object' && step ? (step as Record<string, unknown>) : {};
    const templateKey = typeof item.template_key === 'string' ? item.template_key : '';
    return {
      step: typeof item.step === 'number' ? item.step : index,
      label: typeof item.label === 'string' ? item.label : `Step ${index + 1}`,
      channel: typeof item.channel === 'string' ? item.channel : 'email',
      delayDays: typeof item.delay_days === 'number' ? item.delay_days : 0,
      delayHours: typeof item.delay_hours === 'number' ? item.delay_hours : 0,
      templateKey,
      subject: typeof item.subject === 'string' ? item.subject : null,
      templateReady: templateKey.length > 0 ? templateKeys.has(templateKey) : false,
    };
  });
}

async function getExactCount(promise: PromiseLike<CountResult>, label: string) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.count ?? 0;
}

async function fetchAllPages<T>(
  total: number,
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; from < total; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, total - 1);
    const result = await fetchPage(from, to);
    if (result.error) {
      throw new Error(`${label}: ${result.error.message}`);
    }
    rows.push(...(result.data ?? []));
  }
  return rows;
}

function relativeMax(values: number[]) {
  return Math.max(0, ...values);
}

export async function loadCadencePerformanceData(supabase: SupabaseClient) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [
    sequenceResult,
    templateResult,
    enrollmentCount,
    activeEnrollmentCount,
    completedEnrollmentCount,
    escalatedEnrollmentCount,
    pausedEnrollmentCount,
    unsubscribedEnrollmentCount,
    sendCount,
    deliveredSendCount,
    failedSendCount,
    skippedOptOutCount,
    skippedDncCount,
    recent30DaySendCount,
    totalLeadCount,
    newLeadCount,
    humanOutreachCount,
    scheduledTouchCount,
    contactedWithoutNextTouchCount,
    phoneReadyCount,
    smsOptInCount,
  ] = await Promise.all([
    supabase.from('cadence_sequences').select('id, name, is_active, is_default, steps').order('name'),
    supabase.from('email_templates').select('category').not('category', 'is', null),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }), 'Loading cadence enrollments'),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active'), 'Loading active enrollments'),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed'), 'Loading completed enrollments'),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'escalated'), 'Loading escalated enrollments'),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'paused'), 'Loading paused enrollments'),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'unsubscribed'), 'Loading unsubscribed enrollments'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }), 'Loading cadence send log'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }).eq('status', 'sent'), 'Loading delivered sends'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }).eq('status', 'failed'), 'Loading failed sends'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }).eq('status', 'skipped_opt_out'), 'Loading opt-out skips'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }).eq('status', 'skipped_dnc'), 'Loading DNC skips'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }).gte('sent_at', thirtyDaysAgo), 'Loading recent sends'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }), 'Loading leads'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'New Lead'), 'Loading New Lead count'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'human_outreach'), 'Loading human outreach queue'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).not('next_scheduled_touch_at', 'is', null), 'Loading scheduled touches'),
    getExactCount(
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .not('last_contacted_at', 'is', null)
        .is('next_scheduled_touch_at', null),
      'Loading contacted leads without next touch',
    ),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('has_phone', true), 'Loading phone-ready leads'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('sms_opt_in', true), 'Loading SMS opt-ins'),
  ]);

  if (sequenceResult.error) {
    throw new Error(`Loading cadence sequences: ${sequenceResult.error.message}`);
  }
  if (templateResult.error) {
    throw new Error(`Loading template categories: ${templateResult.error.message}`);
  }

  const templateKeys = new Set(
    ((templateResult.data ?? []) as TemplateRecord[])
      .map((template) => template.category?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  const sequencesRaw = (sequenceResult.data ?? []) as SequenceRowRecord[];
  const sequencesWithSteps = sequencesRaw.map((sequence) => ({
    ...sequence,
    steps: parseSteps(sequence.steps, templateKeys),
  }));

  const enrollments = enrollmentCount > 0
    ? await fetchAllPages<EnrollmentRecord>(
        enrollmentCount,
        'Loading enrollment pages',
        (from, to) => supabase
          .from('cadence_enrollments')
          .select('sequence_id, status, enrolled_at, completed_at, escalated_at')
          .order('enrolled_at', { ascending: false })
          .range(from, to),
      )
    : [];

  const sendLogs = sendCount > 0
    ? await fetchAllPages<SendLogRecord>(
        sendCount,
        'Loading send log pages',
        (from, to) => supabase
          .from('cadence_send_log')
          .select('sequence_id, channel, status, sent_at, opened_at, clicked_at')
          .order('sent_at', { ascending: false })
          .range(from, to),
      )
    : [];

  const [humanOutreachResult, missingTouchResult] = await Promise.all([
    supabase
      .from('leads')
      .select('id, contact_name, address, state, stage, last_contacted_at, next_scheduled_touch_at, assigned_agent_id, cadence_step')
      .eq('stage', 'human_outreach')
      .order('last_contacted_at', { ascending: true })
      .limit(20),
    supabase
      .from('leads')
      .select('id, contact_name, address, state, stage, last_contacted_at, next_scheduled_touch_at, assigned_agent_id, cadence_step')
      .not('last_contacted_at', 'is', null)
      .is('next_scheduled_touch_at', null)
      .order('last_contacted_at', { ascending: true })
      .limit(20),
  ]);

  if (humanOutreachResult.error) {
    throw new Error(`Loading follow-up queue: ${humanOutreachResult.error.message}`);
  }
  if (missingTouchResult.error) {
    throw new Error(`Loading missing-touch queue: ${missingTouchResult.error.message}`);
  }

  const enrollmentBySequence = new Map<string, SequencePerformanceRow>();
  const sequenceRows = sequencesWithSteps.map((sequence) => {
    const row: SequencePerformanceRow = {
      id: sequence.id,
      name: sequence.name,
      isActive: sequence.is_active !== false,
      isDefault: sequence.is_default === true,
      steps: sequence.steps,
      totalEnrollments: 0,
      activeEnrollments: 0,
      completedEnrollments: 0,
      escalatedEnrollments: 0,
      pausedEnrollments: 0,
      unsubscribedEnrollments: 0,
      totalSends: 0,
      deliveredSends: 0,
      failedSends: 0,
      skippedSends: 0,
      openedSends: 0,
      clickedSends: 0,
      engagedSends: 0,
      engagementRate: 0,
      lastEnrollmentAt: null,
      lastSendAt: null,
    };
    enrollmentBySequence.set(sequence.id, row);
    return row;
  });

  for (const enrollment of enrollments) {
    if (!enrollment.sequence_id) continue;
    const row = enrollmentBySequence.get(enrollment.sequence_id);
    if (!row) continue;
    row.totalEnrollments += 1;
    row.lastEnrollmentAt ??= enrollment.enrolled_at;
    if (enrollment.status === 'active') row.activeEnrollments += 1;
    if (enrollment.status === 'completed') row.completedEnrollments += 1;
    if (enrollment.status === 'escalated') row.escalatedEnrollments += 1;
    if (enrollment.status === 'paused') row.pausedEnrollments += 1;
    if (enrollment.status === 'unsubscribed') row.unsubscribedEnrollments += 1;
  }

  for (const log of sendLogs) {
    if (!log.sequence_id) continue;
    const row = enrollmentBySequence.get(log.sequence_id);
    if (!row) continue;
    row.totalSends += 1;
    row.lastSendAt ??= log.sent_at;
    if (log.status === 'sent') row.deliveredSends += 1;
    if (log.status === 'failed') row.failedSends += 1;
    if (log.status === 'skipped_opt_out' || log.status === 'skipped_dnc') row.skippedSends += 1;
    if (log.opened_at) row.openedSends += 1;
    if (log.clicked_at) row.clickedSends += 1;
    if (log.opened_at || log.clicked_at) row.engagedSends += 1;
  }

  for (const row of sequenceRows) {
    row.engagementRate = row.deliveredSends > 0
      ? Math.round((row.engagedSends / row.deliveredSends) * 100)
      : 0;
  }

  const weeks = Array.from({ length: TREND_WEEKS }, (_, index) => {
    const weekStart = startOfWeek(new Date(Date.now() - (TREND_WEEKS - index - 1) * 7 * 86400000));
    return {
      key: weekStart.toISOString(),
      value: {
        weekLabel: weekLabel(weekStart),
        enrollments: 0,
        sends: 0,
        completions: 0,
        escalations: 0,
      } satisfies TrendPoint,
    };
  });

  const trendLookup = new Map(weeks.map((entry) => [entry.key, entry.value]));

  for (const enrollment of enrollments) {
    const enrolledKey = weekKey(enrollment.enrolled_at);
    if (enrolledKey && trendLookup.has(enrolledKey)) {
      trendLookup.get(enrolledKey)!.enrollments += 1;
    }
    const completedKey = weekKey(enrollment.completed_at);
    if (completedKey && trendLookup.has(completedKey)) {
      trendLookup.get(completedKey)!.completions += 1;
    }
    const escalatedKey = weekKey(enrollment.escalated_at);
    if (escalatedKey && trendLookup.has(escalatedKey)) {
      trendLookup.get(escalatedKey)!.escalations += 1;
    }
  }

  for (const log of sendLogs) {
    const sentKey = weekKey(log.sent_at);
    if (sentKey && trendLookup.has(sentKey)) {
      trendLookup.get(sentKey)!.sends += 1;
    }
  }

  const followUpQueueMap = new Map<string, FollowUpLead>();
  const pushLead = (record: LeadQueueRecord, queueType: FollowUpLead['queueType']) => {
    if (!followUpQueueMap.has(record.id)) {
      followUpQueueMap.set(record.id, {
        id: record.id,
        name: record.contact_name?.trim() || 'Unnamed homeowner',
        address: record.address?.trim() || 'No address on file',
        state: record.state?.trim() || '—',
        stage: record.stage?.trim() || 'Unknown',
        lastContactedAt: record.last_contacted_at,
        nextScheduledTouchAt: record.next_scheduled_touch_at,
        assignedAgentId: record.assigned_agent_id,
        cadenceStep: record.cadence_step ?? 0,
        queueType,
      });
    }
  };

  ((humanOutreachResult.data ?? []) as LeadQueueRecord[]).forEach((lead) => pushLead(lead, 'human_outreach'));
  ((missingTouchResult.data ?? []) as LeadQueueRecord[]).forEach((lead) => pushLead(lead, 'missing_next_touch'));

  const readyTemplateSteps = sequencesWithSteps.reduce(
    (sum, sequence) => sum + sequence.steps.filter((step) => step.templateReady).length,
    0,
  );
  const totalSteps = sequencesWithSteps.reduce((sum, sequence) => sum + sequence.steps.length, 0);
  const skippedSendCount = skippedOptOutCount + skippedDncCount;
  const engagedSendCount = sequenceRows.reduce((sum, sequence) => sum + sequence.engagedSends, 0);
  const openedSendCount = sequenceRows.reduce((sum, sequence) => sum + sequence.openedSends, 0);
  const clickedSendCount = sequenceRows.reduce((sum, sequence) => sum + sequence.clickedSends, 0);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      sequenceCount: sequencesWithSteps.length,
      activeSequenceCount: sequencesWithSteps.filter((sequence) => sequence.is_active !== false).length,
      defaultSequenceCount: sequencesWithSteps.filter((sequence) => sequence.is_default === true).length,
      totalSteps,
      readyTemplateSteps,
      enrollmentCount,
      activeEnrollmentCount,
      completedEnrollmentCount,
      escalatedEnrollmentCount,
      pausedEnrollmentCount,
      unsubscribedEnrollmentCount,
      sendCount,
      deliveredSendCount,
      failedSendCount,
      skippedSendCount,
      engagedSendCount,
      openedSendCount,
      clickedSendCount,
      recent30DaySendCount,
      scheduledTouchCount,
      contactedWithoutNextTouchCount,
      humanOutreachCount,
      phoneReadyCount,
      smsOptInCount,
      newLeadCount,
      totalLeadCount,
    },
    trend: weeks.map((entry) => entry.value),
    sequences: sequenceRows.sort((left, right) => {
      const sendDelta = right.totalSends - left.totalSends;
      if (sendDelta !== 0) return sendDelta;
      return right.totalEnrollments - left.totalEnrollments;
    }),
    followUpQueue: Array.from(followUpQueueMap.values()).sort((left, right) => {
      const leftTime = left.lastContactedAt ? new Date(left.lastContactedAt).getTime() : 0;
      const rightTime = right.lastContactedAt ? new Date(right.lastContactedAt).getTime() : 0;
      return leftTime - rightTime;
    }),
  } satisfies CadencePerformanceData;
}

export function getPerformanceMaxima(data: CadencePerformanceData) {
  return {
    trend: relativeMax(data.trend.flatMap((point) => [point.enrollments, point.sends, point.completions, point.escalations])),
    sequenceEnrollments: relativeMax(data.sequences.map((sequence) => sequence.totalEnrollments)),
    sequenceSends: relativeMax(data.sequences.map((sequence) => sequence.totalSends)),
  };
}
