import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

export interface InsightRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  type: 'activation' | 'coverage' | 'queue' | 'sequence';
  title: string;
  detail: string;
  evidence: string;
  action: string;
}

export interface CohortInsight {
  id: string;
  label: string;
  size: number;
  trend: 'up' | 'down' | 'flat';
  engagementLabel: string;
  insight: string;
}

export interface EarlyWarning {
  id: string;
  name: string;
  address: string;
  state: string;
  stage: string;
  queueType: 'human_outreach' | 'missing_next_touch';
  assignedAgentId: string | null;
  lastContactedAt: string | null;
  risk: 'critical' | 'high' | 'medium';
  signal: string;
  daysSinceContact: number | null;
}

export interface CadenceInsightData {
  generatedAt: string;
  summary: string;
  healthScore: number;
  evidence: {
    sequenceCount: number;
    activeSequenceCount: number;
    stepCount: number;
    templateCoverageCount: number;
    enrollmentCount: number;
    sendCount: number;
    humanOutreachCount: number;
    unassignedHumanOutreachCount: number;
    newLeadCount: number;
    phoneReadyCount: number;
    smsOptInCount: number;
    scheduledTouchCount: number;
    contactedWithoutNextTouchCount: number;
  };
  recommendations: InsightRecommendation[];
  cohorts: CohortInsight[];
  warnings: EarlyWarning[];
}

interface SequenceRow {
  id: string;
  is_active: boolean | null;
  steps: unknown;
}

interface TemplateRow {
  category: string | null;
}

interface LeadWarningRow {
  id: string;
  contact_name: string | null;
  address: string | null;
  state: string | null;
  stage: string | null;
  last_contacted_at: string | null;
  next_scheduled_touch_at: string | null;
  assigned_agent_id: string | null;
}

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function daysSince(value: string | null) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function toWarning(row: LeadWarningRow, queueType: EarlyWarning['queueType']): EarlyWarning {
  const days = daysSince(row.last_contacted_at);
  const unassigned = !row.assigned_agent_id;
  const risk: EarlyWarning['risk'] = queueType === 'human_outreach' && unassigned
    ? 'critical'
    : days !== null && days >= 3
      ? 'high'
      : 'medium';

  const signal = queueType === 'human_outreach'
    ? `${unassigned ? 'Escalated without owner' : 'Escalated to human outreach'}${days !== null ? ` · ${days}d since last contact` : ''}`
    : `Contacted${days !== null ? ` ${days}d ago` : ''} but next_scheduled_touch_at is still empty`;

  return {
    id: row.id,
    name: row.contact_name?.trim() || 'Unnamed homeowner',
    address: row.address?.trim() || 'No address on file',
    state: row.state?.trim() || '—',
    stage: row.stage?.trim() || 'Unknown',
    queueType,
    assignedAgentId: row.assigned_agent_id,
    lastContactedAt: row.last_contacted_at,
    risk,
    signal,
    daysSinceContact: days,
  };
}

