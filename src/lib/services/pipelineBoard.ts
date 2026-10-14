import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

export type StageKey = 'prospect' | 'queued' | 'texted' | 'engaged' | 'hot' | 'human' | 'contract' | 'live' | 'unreachable' | 'closed';

export interface StageDef { key: StageKey; label: string; hint: string; manual: boolean; leadStage: string | null }

/** Columns left to right. Manual columns are set by a person; the rest follow what happens to the text automatically. */
export const BOARD_STAGES: StageDef[] = [
  { key: 'prospect', label: 'Prospects', hint: 'Scored leads not texted yet', manual: false, leadStage: null },
  { key: 'queued', label: 'Queued', hint: 'A text is scheduled and has not gone out', manual: false, leadStage: null },
  { key: 'texted', label: 'Texted', hint: 'Text sent, no reaction yet', manual: false, leadStage: null },
  { key: 'engaged', label: 'Engaged', hint: 'Opened the link or viewed the estimate', manual: false, leadStage: null },
  { key: 'hot', label: 'Hot', hint: 'Said YES, submitted the form or asked for a call', manual: false, leadStage: null },
  { key: 'human', label: 'Human Outreach', hint: 'A person is following up', manual: true, leadStage: 'human_outreach' },
  { key: 'contract', label: 'Under Contract', hint: 'Agreement in progress', manual: true, leadStage: 'Under Contract' },
  { key: 'live', label: 'Live', hint: 'Property is live', manual: true, leadStage: 'Live' },
  { key: 'unreachable', label: 'Unreachable', hint: 'The text could not be delivered', manual: false, leadStage: null },
  { key: 'closed', label: 'Closed Out', hint: 'Opted out, said no, or not a fit', manual: true, leadStage: 'Not a Fit' },
];

export interface BoardFilters { q?: string; state?: string; program?: string; minScore?: number; sort?: 'score' | 'activity' | 'net'; mine?: string | null; luxury?: boolean; hasPhone?: boolean }

const CARD_COLUMNS = 'id,address,city,state,zip,beds,baths,prospect_score,estimated_net_monthly,owner,has_phone,program,luxury,manual_stage,board_stage,batch,twilio_status,phone_quality,human_clicks,estimate_viewed,deepest_step,reply_intent,reply_text,reply_at,temperature,last_activity,last_activity_at,scheduled_for,updated_at,escalated_at,assigned_agent_name,has_location,geocode_source';

