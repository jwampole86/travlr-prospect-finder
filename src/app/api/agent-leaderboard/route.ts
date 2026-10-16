import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Db = ReturnType<typeof getSupabaseAdmin>;

type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  app_role: string | null;
  role: string | null;
  is_active: boolean | null;
};

type DealRow = {
  id: string;
  lead_id: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string | null;
};

type LeadRow = {
  id: string;
  created_at: string | null;
  primary_agent_id: string | null;
};

type OutreachRow = {
  agent_id: string | null;
  template_id: string | null;
  reply_detected: boolean | null;
  status: string | null;
};

type TemplateRow = {
  id: string;
  name: string | null;
};

async function countExact<T>(query: PromiseLike<{ count: number | null; error: { message: string } | null; data?: T }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

async function fetchPaged<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  totalCount: number,
  pageSize = 500,
) {
  const rows: T[] = [];
  for (let from = 0; from < totalCount; from += pageSize) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

async function loadDealDurations(db: Db, totalDeals: number) {
  if (totalDeals === 0) {
    return new Map<string, { total: number; count: number }>();
  }

  const deals = await fetchPaged<DealRow>(
    (from, to) => db.from('closed_deals').select('id, lead_id, closed_by, closed_at, created_at').order('created_at', { ascending: false }).range(from, to),
    totalDeals,
  );

  const leadIds = [...new Set(deals.map((deal) => deal.lead_id).filter((leadId): leadId is string => Boolean(leadId)))];
  const leads = await Promise.all(
    leadIds.length === 0
      ? []
      : leadIds.reduce<PromiseLike<{ data: LeadRow[] | null; error: { message: string } | null }>[] >((acc, _, index) => {
          if (index % 200 === 0) {
            const batch = leadIds.slice(index, index + 200);
            acc.push(db.from('leads').select('id, created_at, primary_agent_id').in('id', batch));
          }
          return acc;
        }, []),
  );

  const leadMap = new Map<string, LeadRow>();
  for (const batch of leads) {
    if (batch.error) throw new Error(batch.error.message);
    for (const lead of batch.data || []) {
      leadMap.set(lead.id, lead);
    }
  }

  const durations = new Map<string, { total: number; count: number }>();
  for (const deal of deals) {
    const lead = deal.lead_id ? leadMap.get(deal.lead_id) : undefined;
    const agentId = deal.closed_by || lead?.primary_agent_id || null;
    if (!agentId || !lead?.created_at) continue;
    const closedAt = deal.closed_at || deal.created_at;
    if (!closedAt) continue;
    const diffDays = (new Date(closedAt).getTime() - new Date(lead.created_at).getTime()) / 86_400_000;
    if (!Number.isFinite(diffDays) || diffDays < 0) continue;
    const current = durations.get(agentId) || { total: 0, count: 0 };
    current.total += diffDays;
    current.count += 1;
    durations.set(agentId, current);
  }

  return durations;
}

export async function GET(req: NextRequest) {
  const authorization = await requireApiActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: profiles, error: profilesError } = await db
      .from('user_profiles')
      .select('id, email, full_name, app_role, role, is_active')
      .order('full_name');

    if (profilesError) throw new Error(profilesError.message);

    const eligibleProfiles = ((profiles || []) as UserProfile[]).filter((profile) => {
      if (profile.is_active === false) return false;
      const appRole = (profile.app_role || '').toLowerCase();
      const rawRole = (profile.role || '').toLowerCase();
      return appRole === 'agent' || appRole === 'admin' || appRole === 'owner' || rawRole === 'agent';
    });

    const [
      totalOutreachRecords,
      attributedOutreachRecords,
      totalCalls,
      totalDeals,
      templateRowsResult,
    ] = await Promise.all([
      countExact(db.from('outreach_history').select('id', { count: 'exact', head: true })),
      countExact(db.from('outreach_history').select('id', { count: 'exact', head: true }).not('agent_id', 'is', null)),
      countExact(db.from('call_sessions').select('id', { count: 'exact', head: true })),
      countExact(db.from('closed_deals').select('id', { count: 'exact', head: true })),
      db.from('message_templates').select('id, name'),
    ]);

    if (templateRowsResult.error) throw new Error(templateRowsResult.error.message);
    const templateNameById = new Map((templateRowsResult.data || []).map((row: TemplateRow) => [row.id, row.name || 'Unnamed template']));

    const [dealDurations, attributedOutreachRows] = await Promise.all([
      loadDealDurations(db, totalDeals),
      attributedOutreachRecords > 0
        ? fetchPaged<OutreachRow>(
            (from, to) => db.from('outreach_history').select('agent_id, template_id, reply_detected, status').not('agent_id', 'is', null).range(from, to),
            attributedOutreachRecords,
          )
        : Promise.resolve([] as OutreachRow[]),
    ]);

    const templateStatsByAgent = new Map<string, Map<string, { count: number; replies: number }>>();
    for (const row of attributedOutreachRows) {
      if (!row.agent_id || !row.template_id) continue;
      const byTemplate = templateStatsByAgent.get(row.agent_id) || new Map<string, { count: number; replies: number }>();
      const current = byTemplate.get(row.template_id) || { count: 0, replies: 0 };
      current.count += 1;
      if (row.reply_detected || row.status === 'replied') current.replies += 1;
      byTemplate.set(row.template_id, current);
      templateStatsByAgent.set(row.agent_id, byTemplate);
    }

    const agents = await Promise.all(eligibleProfiles.map(async (profile) => {
      const [assignedLeads, outreachSent, outreachReplies, callsLogged, dealsClosed] = await Promise.all([
        countExact(db.from('leads').select('id', { count: 'exact', head: true }).eq('primary_agent_id', profile.id)),
        countExact(db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('agent_id', profile.id)),
        countExact(db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('agent_id', profile.id).or('reply_detected.is.true,status.eq.replied')),
        countExact(db.from('call_sessions').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)),
        countExact(db.from('closed_deals').select('id', { count: 'exact', head: true }).eq('closed_by', profile.id)),
      ]);

      const templateStats = templateStatsByAgent.get(profile.id);
      const topTemplates = templateStats
        ? [...templateStats.entries()]
            .sort((left, right) => right[1].count - left[1].count)
            .slice(0, 3)
            .map(([templateId, stats]) => ({
              id: templateId,
              name: templateNameById.get(templateId) || templateId,
              count: stats.count,
              replies: stats.replies,
            }))
        : [];

      const durationStats = dealDurations.get(profile.id);
      const avgCloseDays = durationStats && durationStats.count > 0
        ? Math.round((durationStats.total / durationStats.count) * 10) / 10
        : null;

      return {
        id: profile.id,
        name: profile.full_name || profile.email || 'Unnamed agent',
        email: profile.email || '',
        appRole: profile.app_role || 'agent',
        assignedLeads,
        outreachSent,
        outreachReplies,
        replyRate: outreachSent > 0 ? Math.round((outreachReplies / outreachSent) * 1000) / 10 : null,
        callsLogged,
        dealsClosed,
        avgCloseDays,
        topTemplates,
      };
    }));

    const filteredAgents = agents.filter((agent) => {
      const hasTrackedData = agent.assignedLeads > 0 || agent.outreachSent > 0 || agent.callsLogged > 0 || agent.dealsClosed > 0;
      return hasTrackedData || agent.appRole === 'agent';
    });

    return NextResponse.json({
      agents: filteredAgents,
      coverage: {
        totalAgents: filteredAgents.length,
        totalAssignedLeads: filteredAgents.reduce((sum, agent) => sum + agent.assignedLeads, 0),
        totalOutreachRecords,
        attributedOutreachRecords,
        totalCalls,
        totalDeals,
        attributedOutreachPct: totalOutreachRecords > 0 ? Math.round((attributedOutreachRecords / totalOutreachRecords) * 1000) / 10 : 0,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load leaderboard data.' }, { status: 500 });
  }
}