export async function loadCadenceInsightData(supabase: SupabaseClient) {
  const [
    sequenceResult,
    templateResult,
    enrollmentCount,
    sendCount,
    newLeadCount,
    humanOutreachCount,
    scheduledTouchCount,
    contactedWithoutNextTouchCount,
    phoneReadyCount,
    smsOptInCount,
  ] = await Promise.all([
    supabase.from('cadence_sequences').select('id, is_active, steps'),
    supabase.from('email_templates').select('category').not('category', 'is', null),
    getExactCount(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }), 'Loading cadence enrollments'),
    getExactCount(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true }), 'Loading cadence sends'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'New Lead'), 'Loading New Lead count'),
    getExactCount(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'human_outreach'), 'Loading human outreach count'),
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

  const sequences = (sequenceResult.data ?? []) as SequenceRow[];
  const templateKeys = new Set(
    ((templateResult.data ?? []) as TemplateRow[])
      .map((template) => template.category?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  const stepCount = sequences.reduce((sum, sequence) => sum + (Array.isArray(sequence.steps) ? sequence.steps.length : 0), 0);
  const templateCoverageCount = sequences.reduce((sum, sequence) => {
    if (!Array.isArray(sequence.steps)) return sum;
    return sum + sequence.steps.filter((step) => {
      if (!step || typeof step !== 'object') return false;
      const key = (step as { template_key?: unknown }).template_key;
      return typeof key === 'string' && templateKeys.has(key);
    }).length;
  }, 0);
  const activeSequenceCount = sequences.filter((sequence) => sequence.is_active !== false).length;

  const [humanOutreachResult, missingTouchResult] = await Promise.all([
    supabase
      .from('leads')
      .select('id, contact_name, address, state, stage, last_contacted_at, next_scheduled_touch_at, assigned_agent_id')
      .eq('stage', 'human_outreach')
      .order('last_contacted_at', { ascending: true })
      .limit(20),
    supabase
      .from('leads')
      .select('id, contact_name, address, state, stage, last_contacted_at, next_scheduled_touch_at, assigned_agent_id')
      .not('last_contacted_at', 'is', null)
      .is('next_scheduled_touch_at', null)
      .order('last_contacted_at', { ascending: true })
      .limit(20),
  ]);

  if (humanOutreachResult.error) {
    throw new Error(`Loading human outreach warnings: ${humanOutreachResult.error.message}`);
  }
  if (missingTouchResult.error) {
    throw new Error(`Loading missing-touch warnings: ${missingTouchResult.error.message}`);
  }

  const warningMap = new Map<string, EarlyWarning>();
  ((humanOutreachResult.data ?? []) as LeadWarningRow[]).forEach((row) => {
    warningMap.set(row.id, toWarning(row, 'human_outreach'));
  });
  ((missingTouchResult.data ?? []) as LeadWarningRow[]).forEach((row) => {
    if (!warningMap.has(row.id)) {
      warningMap.set(row.id, toWarning(row, 'missing_next_touch'));
    }
  });
  const warnings = Array.from(warningMap.values()).sort((left, right) => {
    const riskOrder = { critical: 0, high: 1, medium: 2 };
    if (riskOrder[left.risk] !== riskOrder[right.risk]) {
      return riskOrder[left.risk] - riskOrder[right.risk];
    }
    return (right.daysSinceContact ?? -1) - (left.daysSinceContact ?? -1);
  });

  const unassignedHumanOutreachCount = warnings.filter((warning) => warning.queueType === 'human_outreach' && !warning.assignedAgentId).length;

  const healthScore = clamp(
    (activeSequenceCount > 0 ? 10 : 0)
    + (stepCount > 0 ? 10 : 0)
    + (templateCoverageCount === stepCount && stepCount > 0 ? 10 : 0)
    + (enrollmentCount > 0 ? 20 : 0)
    + (sendCount > 0 ? 20 : 0)
    + (scheduledTouchCount > 0 ? 15 : 0)
    + (humanOutreachCount === 0 ? 10 : Math.round(((humanOutreachCount - unassignedHumanOutreachCount) / humanOutreachCount) * 10))
    + (smsOptInCount > 0 ? 5 : 0),
    0,
    100,
  );

  const recommendations: InsightRecommendation[] = [];

  if (enrollmentCount === 0) {
    recommendations.push({
      id: 'activate-enrollments',
      priority: 'high',
      type: 'activation',
      title: 'No leads are enrolled in cadence yet',
      detail: 'The live cadence_enrollments table is empty, so the configured nurture sequence has never started for any lead.',
      evidence: `${newLeadCount.toLocaleString()} leads are still sitting in New Lead while cadence_enrollments = 0.`,
      action: 'Trace the enrollment trigger path and confirm new leads are actually being inserted into cadence_enrollments.',
    });
  }

  if (sendCount === 0) {
    recommendations.push({
      id: 'no-send-history',
      priority: 'high',
      type: 'activation',
      title: 'Cadence has no send history',
      detail: 'cadence_send_log is empty, so there is no deliverability or engagement evidence to optimize yet.',
      evidence: `cadence_send_log count = 0 and last-30-day sends = 0.`,
      action: 'Fix the first successful enrollment/send path before tuning content or cadence timing.',
    });
  }

  if (scheduledTouchCount === 0) {
    recommendations.push({
      id: 'schedule-gap',
      priority: 'high',
      type: 'queue',
      title: 'No future cadence touches are scheduled',
      detail: 'Every lead currently has next_scheduled_touch_at empty, so the queue has no future work reserved.',
      evidence: `next_scheduled_touch_at is null for all leads while ${contactedWithoutNextTouchCount.toLocaleString()} contacted leads are waiting without a scheduled follow-up.`,
      action: 'Populate next_scheduled_touch_at when a lead is enrolled or manually touched so the queue can recover automatically.',
    });
  }

  if (smsOptInCount < Math.max(10, Math.round(phoneReadyCount * 0.05))) {
    recommendations.push({
      id: 'sms-coverage',
      priority: 'medium',
      type: 'coverage',
      title: 'SMS reach is extremely limited',
      detail: 'Only a tiny portion of phone-ready leads can legally receive SMS touches today.',
      evidence: `${smsOptInCount} SMS opt-ins across ${phoneReadyCount.toLocaleString()} phone-ready leads.`,
      action: 'Review consent capture and inbound opt-in flows before relying on the SMS step in the nurture sequence.',
    });
  }

  if (humanOutreachCount > 0) {
    recommendations.push({
      id: 'assign-human-queue',
      priority: unassignedHumanOutreachCount > 0 ? 'high' : 'medium',
      type: 'queue',
      title: 'Human-outreach leads need active ownership',
      detail: 'Escalated leads exist in the queue, and some of them still have no assigned owner.',
      evidence: `${humanOutreachCount} leads are in human_outreach; ${unassignedHumanOutreachCount} are unassigned.`,
      action: 'Assign every escalated lead and add a same-day follow-up SLA for the queue.',
    });
  }

  if (activeSequenceCount <= 1) {
    recommendations.push({
      id: 'sequence-depth',
      priority: 'low',
      type: 'sequence',
      title: 'Cadence coverage depends on a single active sequence',
      detail: 'Only one active cadence blueprint is configured, limiting experimentation across cohorts or outcomes.',
      evidence: `${activeSequenceCount} active sequence with ${stepCount} total configured steps.`,
      action: 'Once the first flow is sending reliably, add cohort-specific sequences instead of stretching one default path across every lead.',
    });
  }

  const cohorts: CohortInsight[] = [
    {
      id: 'new-leads',
      label: 'New leads awaiting automation',
      size: newLeadCount,
      trend: 'flat',
      engagementLabel: enrollmentCount === 0 ? 'No live cadence evidence yet' : 'Partially activated',
      insight: enrollmentCount === 0
        ? 'Nearly the entire top-of-funnel is still outside the cadence engine.'
        : 'A portion of new leads is entering cadence, but most are still outside the flow.',
    },
    {
      id: 'phone-ready',
      label: 'Phone-ready leads',
      size: phoneReadyCount,
      trend: smsOptInCount > 0 ? 'up' : 'flat',
      engagementLabel: smsOptInCount > 0 ? 'Reachable if consented' : 'Reachable but not consented',
      insight: `${smsOptInCount} of these leads currently have SMS consent, so the SMS step has limited reach.`,
    },
    {
      id: 'human-outreach',
      label: 'Human-outreach queue',
      size: humanOutreachCount,
      trend: humanOutreachCount > 0 ? 'up' : 'flat',
      engagementLabel: humanOutreachCount > 0 ? 'Needs manual follow-up' : 'No escalations',
      insight: humanOutreachCount > 0
        ? `${unassignedHumanOutreachCount} escalated leads are still unassigned.`
        : 'No leads are currently waiting in the manual outreach queue.',
    },
    {
      id: 'contacted-no-next-touch',
      label: 'Recently contacted, no next touch',
      size: contactedWithoutNextTouchCount,
      trend: contactedWithoutNextTouchCount > 0 ? 'down' : 'flat',
      engagementLabel: 'Workflow gap',
      insight: 'These leads have contact history but no next_scheduled_touch_at timestamp to keep them moving.',
    },
  ];

  const summary = activeSequenceCount > 0
    ? `One active cadence sequence with ${stepCount} configured steps is present in the live database, but the performance tables still show no enrollments or send-log activity. ${newLeadCount.toLocaleString()} leads remain in New Lead, no future touches are scheduled, and ${humanOutreachCount} leads already require manual follow-up.`
    : 'The live database does not show an active cadence configuration yet, so there is nothing reliable to optimize.';

  return {
    generatedAt: new Date().toISOString(),
    summary,
    healthScore,
    evidence: {
      sequenceCount: sequences.length,
      activeSequenceCount,
      stepCount,
      templateCoverageCount,
      enrollmentCount,
      sendCount,
      humanOutreachCount,
      unassignedHumanOutreachCount,
      newLeadCount,
      phoneReadyCount,
      smsOptInCount,
      scheduledTouchCount,
      contactedWithoutNextTouchCount,
    },
    recommendations,
    cohorts,
    warnings,
  } satisfies CadenceInsightData;
}
