import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizationFor } from './consentLedger';
import type { SellerIntent } from './sellerIntent';
import { fitScore, loadLeadFacts, suggestFit } from './serviceFit';
import { ROUTE_PURPOSE, STAGES, type ServiceLine, type Stage } from './types';

type Db = ReturnType<typeof getSupabaseAdmin>;

export type Opportunity = {
  id: string; organization_id: string | null; lead_id: string; stage: Stage; status: string; route: ServiceLine | null; partner_id: string | null;
  authority_verified: boolean; timeline: string | null; occupancy: string | null; decision_status: string | null;
  intent_score: number; service_fit_score: number; authorization_status: string; [key: string]: unknown;
};

/**
 * Records a seller signal for a lead. One open opportunity exists per lead: a repeat signal refreshes the existing one.
 * Nothing is sent to the owner; the signal creates a task for a person to review.
 */
export async function recordSellerSignal(db: Db, input: {
  leadId: string; source: string; text: string; intent: SellerIntent; organizationId?: string | null; assignedTo?: string | null;
}): Promise<{ opportunity: Opportunity; created: boolean } | null> {
  if (input.intent.level === 'none') return null;
  const facts = await loadLeadFacts(db, input.leadId);
  if (!facts) return null;
  const { data: leadRow } = await db.from('leads').select('organization_id, cross_source_property_id, contact_name, address').eq('id', input.leadId).maybeSingle();
  const organizationId = input.organizationId ?? leadRow?.organization_id ?? null;
  const suggestions = suggestFit(facts, input.intent);
  const auth = await authorizationFor(db, input.leadId, 'seller_consultation');
  const now = new Date().toISOString();

  let q = db.from('seller_opportunities').select('*').eq('lead_id', input.leadId).in('status', ['open', 'paused']);
  if (organizationId) q = q.eq('organization_id', organizationId);
  const { data: existing } = await q.maybeSingle();
  if (existing) {
    const { data: updated } = await db.from('seller_opportunities').update({
      signal_text: input.text.slice(0, 1000), signal_at: now,
      intent_score: Math.max(existing.intent_score ?? 0, input.intent.score),
      service_fit_score: fitScore(suggestions),
      timeline: existing.timeline ?? input.intent.timeline,
      authorization_status: auth.status,
    }).eq('id', existing.id).select('*').single();
    return { opportunity: (updated ?? existing) as Opportunity, created: false };
  }

  const { data: created, error } = await db.from('seller_opportunities').insert({
    ...(organizationId ? { organization_id: organizationId } : {}),
    lead_id: input.leadId,
    property_key: leadRow?.cross_source_property_id ?? null,
    source: input.source,
    signal_text: input.text.slice(0, 1000),
    signal_at: now,
    intent_score: input.intent.score,
    service_fit_score: fitScore(suggestions),
    authorization_status: auth.status,
    timeline: input.intent.timeline,
    goals: input.intent.keepsRental ? ['keep_as_rental'] : [],
    next_action: 'Read the reply, confirm the owner and ask permission for a sale or management conversation',
    next_action_at: now,
  }).select('*').single();
  if (error || !created) throw new Error(error?.message ?? 'Could not create the seller opportunity');

  await db.from('service_assessments').insert(suggestions.map((s) => ({
    ...(organizationId ? { organization_id: organizationId } : {}),
    opportunity_id: created.id,
    service_line: s.serviceLine,
    eligibility: 'needs_review',
    reasons: [...s.reasons, ...s.cautions],
  })));

  await db.from('lead_tasks').insert({
    lead_id: input.leadId,
    title: `Seller signal${leadRow?.contact_name ? `: ${leadRow.contact_name}` : ''}`,
    description: `Replied: "${input.text.slice(0, 200)}". Confirm they own the property and ask permission before discussing a sale or management.`,
    task_type: 'call', priority: 'high', status: 'pending', due_date: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  return { opportunity: created as Opportunity, created: true };
}

/** Why an opportunity cannot move to a stage yet. An empty list means it can. */
export async function stageBlockers(db: Db, opp: Opportunity, target: Stage): Promise<string[]> {
  const blockers: string[] = [];
  const from = STAGES.indexOf(opp.stage);
  const to = STAGES.indexOf(target);
  if (to <= from) return blockers;

  const auth = await authorizationFor(db, opp.lead_id, 'seller_consultation');
  if (auth.status === 'blocked') return auth.reasons;

  if (to >= STAGES.indexOf('qualified')) {
    if (!opp.authority_verified) blockers.push('Confirm the person is the owner or an authorized decision-maker.');
    if (!opp.timeline) blockers.push('Record the owner\'s timeline.');
    if (!opp.occupancy || opp.occupancy === 'unknown') blockers.push('Record whether the property is occupied, vacant or rented.');
    if (!opp.decision_status || opp.decision_status === 'unknown') blockers.push('Record whether the owner decides alone.');
    if (auth.status !== 'authorized') blockers.push('Record the owner\'s permission for a consultation.');
  }

  if (to >= STAGES.indexOf('routed')) {
    if (!opp.route) {
      blockers.push('Choose which service to route the owner to.');
    } else {
      const routeAuth = await authorizationFor(db, opp.lead_id, ROUTE_PURPOSE[opp.route]);
      if (routeAuth.status !== 'authorized') blockers.push(...(routeAuth.status === 'blocked' ? routeAuth.reasons : [`Record the owner's permission for ${opp.route.replace(/_/g, ' ')}.`]));
      const { data: assessment } = await db.from('service_assessments').select('eligibility').eq('opportunity_id', opp.id).eq('service_line', opp.route).maybeSingle();
      if (assessment?.eligibility !== 'eligible') blockers.push('A person must review and approve eligibility for this service.');
      if (opp.route === 'sale_partner') {
        if (!opp.partner_id) {
          blockers.push('Choose a licensed partner for the sale.');
        } else {
          const { data: partner } = await db.from('service_partners').select('license_status, relationship_status, legal_reviewed, agreement_on_file').eq('id', opp.partner_id).maybeSingle();
          if (!partner || partner.license_status !== 'verified') blockers.push('The partner\'s license must be verified.');
          if (!partner?.legal_reviewed) blockers.push('The partner arrangement needs legal review.');
          if (!partner?.agreement_on_file) blockers.push('Put the signed partner agreement on file.');
        }
      }
    }
  }

  if (to >= STAGES.indexOf('agreement')) {
    const { count } = await db.from('service_agreements').select('id', { count: 'exact', head: true }).eq('opportunity_id', opp.id);
    if (!count) blockers.push('Add the agreement before moving to this stage.');
  }
  return blockers;
}

export type Dashboard = {
  identified: number; contacted: number; qualified: number; inService: number;
  collected: number; cost: number; invoiced: number;
  byStage: Record<string, number>;
  followUps: Array<{ id: string; lead_id: string; stage: string; next_action: string | null; next_action_at: string | null; intent_score: number; authorization_status: string }>;
};

export async function sellerDashboard(db: Db, organizationId: string | null): Promise<Dashboard> {
  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) => (organizationId ? q.eq('organization_id', organizationId) : q);
  const { data: opps } = await scope(db.from('seller_opportunities').select('id, lead_id, stage, status, intent_score, authorization_status, next_action, next_action_at, route, partner_id') as never) as unknown as { data: Array<Opportunity & { next_action: string | null; next_action_at: string | null }> | null };
  const list = opps ?? [];
  const { data: rev } = await scope(db.from('service_revenue').select('invoiced, collected, cost, status') as never) as unknown as { data: Array<{ invoiced: number; collected: number; cost: number; status: string }> | null };

  const stageIdx = (s: string) => STAGES.indexOf(s as Stage);
  const byStage: Record<string, number> = {};
  for (const o of list) if (o.status === 'open') byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;

  // Contacted = a person has gone past the raw signal; in service = routed to a service or beyond.
  const live = list.filter((o) => o.status !== 'lost');
  const now = Date.now();
  const followUps = list
    .filter((o) => o.status === 'open' && o.next_action_at && new Date(o.next_action_at).getTime() <= now + 24 * 3600_000)
    .sort((a, b) => new Date(a.next_action_at as string).getTime() - new Date(b.next_action_at as string).getTime())
    .slice(0, 25)
    .map((o) => ({ id: o.id, lead_id: o.lead_id, stage: o.stage, next_action: o.next_action, next_action_at: o.next_action_at, intent_score: o.intent_score, authorization_status: o.authorization_status }));

  const money = (rev ?? []).filter((r) => r.status !== 'void');
  return {
    identified: list.length,
    contacted: live.filter((o) => stageIdx(o.stage) >= stageIdx('permission')).length,
    qualified: live.filter((o) => stageIdx(o.stage) >= stageIdx('qualified')).length,
    inService: live.filter((o) => stageIdx(o.stage) >= stageIdx('routed')).length,
    invoiced: money.reduce((n, r) => n + Number(r.invoiced || 0), 0),
    collected: money.reduce((n, r) => n + Number(r.collected || 0), 0),
    cost: money.reduce((n, r) => n + Number(r.cost || 0), 0),
    byStage,
    followUps,
  };
}

/** Scans past text replies for seller signals. With dryRun it only reports what it would flag. */
export async function backfillSellerSignals(db: Db, opts: { organizationId: string | null; dryRun: boolean }) {
  const { detectSellerIntent } = await import('./sellerIntent');
  const found: Array<{ leadId: string; text: string; level: string; score: number }> = [];
  let scanned = 0;
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from('outreach_history').select('lead_id, metadata, sent_at').eq('channel', 'sms')
      .eq('metadata->>direction', 'inbound').not('lead_id', 'is', null).order('sent_at', { ascending: true }).range(from, from + 999);
    if (!data?.length) break;
    for (const row of data) {
      scanned++;
      const text = String((row.metadata as { body?: string } | null)?.body ?? '');
      const intent = detectSellerIntent(text);
      if (intent.level !== 'none') found.push({ leadId: row.lead_id as string, text, level: intent.level, score: intent.score });
    }
    if (data.length < 1000) break;
  }
  let created = 0;
  if (!opts.dryRun) {
    for (const f of found) {
      const result = await recordSellerSignal(db, { leadId: f.leadId, source: 'sms_reply_backfill', text: f.text, intent: detectSellerIntent(f.text), organizationId: opts.organizationId });
      if (result?.created) created++;
    }
  }
  return { scanned, flagged: found.length, created, samples: found.slice(0, 15) };
}
