import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type RuleRow = {
  id: string;
  name: string;
  priority: number | null;
  enabled: boolean | null;
  min_ai_score: number | null;
  max_ai_score: number | null;
  regions: string[] | null;
  expertise_tags: string[] | null;
  lead_stages: string[] | null;
  portfolios: string[] | null;
  score_threshold: number | null;
  availability_start: string | null;
  availability_end: string | null;
  availability_days: string[] | null;
  auto_assign_enabled: boolean | null;
  target_agent_id: string | null;
  target_agent_name: string | null;
  max_workload: number | null;
  total_assigned: number | null;
};

type LeadRow = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
  prospect_score: number | null;
  tags: unknown;
  contact_name: string | null;
};

type AgentProfile = {
  id: string;
  owner_user_id: string | null;
  full_name: string | null;
  email: string | null;
  status: string | null;
};

type NormalizedRule = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  min_ai_score: number;
  max_ai_score: number;
  regions: string[];
  expertise_tags: string[];
  lead_stages: string[];
  portfolios: string[];
  score_threshold: number;
  availability_start: string | null;
  availability_end: string | null;
  availability_days: string[];
  auto_assign_enabled: boolean;
  target_agent_id: string | null;
  target_agent_name: string;
  max_workload: number;
  total_assigned: number;
};

type AgentContext = {
  userId: string;
  profileId: string;
  name: string;
  email: string | null;
  status: string;
  portfolios: string[];
  workload: number;
};

type AssignmentResult = {
  leadId: string;
  leadAddress: string;
  leadName: string;
  agentName: string;
  agentId: string;
  ruleName: string;
  ruleId: string;
  aiScore: number;
  region: string;
  stage: string;
  reason: string;
};

const ACTIVE_ASSIGNMENT_STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract'];
const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEAD_BATCH_SIZE = 1000;

function extractStateFromAddress(address: string): string {
  const match = address.match(/,\s*([A-Z]{2})\s*(\d{5})?/) || address.match(/\b([A-Z]{2})\b/);
  return match ? match[1] : '';
}

function normalizeStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeRule(row: Partial<RuleRow> & Record<string, unknown>): NormalizedRule {
  const targetAgentName = typeof row.target_agent_name === 'string'
    ? row.target_agent_name.trim()
    : typeof row.targetAgentName === 'string'
      ? String(row.targetAgentName).trim()
      : '';

  return {
    id: String(row.id ?? crypto.randomUUID()),
    name: String(row.name ?? 'Untitled Rule').trim(),
    priority: Number(row.priority ?? 0),
    enabled: Boolean(row.enabled ?? true),
    min_ai_score: Number(row.min_ai_score ?? row.minAiScore ?? 0),
    max_ai_score: Number(row.max_ai_score ?? row.maxAiScore ?? 100),
    regions: normalizeStringArray((row.regions ?? []) as string[]),
    expertise_tags: normalizeStringArray((row.expertise_tags ?? row.expertiseTags ?? []) as string[]),
    lead_stages: normalizeStringArray((row.lead_stages ?? row.leadStages ?? []) as string[]),
    portfolios: normalizeStringArray((row.portfolios ?? []) as string[]),
    score_threshold: Number(row.score_threshold ?? row.scoreThreshold ?? 0),
    availability_start: typeof row.availability_start === 'string' ? row.availability_start : typeof row.availabilityStart === 'string' ? row.availabilityStart : null,
    availability_end: typeof row.availability_end === 'string' ? row.availability_end : typeof row.availabilityEnd === 'string' ? row.availabilityEnd : null,
    availability_days: normalizeStringArray((row.availability_days ?? row.availabilityDays ?? []) as string[]),
    auto_assign_enabled: Boolean(row.auto_assign_enabled ?? row.autoAssignEnabled ?? true),
    target_agent_id: typeof row.target_agent_id === 'string' ? row.target_agent_id : typeof row.targetAgentId === 'string' ? row.targetAgentId : null,
    target_agent_name: targetAgentName,
    max_workload: Number(row.max_workload ?? row.maxWorkload ?? 50),
    total_assigned: Number(row.total_assigned ?? row.totalAssigned ?? 0),
  };
}

function getLeadTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    : [];
}

function isWithinAvailability(rule: NormalizedRule, now: Date): boolean {
  const days = rule.availability_days;
  if (days.length > 0) {
    const day = WEEKDAY_KEYS[now.getDay()];
    if (!days.includes(day)) {
      return false;
    }
  }

  if (!rule.availability_start || !rule.availability_end) {
    return true;
  }

  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return current >= rule.availability_start && current <= rule.availability_end;
}

