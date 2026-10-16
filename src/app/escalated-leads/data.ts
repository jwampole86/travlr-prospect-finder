import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

import type { EscalatedCall, EscalatedLead, EscalatedLeadsPageData, EscalatedTouchpoint } from './components/types';

type LeadRow = {
  id: string;
  owner_name: string | null;
  contact_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contact_phone: string | null;
  stage: string;
  pipeline_status: string | null;
  cadence_step: number | null;
  last_contacted_at: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  next_scheduled_touch_at: string | null;
};

type AgentRow = { id: string; full_name: string | null };

type OutreachRow = {
  id: string;
  lead_id: string;
  channel: 'sms' | 'email' | 'call';
  status: string;
  sent_at: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
};

type CallRow = {
  id: string;
  lead_id: string;
  started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  outcome: string | null;
  call_outcome: string | null;
};

type ActivityRow = {
  lead_id: string;
  activity_type: string;
  activity_data: Record<string, unknown> | null;
  created_at: string;
};

const DISPLAY_LIMIT = 200;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function displayName(row: LeadRow): string {
  return text(row.contact_name) || text(row.owner_name) || 'Unnamed homeowner';
}

function toTouchpoint(row: OutreachRow): EscalatedTouchpoint {
  const metadata = row.metadata ?? {};
  const direction = text(metadata.direction) as EscalatedTouchpoint['direction'] | null;
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    sentAt: row.sent_at,
    direction: direction === 'inbound' || direction === 'outbound' ? direction : 'unknown',
    body: text(metadata.body) || text(metadata.message),
    kind: text(metadata.kind),
    twilioStatus: text(metadata.twilio_status),
    recipient: row.recipient_phone || row.recipient_email || text(metadata.to) || text(metadata.from),
    failureReason: row.failure_reason,
  };
}

function toCall(row: CallRow): EscalatedCall {
  return {
    id: row.id,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
    recordingUrl: row.recording_url,
    transcript: row.transcript,
    outcome: row.outcome || row.call_outcome,
  };
}

function latestActivityNote(row: ActivityRow | undefined): string | null {
  if (!row) return null;
  return text(row.activity_data?.description) || row.activity_type.replace(/_/g, ' ');
}

export async function getEscalatedLeadsPageData(): Promise<EscalatedLeadsPageData> {
  const db = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalCount,
    assignedCount,
    callbackScheduledCount,
    recentCount,
    leadsResult,
  ] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true }).eq('stage', 'human_outreach'),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('stage', 'human_outreach').not('assigned_agent_id', 'is', null),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('stage', 'human_outreach').eq('pipeline_status', 'callback_scheduled'),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('stage', 'human_outreach').gte('escalated_at', since24h),
    db
      .from('leads')
      .select('id, owner_name, contact_name, address, city, state, contact_phone, stage, pipeline_status, cadence_step, last_contacted_at, escalated_at, escalation_reason, assigned_agent_id, assigned_agent_name, next_scheduled_touch_at')
      .eq('stage', 'human_outreach')
      .order('escalated_at', { ascending: false, nullsFirst: false })
      .limit(DISPLAY_LIMIT),
  ]);

  if (leadsResult.error) {
    throw new Error(leadsResult.error.message);
  }

  const leads = (leadsResult.data ?? []) as LeadRow[];
  const leadIds = leads.map((lead) => lead.id);
  const assignedIds = Array.from(new Set(leads.map((lead) => lead.assigned_agent_id).filter((value): value is string => Boolean(value))));

  const [agentResult, touchpointResult, callResult, activityResult] = await Promise.all([
    assignedIds.length
      ? db.from('user_profiles').select('id, full_name').in('id', assignedIds)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? db
          .from('outreach_history')
          .select('id, lead_id, channel, status, sent_at, recipient_email, recipient_phone, failure_reason, metadata')
          .in('lead_id', leadIds)
          .order('sent_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? db
          .from('call_sessions')
          .select('id, lead_id, started_at, duration_seconds, recording_url, transcript, outcome, call_outcome')
          .in('lead_id', leadIds)
          .order('started_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? db
          .from('lead_activity_log')
          .select('lead_id, activity_type, activity_data, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (agentResult.error) throw new Error(agentResult.error.message);
  if (touchpointResult.error) throw new Error(touchpointResult.error.message);
  if (callResult.error) throw new Error(callResult.error.message);
  if (activityResult.error) throw new Error(activityResult.error.message);

  const agentMap = new Map<string, string>();
  for (const row of (agentResult.data ?? []) as AgentRow[]) {
    if (row.full_name) agentMap.set(row.id, row.full_name);
  }

  const touchpointsByLead = new Map<string, EscalatedTouchpoint[]>();
  for (const row of (touchpointResult.data ?? []) as OutreachRow[]) {
    const list = touchpointsByLead.get(row.lead_id) ?? [];
    list.push(toTouchpoint(row));
    touchpointsByLead.set(row.lead_id, list);
  }

  const callsByLead = new Map<string, EscalatedCall[]>();
  for (const row of (callResult.data ?? []) as CallRow[]) {
    const list = callsByLead.get(row.lead_id) ?? [];
    list.push(toCall(row));
    callsByLead.set(row.lead_id, list);
  }

  const activityByLead = new Map<string, ActivityRow>();
  for (const row of (activityResult.data ?? []) as ActivityRow[]) {
    if (!activityByLead.has(row.lead_id)) activityByLead.set(row.lead_id, row);
  }

  return {
    summary: {
      total: totalCount.count ?? leads.length,
      assigned: assignedCount.count ?? leads.filter((lead) => lead.assigned_agent_id).length,
      unassigned: Math.max(0, (totalCount.count ?? leads.length) - (assignedCount.count ?? 0)),
      callbackScheduled: callbackScheduledCount.count ?? leads.filter((lead) => lead.pipeline_status === 'callback_scheduled').length,
      escalatedLast24h: recentCount.count ?? leads.filter((lead) => lead.escalated_at && lead.escalated_at >= since24h).length,
    },
    leads: leads.map((lead) => ({
      id: lead.id,
      displayName: displayName(lead),
      ownerName: text(lead.owner_name),
      contactName: text(lead.contact_name),
      address: text(lead.address),
      city: text(lead.city),
      state: text(lead.state),
      contactPhone: text(lead.contact_phone),
      stage: lead.stage,
      pipelineStatus: text(lead.pipeline_status),
      cadenceStep: lead.cadence_step ?? 0,
      lastContactedAt: lead.last_contacted_at,
      escalatedAt: lead.escalated_at,
      escalationReason: text(lead.escalation_reason),
      assignedAgentId: lead.assigned_agent_id,
      assignedAgentName: text(lead.assigned_agent_name) || (lead.assigned_agent_id ? agentMap.get(lead.assigned_agent_id) ?? null : null),
      nextScheduledTouchAt: lead.next_scheduled_touch_at,
      touches: touchpointsByLead.get(lead.id) ?? [],
      calls: callsByLead.get(lead.id) ?? [],
      latestActivityNote: latestActivityNote(activityByLead.get(lead.id)),
    })),
  };
}
