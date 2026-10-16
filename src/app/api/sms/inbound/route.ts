import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyReply, findLeadByPhone, isWrongContact, notifyAdmins, recordOptIn, recordOptOut, toE164, verifyTwilioSignature } from '@/lib/services/smsConsent';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';
import { sendReplyAlert, sendTeamAlert } from '@/lib/services/replyAlerts';
import { advancePipeline } from '@/lib/services/leadPipeline';
import { scheduleYesFollowup } from '@/lib/services/yesFollowup';
import { looksLikeQuestion, questionReply } from '@/lib/services/smsQuestionReply';
import { hoaReply, isHoaObjection } from '@/lib/services/smsHoaReply';

/**
 * POST /api/sms/inbound
 * Twilio inbound SMS webhook. Set this URL on the Messaging Service (or the number) in Twilio.
 *
 * YES  -> records SMS consent (only if Twilio's signature checks out) and hands the lead to a human.
 * NO / STOP / anything that sounds like a refusal -> records the opt-out and suppresses the number.
 * Opt-outs are honoured even when the signature cannot be verified; consent is never granted without it.
 */
export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();

  const raw = await req.text();
  let body: Record<string, string> = {};
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    try { body = JSON.parse(raw); } catch { body = {}; }
  } else {
    new URLSearchParams(raw).forEach((v, k) => { body[k] = v; });
  }

  const from = body.From || body.from || '';
  const text = (body.Body || body.body || '').trim();
  const messageSid = body.MessageSid || body.messageSid || '';
  if (!from || !text) return NextResponse.json({ error: 'Missing From or Body' }, { status: 400 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const verified = verifyTwilioSignature(`${site}/api/sms/inbound`, body, req.headers.get('x-twilio-signature'));
  const trusted = verified === true;

  const intent = classifyReply(text);
  const lead = await findLeadByPhone(db, from);
  const now = new Date().toISOString();

  await db.from('outreach_history').insert({
    lead_id: lead?.id ?? null, channel: 'sms', status: 'replied', sent_at: now,
    metadata: { direction: 'inbound', from, body: text.slice(0, 1000), message_sid: messageSid, intent, lead_found: !!lead, signature_verified: verified },
  });

  // Conversation thread for the agent inbox.
  let threadId: string | null = null;
  const { data: thread } = await db.from('sms_conversation_threads').select('id, unread_count').eq('phone', from).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (thread) {
    threadId = thread.id;
    await db.from('sms_conversation_threads').update({ last_inbound_at: now, last_message_preview: text.slice(0, 100), unread_count: (thread.unread_count ?? 0) + 1, updated_at: now }).eq('id', thread.id);
  } else {
    const { data: created } = await db.from('sms_conversation_threads').insert({
      lead_id: lead?.id ?? null, phone: from, contact_name: lead?.contact_name ?? null, conversation_status: 'pending',
      last_inbound_at: now, last_message_preview: text.slice(0, 100), unread_count: 1,
    }).select('id').single();
    threadId = created?.id ?? null;
  }
  if (threadId) await db.from('sms_thread_messages').insert({ thread_id: threadId, direction: 'inbound', body: text, twilio_message_sid: messageSid || null, status: 'received' });

  const log = (event_type: string, title: string, severity = 'info') => lead
    ? db.from('admin_event_log').insert({ event_type, event_category: 'lead_change', lead_id: lead.id, title, description: `"${text.slice(0, 100)}" from ${from}`, severity, event_timestamp: now })
    : Promise.resolve();

  let reply = '';

  if (lead) {
    if (intent === 'stop' || intent === 'no') await advancePipeline(db, lead.id, 'rejected');
    else if (intent === 'yes') await advancePipeline(db, lead.id, 'callback_scheduled');
  }
  if (intent === 'stop' || intent === 'no') {
    await recordOptOut(db, { leadId: lead?.id ?? null, phone: from, message: text });
    if (threadId) await db.from('sms_conversation_threads').update({ conversation_status: 'opted_out' }).eq('id', threadId);
    await log('sms_opt_out', 'Lead opted out of SMS');
    // Twilio sends its own confirmation for STOP keywords; "NO" is ours to answer.
    if (intent === 'no') reply = 'You are opted out and will not receive more texts from TRAVLR Vacation Homes.';
  } else if (intent === 'yes') {
    if (lead && trusted) {
      await recordOptIn(db, { leadId: lead.id, phone: from });
      await db.from('leads').update({ stage: 'human_outreach', escalated_at: now, escalation_reason: 'Replied YES to outreach text' }).eq('id', lead.id);
      await db.from('cadence_enrollments').update({ status: 'escalated', escalated_at: now, escalation_reason: 'Replied YES to outreach text' }).eq('lead_id', lead.id).eq('status', 'active');
      if (threadId) await db.from('sms_conversation_threads').update({ conversation_status: 'interested' }).eq('id', threadId);
      await log('sms_opt_in', 'Lead replied YES: SMS consent recorded', 'warning');
      await notifyAdmins(db, {
        title: 'Homeowner replied YES',
        message: `${lead.contact_name || 'A homeowner'} replied YES to the estimate text. Call them.`,
        metadata: { lead_id: lead.id, reason: 'sms_reply_yes' },
      });
      // The acknowledgment goes back at any hour; the follow-up question waits for the texting window (never before 9am Mountain).
      const first = String(lead.contact_name || '').trim().split(/\s+/)[0];
      const fu = await scheduleYesFollowup(db, lead.id, /^[A-Za-z'-]{2,}$/.test(first) ? first : null).catch(() => null);
      const later = !!fu?.ok && !!fu.sendAt && Date.parse(fu.sendAt) - Date.now() > 2 * 3_600_000;
      reply = fu?.ok
        ? `Thanks for replying YES! We'll text you ${later ? 'in the morning' : 'shortly'} to find a time for a quick call. Your free estimate: ${site}/estimate. Reply STOP anytime to opt out.`
        : `Thanks! A TRAVLR specialist will reach out shortly. Your free estimate: ${site}/estimate. Reply STOP anytime to opt out.`;
    } else if (lead) {
      // Signature could not be verified (no Twilio webhook token): alert a human, but do not record consent.
      await notifyAdmins(db, {
        title: 'Homeowner replied YES (unverified)',
        message: `${lead.contact_name || 'A homeowner'} replied YES to the estimate text. Confirm and call them. Set TWILIO_WEBHOOK_AUTH_TOKEN so replies are verified automatically.`,
        metadata: { lead_id: lead.id, reason: 'sms_reply_yes_unverified' },
      });
    }
  } else if (intent === 'help') {
    await log('sms_help_request', 'Lead requested HELP via SMS');
    reply = 'TRAVLR Vacation Homes: staytrvlr.com. Reply YES for a call about your free estimate, STOP to opt out.';
  } else if (lead && toE164(from)) {
    await db.from('leads').update({ stage: 'human_outreach', escalated_at: now, escalation_reason: 'Inbound SMS reply needs a human' }).eq('id', lead.id).in('stage', ['new', 'contacted']);
    // A question gets an answer right away at any hour; the team is alerted below either way.
    // "Our HOA does not allow it": answered from what our records show, never from a guess.
    if (trusted && intent === 'other' && !isWrongContact(text) && isHoaObjection(text)) reply = (await hoaReply(db, lead.id, from).catch(() => null)) ?? '';
    else if (trusted && intent === 'other' && !isWrongContact(text) && looksLikeQuestion(text)) reply = (await questionReply(db, lead.id, from, text).catch(() => null)) ?? '';
  }

  // The prospect score includes replies, so refresh it now instead of leaving the profile on the pre-reply number.
  if (lead && intent !== 'stop' && intent !== 'no') await rescoreLeadsByIds(db, [lead.id]).catch(() => 0);

  // Replies from a co-host prospect we texted one-to-one are tied back to their listing.
  const e164 = toE164(from);
  let cohostMarket: string | null = null;
  const { data: sentTo } = e164 ? await db.from('cohost_messages').select('property_id').eq('phone_e164', e164).eq('direction', 'outbound').order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
  if (sentTo?.property_id && e164) {
    await db.from('cohost_messages').insert({ property_id: sentTo.property_id, direction: 'inbound', phone_e164: e164, body: text.slice(0, 1000), message_sid: messageSid || null, status: 'received', intent });
    const { data: l } = await db.from('str_listings').select('pipeline_stage,market').eq('property_id', sentTo.property_id).maybeSingle();
    cohostMarket = l?.market ?? null;
    if (intent === 'stop' || intent === 'no') {
      await db.from('cohost_offer_links').update({ opted_out_at: now }).eq('property_id', sentTo.property_id);
      if (l && !['agreed', 'onboarded'].includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'declined', stage_updated_at: now }).eq('property_id', sentTo.property_id);
      await sendTeamAlert({ key: `cohost-sms-optout:${messageSid || `${e164}:${now}`}`, text: `Co-Host owner replied "${text.replace(/\s+/g, ' ').trim().slice(0, 40)}" to our text${l?.market ? ` (${l.market})` : ''}. Marked declined.`, url: `${site}/cohost?open=${encodeURIComponent(sentTo.property_id)}` });
    } else {
      if (l && ['identified', 'reviewed', 'contacted'].includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'replied', stage_updated_at: now }).eq('property_id', sentTo.property_id);
      await notifyAdmins(db, { title: 'Co-host prospect replied', message: `A co-host prospect${l?.market ? ` (${l.market})` : ''} replied: "${text.slice(0, 80)}"`, metadata: { property_id: sentTo.property_id, reason: 'cohost_sms_reply' } }).catch(() => {});
      if (!reply && intent === 'yes') reply = 'Thanks! A TRAVLR specialist will reach out shortly. Reply STOP anytime to opt out.';
    }
  }

  // A YES or a written reply needs a person, so email and text the team instead of waiting for someone to open the app. Skipped when the webhook signature is wrong.
  if (verified !== false && (intent === 'yes' || (intent === 'other' && !isWrongContact(text)))) {
    await sendReplyAlert({
      kind: intent === 'yes' ? 'yes' : 'question', from, text, name: lead?.contact_name ?? null, place: cohostMarket,
      url: sentTo?.property_id ? `${site}/cohost` : lead ? `${site}/lead-profile?id=${encodeURIComponent(lead.id)}` : `${site}/sms-delivery`,
    });
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${reply ? `<Message>${esc(reply)}</Message>` : ''}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
}

export async function GET() {
  return NextResponse.json({
    description: 'Twilio inbound SMS webhook. Configure this URL in your Twilio Messaging Service.',
    url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/sms/inbound`,
    intents: ['YES (records consent, escalates to a human)', 'NO / STOP and refusals (opt-out + number suppression)', 'HELP', 'other (escalated for a human to read)'],
  });
}