function apply(q: any, f: BoardFilters) {
  if (f.state) q = q.eq('state', f.state.toUpperCase());
  if (f.program) q = q.eq('program', f.program);
  if (f.minScore) q = q.gte('prospect_score', f.minScore);
  if (f.mine) q = q.eq('primary_agent_id', f.mine);
  if (f.luxury) q = q.eq('luxury', true);
  if (f.hasPhone) q = q.eq('has_phone', true);
  const term = (f.q ?? '').replace(/[^\w\s.\-#]/g, ' ').trim().slice(0, 60);
  if (term) q = q.or(`address.ilike.%${term}%,city.ilike.%${term}%,owner.ilike.%${term}%,zip.ilike.${term}%`);
  return q;
}

const ago = (t: string | null) => { if (!t) return null; const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60_000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

/** One short line telling an agent what happened most recently on the card. */
function summary(r: Row): string {
  if (r.reply_text) return `Replied: "${String(r.reply_text).slice(0, 80)}"`;
  if (r.contact_requested_at) return 'Asked for a call';
  if (r.estimate_viewed) return `Viewed the estimate${r.deepest_step ? ` (reached ${r.deepest_step})` : ''}`;
  if (r.human_clicks > 0) return `Opened the link ${r.human_clicks} time${r.human_clicks === 1 ? '' : 's'}`;
  if (r.board_stage === 'queued' && r.scheduled_for) return `Text scheduled for ${new Date(r.scheduled_for).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  if (r.board_stage === 'unreachable') return `Text ${r.twilio_status ?? 'failed'}${r.phone_quality ? ` (${String(r.phone_quality).replace(/_/g, ' ')})` : ''}`;
  if (r.twilio_status) return `Text ${r.twilio_status}`;
  if (r.board_stage === 'closed') return r.manual_stage === 'Not a Fit' ? 'Marked not a fit' : 'Opted out or said no';
  if (r.escalation_reason) return String(r.escalation_reason);
  return r.has_phone ? 'Has a phone number, not texted' : 'No phone number yet';
}

export function toCard(r: Row) {
  return {
    id: String(r.id), address: r.address, city: r.city, state: r.state, zip: r.zip, beds: r.beds, baths: r.baths, score: r.prospect_score ?? 0,
    netMonthly: r.estimated_net_monthly ?? null, owner: r.owner ?? null, hasPhone: !!r.has_phone, program: r.program ?? null, luxury: !!r.luxury,
    stage: r.board_stage as StageKey, manual: !!r.manual_stage && ['human_outreach', 'Under Contract', 'Live', 'Not a Fit'].includes(r.manual_stage),
    batch: r.batch ?? null, temperature: r.temperature ?? null, summary: summary(r), activityAt: r.last_activity_at ?? r.updated_at ?? null, activityAgo: ago(r.last_activity_at ?? r.updated_at ?? null),
    replied: !!r.reply_intent, assignedTo: r.assigned_agent_name ?? null, located: !!r.has_location, approximate: !!r.geocode_source && r.geocode_source !== 'census',
  };
}

export async function boardColumns(db: Db, f: BoardFilters, perColumn: number) {
  const sort = f.sort ?? 'score';
  const results = await Promise.all(BOARD_STAGES.map(async s => {
    let q = apply(db.from('pipeline_board_leads').select(CARD_COLUMNS, { count: 'exact' }).eq('board_stage', s.key), f);
    q = sort === 'activity' ? q.order('last_activity_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false }) : sort === 'net' ? q.order('estimated_net_monthly', { ascending: false, nullsFirst: false }) : q.order('prospect_score', { ascending: false, nullsFirst: false });
    const { data, count, error } = await q.order('id').range(0, perColumn - 1);
    if (error) throw new Error(error.message);
    return { ...s, count: count ?? 0, cards: (data ?? []).map(toCard) };
  }));
  return results;
}

export async function boardMore(db: Db, stage: StageKey, f: BoardFilters, offset: number, limit: number) {
  const sort = f.sort ?? 'score';
  let q = apply(db.from('pipeline_board_leads').select(CARD_COLUMNS).eq('board_stage', stage), f);
  q = sort === 'activity' ? q.order('last_activity_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false }) : sort === 'net' ? q.order('estimated_net_monthly', { ascending: false, nullsFirst: false }) : q.order('prospect_score', { ascending: false, nullsFirst: false });
  const { data, error } = await q.order('id').range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toCard);
}

export async function leadDetail(db: Db, id: string) {
  const [{ data: view }, { data: lead }, { data: history }, { data: journey }] = await Promise.all([
    db.from('pipeline_board_leads').select('*').eq('id', id).maybeSingle(),
    db.from('leads').select('contact_name,contact_phone,verified_number,owner_name,notes,listing_url,regulation_status,estimated_adr,estimated_occupancy,estimated_gross_monthly,estimated_net_monthly,beds,baths,square_feet,year_built,property_type,tags,price,price_type,lat,lng').eq('id', id).maybeSingle(),
    db.from('outreach_history').select('channel,subject,body_preview,status,sent_at,delivered_at,opened_at,replied_at,reply_snippet,failure_reason,metadata').eq('lead_id', id).order('sent_at', { ascending: false, nullsFirst: false }).limit(25),
    db.from('estimate_journey_events').select('event,data,created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(40),
  ]);
  if (!view) return null;
  const events: Array<{ at: string; kind: string; title: string; text?: string }> = [];
  for (const h of history ?? []) {
    const kind = h.channel === 'sms' ? 'sms' : 'email';
    const at = h.sent_at ?? h.delivered_at; if (at) events.push({ at, kind, title: kind === 'sms' ? `Text ${h.status ?? 'sent'}` : `Email ${h.status ?? 'sent'}${h.subject ? `: ${h.subject}` : ''}`, text: h.body_preview ?? undefined });
    if (h.delivered_at && kind === 'sms') events.push({ at: h.delivered_at, kind: 'delivered', title: 'Text delivered' });
    if (h.opened_at) events.push({ at: h.opened_at, kind: 'open', title: 'Opened' });
    if (h.replied_at) events.push({ at: h.replied_at, kind: 'reply', title: 'Replied', text: h.reply_snippet ?? undefined });
  }
  if (view.reply_at && view.reply_text && !events.some(e => e.kind === 'reply' && e.at === view.reply_at)) events.push({ at: view.reply_at, kind: 'reply', title: `Replied ${String(view.reply_intent ?? '').toUpperCase()}`.trim(), text: view.reply_text });
  for (const j of journey ?? []) events.push({ at: j.created_at, kind: 'journey', title: String(j.event).replace(/_/g, ' ') });
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return {
    card: toCard(view),
    lead: { ...lead, phone: lead?.verified_number || lead?.contact_phone || null },
    engagement: { batch: view.batch, audience: view.audience, twilioStatus: view.twilio_status, phoneQuality: view.phone_quality, humanClicks: view.human_clicks, viewed: view.estimate_viewed, deepestStep: view.deepest_step, temperature: view.temperature, score: view.engagement_score, scheduledFor: view.scheduled_for },
    version: view.version ?? 1, manualStage: view.manual_stage, events: events.slice(0, 60),
  };
}

const MOVES: Record<string, string> = { human: 'human_outreach', contract: 'Under Contract', live: 'Live', closed: 'Not a Fit', auto: 'New Lead' };

export async function moveLead(db: Db, id: string, to: string) {
  const stage = MOVES[to]; if (!stage) return { ok: false as const, status: 400, error: 'That column is filled in automatically and cannot be set by hand.' };
  const { data: cur } = await db.from('leads').select('stage,version').eq('id', id).maybeSingle();
  if (!cur) return { ok: false as const, status: 404, error: 'Lead not found.' };
  if (cur.stage === stage) return { ok: true as const, stage, unchanged: true };
  const version = Number(cur.version ?? 1); const now = new Date().toISOString();
  const patch: Row = { stage, updated_at: now, version: version + 1 };
  if (to === 'human') { patch.escalated_at = now; patch.escalation_reason = 'Moved to Human Outreach from the Pipeline Board'; }
  const { data, error } = await db.from('leads').update(patch).eq('id', id).eq('version', version).select('id');
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data?.length) return { ok: false as const, status: 409, error: 'This lead was just changed by someone else. Refresh and try again.' };
  return { ok: true as const, stage, unchanged: false };
}