function ruleMatchesLead(rule: NormalizedRule, lead: LeadRow, now: Date): boolean {
  if (!rule.enabled || !rule.auto_assign_enabled) return false;
  if (!isWithinAvailability(rule, now)) return false;

  const score = lead.prospect_score ?? 0;
  if (score < rule.min_ai_score || score > rule.max_ai_score) return false;
  if (score < rule.score_threshold) return false;

  const leadState = (lead.state || extractStateFromAddress(lead.address || '')).toUpperCase();
  if (rule.regions.length > 0 && (!leadState || !rule.regions.map((item) => item.toUpperCase()).includes(leadState))) {
    return false;
  }

  if (rule.portfolios.length > 0 && (!leadState || !rule.portfolios.map((item) => item.toUpperCase()).includes(leadState))) {
    return false;
  }

  if (rule.lead_stages.length > 0) {
    const leadStage = (lead.stage || '').trim().toLowerCase();
    if (!rule.lead_stages.some((stage) => stage.trim().toLowerCase() === leadStage)) {
      return false;
    }
  }

  if (rule.expertise_tags.length > 0) {
    const leadTags = getLeadTags(lead.tags);
    if (!rule.expertise_tags.some((tag) => leadTags.includes(tag.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

async function fetchAllUnassignedLeads(db: ReturnType<typeof getSupabaseAdmin>) {
  const leads: LeadRow[] = [];
  let from = 0;

  while (true) {
    const to = from + LEAD_BATCH_SIZE - 1;
    const { data, error } = await db
      .from('leads')
      .select('id, address, city, state, stage, prospect_score, tags, contact_name')
      .in('stage', ACTIVE_ASSIGNMENT_STAGES)
      .is('primary_agent_id', null)
      .order('prospect_score', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data || []) as LeadRow[];
    leads.push(...batch);
    if (batch.length < LEAD_BATCH_SIZE) break;
    from += LEAD_BATCH_SIZE;
  }

  return leads;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function loadAgentContexts(db: ReturnType<typeof getSupabaseAdmin>, rules: NormalizedRule[]) {
  const { data: profiles, error: profilesError } = await db
    .from('agent_profiles')
    .select('id, owner_user_id, full_name, email, status')
    .order('full_name');

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const activeProfiles = ((profiles || []) as AgentProfile[]).filter((profile) => (profile.status || '').toLowerCase() === 'active');
  const profilesByUserId = new Map<string, AgentProfile>();
  const profilesByName = new Map<string, AgentProfile>();

  for (const profile of activeProfiles) {
    const userId = profile.owner_user_id || profile.id;
    profilesByUserId.set(userId, profile);
    if (profile.full_name) {
      profilesByName.set(profile.full_name.trim().toLowerCase(), profile);
    }
  }

  const targetAgentUserIds = uniqueStrings(
    rules.map((rule) => {
      if (rule.target_agent_id && profilesByUserId.has(rule.target_agent_id)) {
        return rule.target_agent_id;
      }
      const profile = rule.target_agent_name ? profilesByName.get(rule.target_agent_name.trim().toLowerCase()) : undefined;
      return profile ? profile.owner_user_id || profile.id : null;
    }),
  );

  const { data: portfolioAssignments, error: portfolioError } = await db
    .from('agent_portfolio_assignments')
    .select('agent_user_id, portfolio_key')
    .in('agent_user_id', targetAgentUserIds.length > 0 ? targetAgentUserIds : ['00000000-0000-0000-0000-000000000000']);

  if (portfolioError) {
    throw new Error(portfolioError.message);
  }

  const portfolioMap = new Map<string, string[]>();
  for (const row of portfolioAssignments || []) {
    const userId = String(row.agent_user_id);
    const current = portfolioMap.get(userId) || [];
    current.push(String(row.portfolio_key));
    portfolioMap.set(userId, current);
  }

  const workloadEntries = await Promise.all(
    targetAgentUserIds.map(async (userId) => {
      const { count, error } = await db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('primary_agent_id', userId);
      if (error) {
        throw new Error(error.message);
      }
      return [userId, count || 0] as const;
    }),
  );

  const workloadMap = new Map<string, number>(workloadEntries);
  const contextMap = new Map<string, AgentContext>();

  for (const userId of targetAgentUserIds) {
    const profile = profilesByUserId.get(userId);
    if (!profile) continue;
    contextMap.set(userId, {
      userId,
      profileId: profile.id,
      name: profile.full_name || 'Agent',
      email: profile.email || null,
      status: profile.status || 'unknown',
      portfolios: portfolioMap.get(userId) || [],
      workload: workloadMap.get(userId) || 0,
    });
  }

  return { contextMap, profilesByName };
}

export async function POST(req: NextRequest) {
  try {
    const authorization = await requireAdminActor(req);
    if (!authorization.actor) {
      return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
    }

    const body = await req.json().catch(() => ({})) as {
      rules?: Array<Record<string, unknown>>;
      dryRun?: boolean;
    };

    const db = getSupabaseAdmin();
    const dryRun = Boolean(body.dryRun);

    const { data: dbRules, error: dbRulesError } = await db
      .from('lead_assignment_rules')
      .select('id, name, priority, enabled, min_ai_score, max_ai_score, regions, expertise_tags, lead_stages, portfolios, score_threshold, availability_start, availability_end, availability_days, auto_assign_enabled, target_agent_id, target_agent_name, max_workload, total_assigned')
      .eq('enabled', true)
      .order('priority', { ascending: true });

    if (dbRulesError) {
      return NextResponse.json({ success: false, error: dbRulesError.message }, { status: 500 });
    }

    const rules = (dbRules && dbRules.length > 0 ? dbRules : body.rules || [])
      .map((row) => normalizeRule(row))
      .filter((rule) => rule.enabled)
      .sort((a, b) => a.priority - b.priority);

    if (rules.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, skipped: 0, message: 'No active assignment rules found.' });
    }

    const { contextMap, profilesByName } = await loadAgentContexts(db, rules);
    if (contextMap.size === 0) {
      return NextResponse.json({ success: true, assigned: 0, skipped: 0, message: 'No active agent profiles match the configured rules.' });
    }

    const leads = await fetchAllUnassignedLeads(db);
    if (leads.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, skipped: 0, message: 'No unassigned leads matched the live queue.' });
    }

    const now = new Date();
    const assignmentResults: AssignmentResult[] = [];
    const skippedLeads: string[] = [];
    const ruleUsage = new Map<string, number>();

    for (const lead of leads) {
      let assigned = false;

      for (const rule of rules) {
        if (!ruleMatchesLead(rule, lead, now)) {
          continue;
        }

        const directUserId = rule.target_agent_id && contextMap.has(rule.target_agent_id) ? rule.target_agent_id : null;
        const fallbackProfile = !directUserId && rule.target_agent_name
          ? profilesByName.get(rule.target_agent_name.trim().toLowerCase())
          : undefined;
        const resolvedUserId = directUserId || (fallbackProfile ? fallbackProfile.owner_user_id || fallbackProfile.id : null);
        if (!resolvedUserId) {
          continue;
        }

        const agent = contextMap.get(resolvedUserId);
        if (!agent) {
          continue;
        }

        const leadState = (lead.state || extractStateFromAddress(lead.address || '')).toUpperCase();
        if (agent.portfolios.length > 0 && (!leadState || !agent.portfolios.map((item) => item.toUpperCase()).includes(leadState))) {
          continue;
        }

        if (agent.workload >= rule.max_workload) {
          continue;
        }

        const reason = [
          `score ${lead.prospect_score ?? 0} matched ${rule.min_ai_score}-${rule.max_ai_score}`,
          rule.score_threshold > 0 ? `threshold ${rule.score_threshold}+` : null,
          rule.regions.length > 0 ? `region ${leadState}` : null,
          rule.portfolios.length > 0 ? `portfolio ${leadState}` : null,
          rule.lead_stages.length > 0 ? `stage ${lead.stage}` : null,
          rule.expertise_tags.length > 0 ? `tags ${rule.expertise_tags.join(', ')}` : null,
          `workload ${agent.workload + 1}/${rule.max_workload}`,
        ].filter(Boolean).join(' · ');

        assignmentResults.push({
          leadId: lead.id,
          leadAddress: lead.address || '',
          leadName: lead.contact_name || '',
          agentName: agent.name,
          agentId: agent.userId,
          ruleName: rule.name,
          ruleId: rule.id,
          aiScore: lead.prospect_score ?? 0,
          region: leadState,
          stage: lead.stage || '',
          reason,
        });

        agent.workload += 1;
        ruleUsage.set(rule.id, (ruleUsage.get(rule.id) || 0) + 1);
        assigned = true;
        break;
      }

      if (!assigned) {
        skippedLeads.push(lead.id);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        assigned: assignmentResults.length,
        skipped: skippedLeads.length,
        preview: assignmentResults.slice(0, 100),
      });
    }

    if (assignmentResults.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, skipped: skippedLeads.length, message: 'No live leads matched the active rules.' });
    }

    const timestamp = now.toISOString();
    const executionId = crypto.randomUUID();

    const leadsByAgent = new Map<string, AssignmentResult[]>();
    for (const result of assignmentResults) {
      const current = leadsByAgent.get(result.agentId) || [];
      current.push(result);
      leadsByAgent.set(result.agentId, current);
    }

    for (const [agentId, results] of leadsByAgent.entries()) {
      const leadIds = results.map((result) => result.leadId);
      const agentName = results[0]?.agentName || 'Agent';
      const { error } = await db
        .from('leads')
        .update({
          primary_agent_id: agentId,
          primary_agent_name: agentName,
          assigned_agent_id: agentId,
          assigned_agent_name: agentName,
          assigned_at: timestamp,
          assigned_by: authorization.actor.user.id,
          updated_at: timestamp,
        })
        .in('id', leadIds);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    const leadAgentAssignments = assignmentResults.map((result) => ({
      lead_id: result.leadId,
      agent_id: result.agentId,
      agent_name: result.agentName,
      is_primary: true,
      assigned_at: timestamp,
      assigned_by: authorization.actor.user.id,
      assigned_by_name: authorization.actor.user.email || 'Auto Assign',
      note: `Auto-assigned by rule: ${result.ruleName}`,
    }));

    const { error: leadAgentAssignmentsError } = await db.from('lead_agent_assignments').insert(leadAgentAssignments);
    if (leadAgentAssignmentsError) {
      return NextResponse.json({ success: false, error: leadAgentAssignmentsError.message }, { status: 500 });
    }

    const logRows = assignmentResults.map((result) => ({
      id: crypto.randomUUID(),
      lead_id: result.leadId,
      lead_address: result.leadAddress,
      assigned_to_agent_id: result.agentId,
      assigned_to_agent_name: result.agentName,
      rule_id: result.ruleId,
      rule_name: result.ruleName,
      ai_score: result.aiScore,
      region: result.region,
      reason: result.reason,
      assigned_at: timestamp,
      execution_id: executionId,
      stage: result.stage || null,
      score: result.aiScore,
      portfolio: result.region || null,
      is_override: false,
    }));

    const { error: assignmentLogError } = await db.from('lead_assignment_log').insert(logRows);
    if (assignmentLogError) {
      return NextResponse.json({ success: false, error: assignmentLogError.message }, { status: 500 });
    }

    const leadActivityRows = assignmentResults.map((result) => ({
      lead_id: result.leadId,
      activity_type: 'ASSIGNMENT',
      activity_data: {
        source: 'auto_assign',
        executionId,
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        agentId: result.agentId,
        agentName: result.agentName,
        aiScore: result.aiScore,
      },
      performed_by: authorization.actor.user.id,
      performed_by_name: authorization.actor.user.email || 'Auto Assign',
      created_at: timestamp,
    }));

    const { error: leadActivityError } = await db.from('lead_activity_log').insert(leadActivityRows);
    if (leadActivityError) {
      return NextResponse.json({ success: false, error: leadActivityError.message }, { status: 500 });
    }

    const activityEvents = assignmentResults.map((result) => ({
      user_id: authorization.actor.user.id,
      lead_id: result.leadId,
      lead_address: result.leadAddress,
      lead_state: result.region || null,
      event_type: 'lead_assigned',
      description: `Lead auto-assigned to ${result.agentName}`,
      detail: `Rule ${result.ruleName} matched ${result.leadName || result.leadAddress || result.leadId}`,
      previous_value: null,
      new_value: result.agentName,
      actor_user_id: authorization.actor.user.id,
      actor_email: authorization.actor.user.email ?? null,
      source: 'auto_assign',
      metadata: {
        executionId,
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        aiScore: result.aiScore,
      },
      event_timestamp: timestamp,
      created_at: timestamp,
    }));

    const { error: activityEventsError } = await db.from('activity_events').insert(activityEvents);
    if (activityEventsError) {
      return NextResponse.json({ success: false, error: activityEventsError.message }, { status: 500 });
    }

    for (const rule of rules) {
      if (!ruleUsage.has(rule.id)) continue;
      const { error } = await db
        .from('lead_assignment_rules')
        .update({
          last_run_at: timestamp,
          total_assigned: rule.total_assigned + (ruleUsage.get(rule.id) || 0),
          updated_at: timestamp,
        })
        .eq('id', rule.id);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      assigned: assignmentResults.length,
      skipped: skippedLeads.length,
      results: assignmentResults.slice(0, 100),
      executionId,
    });
  } catch (err) {
    console.error('[leads/auto-assign]', err);
    const message = err instanceof Error ? err.message : 'Auto-assignment failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authorization = await requireAdminActor(req);
    if (!authorization.actor) {
      return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('lead_assignment_log')
      .select('id, lead_id, lead_address, assigned_to_agent_id, assigned_to_agent_name, rule_id, rule_name, ai_score, region, reason, assigned_at, stage, score, portfolio, execution_id')
      .order('assigned_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, log: data || [] });
  } catch (err) {
    console.error('[leads/auto-assign GET]', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch log';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
