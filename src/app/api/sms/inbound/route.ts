import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/sms/inbound
 * Twilio inbound SMS webhook.
 * Handles STOP/HELP keywords and intent detection for engagement signals.
 * Also upserts sms_conversation_threads for real-time agent thread view.
 * Configure this URL in your Twilio Messaging Service webhook settings.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let body: Record<string, string> = {};
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    params.forEach((v, k) => { body[k] = v; });
  } else {
    body = await req.json().catch(() => ({}));
  }

  const fromNumber = body['From'] || body['from'] || '';
  const messageBody = (body['Body'] || body['body'] || '').trim();
  const messageSid = body['MessageSid'] || body['messageSid'] || '';

  if (!fromNumber || !messageBody) {
    return NextResponse.json({ error: 'Missing From or Body' }, { status: 400 });
  }

  // Normalize phone for lookup
  const normalizedPhone = fromNumber.replace(/\D/g, '');

  // Find lead by phone
  const { data: lead } = await supabase
    .from('leads')
    .select('id, first_name, last_name, stage, sms_opt_in, email_opt_in')
    .or(`phone.eq.${fromNumber},phone.eq.+${normalizedPhone},phone.eq.${normalizedPhone}`)
    .limit(1)
    .maybeSingle();

  // Detect intent
  const intent = detectIntent(messageBody);

  // Log inbound message to outreach_history
  await supabase.from('outreach_history').insert({
    lead_id: lead?.id || null,
    channel: 'sms',
    status: 'inbound',
    sent_at: new Date().toISOString(),
    metadata: {
      from: fromNumber,
      body: messageBody,
      message_sid: messageSid,
      intent,
      lead_found: !!lead,
    },
  });

  // ── Upsert conversation thread ───────────────────────────────────────────
  // Find the most recent active campaign for this lead/phone
  let campaignId: string | null = null;
  if (lead?.id) {
    const { data: lastSend } = await supabase
      .from('sms_campaign_sends')
      .select('campaign_id')
      .eq('lead_id', lead.id)
      .not('campaign_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    campaignId = lastSend?.campaign_id ?? null;
  }

  // Find existing thread
  const threadQuery = campaignId
    ? supabase.from('sms_conversation_threads').select('id,unread_count').eq('campaign_id', campaignId).eq('phone', fromNumber).maybeSingle()
    : supabase.from('sms_conversation_threads').select('id,unread_count').eq('phone', fromNumber).is('campaign_id', null).maybeSingle();

  const { data: existingThread } = await threadQuery;
  let threadId: string | null = null;

  if (existingThread) {
    threadId = existingThread.id;
    await supabase.from('sms_conversation_threads').update({
      last_inbound_at: new Date().toISOString(),
      last_message_preview: messageBody.slice(0, 100),
      unread_count: (existingThread.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', threadId);
  } else {
    const { data: newThread } = await supabase.from('sms_conversation_threads').insert({
      campaign_id: campaignId,
      lead_id: lead?.id ?? null,
      phone: fromNumber,
      contact_name: lead ? `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || null : null,
      conversation_status: 'pending',
      last_inbound_at: new Date().toISOString(),
      last_message_preview: messageBody.slice(0, 100),
      unread_count: 1,
    }).select('id').single();
    threadId = newThread?.id ?? null;
  }

  // Insert message into thread
  if (threadId) {
    await supabase.from('sms_thread_messages').insert({
      thread_id: threadId,
      direction: 'inbound',
      body: messageBody,
      twilio_message_sid: messageSid || null,
      status: 'received',
    });
  }

  if (lead) {
    // Handle STOP / opt-out
    if (intent === 'stop') {
      await supabase.from('leads').update({ sms_opt_in: false }).eq('id', lead.id);
      await supabase.from('cadence_enrollments').update({ status: 'unsubscribed' }).eq('lead_id', lead.id).eq('status', 'active');
      if (threadId) {
        await supabase.from('sms_conversation_threads').update({ conversation_status: 'opted_out' }).eq('id', threadId);
      }
      await logAdminEvent(supabase, {
        event_type: 'sms_opt_out',
        lead_id: lead.id,
        title: 'Lead opted out of SMS',
        description: `Received STOP keyword from ${fromNumber}`,
      });
    }

    // Handle HELP keyword
    if (intent === 'help') {
      await logAdminEvent(supabase, {
        event_type: 'sms_help_request',
        lead_id: lead.id,
        title: 'Lead requested HELP via SMS',
        description: `Received HELP keyword from ${fromNumber}`,
      });
    }

    // Handle engagement / interested signal → escalate to human outreach
    if (intent === 'interested') {
      await supabase.from('leads').update({
        stage: 'human_outreach',
        escalated_at: new Date().toISOString(),
        escalation_reason: 'Inbound SMS reply classified as interested',
      }).eq('id', lead.id);

      await supabase.from('cadence_enrollments').update({ status: 'escalated', escalated_at: new Date().toISOString(), escalation_reason: 'Inbound SMS interest signal' }).eq('lead_id', lead.id).eq('status', 'active');

      // Update thread status to interested
      if (threadId) {
        await supabase.from('sms_conversation_threads').update({ conversation_status: 'interested' }).eq('id', threadId);
      }

      // Log analytics event
      if (campaignId) {
        await supabase.from('sms_analytics_events').insert({
          campaign_id: campaignId,
          lead_id: lead.id,
          phone: fromNumber,
          event_type: 'interested',
          reply_body: messageBody.slice(0, 500),
        });
      }

      await logAdminEvent(supabase, {
        event_type: 'escalation',
        lead_id: lead.id,
        title: 'Lead escalated to human outreach',
        description: `Inbound SMS reply classified as interested: "${messageBody.slice(0, 100)}"`,
        severity: 'warning',
        new_value: { stage: 'human_outreach', escalation_reason: 'Inbound SMS interest signal' },
      });

      // Fire escalation notification
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/cadence/notify-escalation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: lead.id,
            escalation_reason: `Inbound SMS reply classified as interested: "${messageBody.slice(0, 80)}"`,
            send_email: true,
          }),
        });
      } catch {
        await supabase.from('app_notifications').insert({
          type: 'stage_change',
          title: '🔥 Lead Ready to Call',
          message: `${lead.first_name || 'A lead'} replied to your SMS and is interested. Stage moved to Human Outreach.`,
          read: false,
          metadata: { lead_id: lead.id, escalation_reason: 'sms_reply_interested', message_preview: messageBody.slice(0, 100) },
        });
      }
    }

    // Log reply analytics event for any reply
    if (campaignId && intent !== 'stop') {
      await supabase.from('sms_analytics_events').insert({
        campaign_id: campaignId,
        lead_id: lead.id,
        phone: fromNumber,
        event_type: 'replied',
        reply_body: messageBody.slice(0, 500),
      });
    }
  }

  // Return TwiML empty response (Twilio handles STOP/HELP replies automatically)
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET() {
  return NextResponse.json({
    description: 'Twilio inbound SMS webhook — configure this URL in your Twilio Messaging Service',
    url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/sms/inbound`,
    intents: ['stop (opt-out)', 'help', 'interested (escalates to human_outreach)', 'other'],
  });
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

function detectIntent(message: string): 'stop' | 'help' | 'interested' | 'other' {
  const upper = message.toUpperCase().trim();

  if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(upper)) return 'stop';
  if (/^HELP$/.test(upper)) return 'help';

  const interestedPatterns = [
    /\byes\b/i, /\binterested\b/i, /\bsure\b/i, /\btell me more\b/i,
    /\bsounds good\b/i, /\bwant to know\b/i, /\bcall me\b/i,
    /\bmore info\b/i, /\blearn more\b/i, /\bsign me up\b/i,
    /\bwhat.s the estimate\b/i, /\bhow much\b/i,
  ];
  if (interestedPatterns.some(p => p.test(message))) return 'interested';

  return 'other';
}

async function logAdminEvent(
  supabase: ReturnType<typeof createClient>,
  data: { event_type: string; lead_id: string; title: string; description?: string; severity?: string; new_value?: Record<string, unknown> }
) {
  await supabase.from('admin_event_log').insert({
    event_type: data.event_type,
    event_category: 'lead_change',
    lead_id: data.lead_id,
    title: data.title,
    description: data.description || null,
    severity: data.severity || 'info',
    new_value: data.new_value || null,
    event_timestamp: new Date().toISOString(),
  });
}
