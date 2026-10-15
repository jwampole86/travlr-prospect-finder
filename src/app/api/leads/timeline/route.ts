import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { LeadRecordData, RecordCall, RecordEngagement, RecordLead, TimelineEvent } from '@/lib/leadRecordTypes';

type Row = Record<string, any>;
const str = (v: unknown, n = 4000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const iso = (v: unknown) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/** GET /api/leads/timeline?leadId=  Everything recorded about one lead: details, texts, emails, calls, notes, stage changes and how they engaged with their estimate. */
export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('leadId') ?? '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const [leadRes, activityRes, outreachRes, contactRes, callsRes, engRes] = await Promise.all([
    db.from('leads').select('id,address,city,state,zip,stage,pipeline_status,prospect_score,regulation_status,program,luxury,contact_name,owner_name,contact_phone,verified_number,verified_owner,beds,baths,price,price_type,listing_url,notes,tags,last_contacted_at,next_followup_due,primary_agent_name,assigned_agent_name,created_at,sms_opted_out_at').eq('id', leadId).maybeSingle(),
    db.from('activity_events').select('id,event_type,description,detail,previous_value,new_value,actor_email,source,event_timestamp').eq('lead_id', leadId).order('event_timestamp', { ascending: false }).limit(150),
    db.from('outreach_history').select('id,channel,subject,body_preview,full_body,status,failure_reason,reply_detected,reply_snippet,sent_at,delivered_at,opened_at,replied_at,metadata').eq('lead_id', leadId).order('sent_at', { ascending: false }).limit(150),
    db.from('contact_history').select('*').eq('lead_id', leadId).order('contacted_at', { ascending: false }).limit(100),
    db.from('call_sessions').select('id,started_at,duration_seconds,call_outcome,outcome,call_summary,disposition_notes,agent_name,recording_url,transcript').eq('lead_id', leadId).order('started_at', { ascending: false }).limit(50),
    db.from('sms_lead_engagement').select('range_text,delivered_at,first_click_at,estimate_viewed,time_on_page_s,report_downloaded,chat_questions,reply_at,reply_text,reply_intent,temperature,contact_requested_at,estimate_submitted_at').eq('lead_id', leadId).order('updated_at', { ascending: false }).limit(1),
  ]);

  const l = leadRes.data as Row | null;
  if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const lead: RecordLead = {
    id: l.id, address: l.address ?? '', city: l.city ?? null, state: l.state ?? null, zip: l.zip ?? null, stage: l.stage ?? null, pipelineStatus: l.pipeline_status ?? null,
    score: Number.isFinite(l.prospect_score) ? l.prospect_score : null, regulation: l.regulation_status ?? null, program: l.program ?? null, luxury: l.luxury === true,
    contactName: l.contact_name ?? null, ownerName: l.owner_name ?? null, phone: l.contact_phone ?? null, phoneVerified: l.verified_number === true, ownerVerified: l.verified_owner === true,
    beds: l.beds ?? null, baths: l.baths ?? null, price: l.price ?? null, priceType: l.price_type ?? null, listingUrl: l.listing_url ?? null, notes: str(l.notes, 1500),
    tags: Array.isArray(l.tags) ? l.tags.filter((t: string) => !String(t).startsWith('sms:phone:')) : [], lastContactedAt: iso(l.last_contacted_at), nextFollowupDue: iso(l.next_followup_due),
    agentName: l.primary_agent_name ?? l.assigned_agent_name ?? null, createdAt: iso(l.created_at), smsOptedOut: !!l.sms_opted_out_at,
  };

  const e = (engRes.data?.[0] ?? null) as Row | null;
  const engagement: RecordEngagement | null = e ? {
    rangeText: e.range_text ?? null, delivered: !!e.delivered_at, clicked: !!e.first_click_at, viewed: e.estimate_viewed === true, timeOnPage: Number.isFinite(e.time_on_page_s) ? e.time_on_page_s : null,
    downloaded: e.report_downloaded === true, chatQuestions: Number(e.chat_questions) || 0, replyText: str(e.reply_text, 400), replyIntent: e.reply_intent ?? null, temperature: e.temperature ?? null,
    contactRequested: !!(e.contact_requested_at || e.estimate_submitted_at),
  } : null;

  const timeline: TimelineEvent[] = [];
  let replies = 0; let texts = 0; let emails = 0; let notes = 0;

  for (const a of (activityRes.data ?? []) as Row[]) {
    const at = iso(a.event_timestamp); if (!at) continue;
    const t = String(a.event_type);
    const isNote = t === 'note_added' || t === 'note_edited';
    if (isNote) notes++;
    timeline.push({ id: `a-${a.id}`, kind: isNote ? 'note' : t === 'stage_changed' ? 'stage' : 'system', at, title: a.description, body: str(a.detail), by: a.actor_email ?? null,
      meta: t === 'stage_changed' ? { from: a.previous_value ?? null, to: a.new_value ?? null } : undefined });
  }

  for (const o of (outreachRes.data ?? []) as Row[]) {
    const at = iso(o.sent_at); if (!at) continue;
    const ch = String(o.channel);
    const kind = ch === 'sms' ? 'sms' : 'email';
    if (kind === 'sms') texts++; else emails++;
    const md = (o.metadata ?? {}) as Row;
    const body = str(md.message ?? o.full_body ?? o.body_preview);
    timeline.push({ id: `o-${o.id}`, kind, at, title: kind === 'sms' ? 'Text sent' : (str(o.subject, 120) ?? 'Email sent'), body, status: o.failure_reason ? `failed: ${o.failure_reason}` : (md.twilio_status ?? o.status ?? null),
      meta: { campaign: md.campaign_name ?? md.batch ?? null, delivered: !!o.delivered_at, opened: !!o.opened_at } });
    if (o.reply_detected || o.replied_at) {
      replies++;
      const snippet = str(o.reply_snippet, 600);
      if (snippet) timeline.push({ id: `r-${o.id}`, kind, at: iso(o.replied_at) ?? at, title: 'Reply received', body: snippet, status: 'replied' });
    }
  }

  for (const c of (contactRes.data ?? []) as Row[]) {
    const at = iso(c.contacted_at); if (!at) continue;
    const kind = c.type === 'call' ? 'call' : c.type === 'text' ? 'sms' : c.type === 'email' ? 'email' : 'note';
    timeline.push({ id: `c-${c.id}`, kind, at, title: str(c.subject, 140) ?? `${c.type} logged`, body: str(c.body), status: c.outcome ?? null });
  }

  const calls: RecordCall[] = [];
  for (const c of (callsRes.data ?? []) as Row[]) {
    const at = iso(c.started_at); if (!at) continue;
    const transcript = Array.isArray(c.transcript) ? c.transcript.filter((t: Row) => t?.text).slice(0, 200).map((t: Row) => ({ speaker: String(t.speaker ?? ''), text: String(t.text) })) : [];
    calls.push({ id: c.id, startedAt: at, durationSeconds: Number.isFinite(c.duration_seconds) ? c.duration_seconds : null, outcome: c.call_outcome ?? c.outcome ?? null, summary: str(c.call_summary ?? c.disposition_notes), agent: c.agent_name ?? null, recordingUrl: c.recording_url ?? null, transcript });
    timeline.push({ id: `k-${c.id}`, kind: 'call', at, title: `Call${c.call_outcome || c.outcome ? ` · ${c.call_outcome || c.outcome}` : ''}`, body: str(c.call_summary ?? c.disposition_notes), by: c.agent_name ?? null, meta: { seconds: c.duration_seconds ?? null } });
  }

  if (e) {
    const add = (when: unknown, id: string, title: string, body?: string | null) => { const at = iso(when); if (at) timeline.push({ id: `e-${id}`, kind: 'engagement', at, title, body }); };
    add(e.first_click_at, 'click', 'Opened their estimate link');
    if (e.estimate_viewed) add(e.first_click_at, 'view', 'Viewed their estimate', e.time_on_page_s ? `About ${Math.round(e.time_on_page_s)} seconds on the page` : null);
    add(e.contact_requested_at ?? e.estimate_submitted_at, 'ask', 'Asked to be contacted');
    if (e.reply_text) { if (!replies) replies++; add(e.reply_at, 'reply', 'Replied by text', str(e.reply_text, 400)); }
  }

  timeline.sort((a, b) => b.at.localeCompare(a.at));
  const data: LeadRecordData = { lead, engagement, timeline, calls, counts: { texts, emails, calls: calls.length, notes, replies } };
  return NextResponse.json(data);
}

const STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];

/** POST { leadId, action: 'note', text } or { leadId, action: 'stage', stage }. Writes to the lead and the activity log. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { leadId?: string; action?: string; text?: string; stage?: string } | null;
  const leadId = body?.leadId ?? '';
  if (!leadId || !body?.action) return NextResponse.json({ error: 'leadId and action are required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: lead } = await db.from('leads').select('id,address,state,stage').eq('id', leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const actor = auth.actor;
  const base = { user_id: actor.user.id, lead_id: leadId, lead_address: lead.address, lead_state: lead.state, actor_user_id: actor.user.id, actor_email: actor.user.email ?? null, source: 'lead_record', event_timestamp: new Date().toISOString() };

  if (body.action === 'note') {
    const text = String(body.text ?? '').trim().slice(0, 4000);
    if (!text) return NextResponse.json({ error: 'Write a note first' }, { status: 400 });
    const { error } = await db.from('activity_events').insert({ ...base, event_type: 'note_added', description: 'Note added', detail: text, metadata: {} });
    if (error) return NextResponse.json({ error: 'Could not save the note' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'stage') {
    const stage = String(body.stage ?? '');
    if (!STAGES.includes(stage)) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
    const { error } = await db.from('leads').update({ stage }).eq('id', leadId);
    if (error) return NextResponse.json({ error: 'Could not change the stage' }, { status: 500 });
    const eventType = stage === 'Live' ? 'live_status' : 'stage_changed';
    await db.from('activity_events').insert({ ...base, event_type: eventType, description: stage === 'Live' ? `${lead.address} marked Live` : `${lead.address} moved to ${stage}`, detail: `${lead.stage ?? 'none'} → ${stage}`, previous_value: lead.stage ?? null, new_value: stage, metadata: {} });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
