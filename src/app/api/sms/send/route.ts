import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchSMS, isTwilioConfigured } from '@/lib/services/twilioService';
import { injectTrackedLinks } from '@/lib/services/linkTrackingService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, to, message, templateId, sequenceStepId, sequenceId, sequenceName, agentId, portfolio, bulkBatch } = body;

    if (!leadId || !to || !message) {
      return NextResponse.json({ error: 'leadId, to, and message are required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ── TCPA / Do-Not-Contact compliance guard ────────────────────────────────
    // Block SMS dispatch if the lead has do_not_contact set, or if the
    // enrichment record marks them as do_not_contact. This guard runs before
    // any Twilio call so no SMS is ever sent to a blocked contact.
    const { data: leadRow } = await supabase
      .from('leads')
      .select('do_not_contact, address')
      .eq('id', leadId)
      .single();

    if (leadRow?.do_not_contact === true) {
      // Log the blocked attempt for audit purposes
      await supabase.from('outreach_history').insert({
        lead_id: leadId,
        channel: 'sms',
        template_id: templateId ?? null,
        sequence_step_id: sequenceStepId ?? null,
        agent_id: agentId ?? null,
        status: 'blocked_dnc',
        sent_at: new Date().toISOString(),
        metadata: {
          to,
          block_reason: 'do_not_contact flag is set on this lead',
          bulk_batch: bulkBatch ?? false,
        },
      });

      return NextResponse.json(
        {
          success: false,
          status: 'blocked_dnc',
          error: 'SMS blocked: this lead has Do Not Contact set. Remove the flag before sending outreach.',
          twilioConfigured: isTwilioConfigured(),
        },
        { status: 422 }
      );
    }

    // Also check enrichment table for do_not_contact
    const { data: enrichmentRow } = await supabase
      .from('lead_enrichments')
      .select('do_not_contact')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (enrichmentRow?.do_not_contact === true) {
      await supabase.from('outreach_history').insert({
        lead_id: leadId,
        channel: 'sms',
        template_id: templateId ?? null,
        sequence_step_id: sequenceStepId ?? null,
        agent_id: agentId ?? null,
        status: 'blocked_dnc',
        sent_at: new Date().toISOString(),
        metadata: {
          to,
          block_reason: 'do_not_contact flag is set in enrichment record',
          bulk_batch: bulkBatch ?? false,
        },
      });

      return NextResponse.json(
        {
          success: false,
          status: 'blocked_dnc',
          error: 'SMS blocked: enrichment record has Do Not Contact set.',
          twilioConfigured: isTwilioConfigured(),
        },
        { status: 422 }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Inject tracked short links into the message body
    const { body: trackedMessage, tokens } = await injectTrackedLinks(message, {
      leadId,
      sequenceId: sequenceId ?? sequenceStepId,
      sequenceName: sequenceName ?? undefined,
      agentId: agentId ?? undefined,
      portfolio: portfolio ?? undefined,
    });

    // Dispatch via Twilio (or placeholder)
    const result = await dispatchSMS({
      to,
      body: trackedMessage,
      leadId,
      templateId,
      sequenceStepId,
      agentId,
      metadata: { bulkBatch },
    });

    const deliveryStatus = result.status === 'placeholder' ? 'queued' : result.success ? 'sent' : 'failed';

    await supabase.from('outreach_history').insert({
      lead_id: leadId,
      channel: 'sms',
      template_id: templateId ?? null,
      sequence_step_id: sequenceStepId ?? null,
      agent_id: agentId ?? null,
      status: deliveryStatus,
      sent_at: new Date().toISOString(),
      metadata: {
        to,
        message_sid: result.messageSid,
        twilio_configured: result.twilioConfigured,
        twilio_status: result.status,
        error: result.error ?? null,
        bulk_batch: bulkBatch ?? false,
        tracked_link_tokens: tokens,
        original_message: message,
        tracked_message: trackedMessage,
      },
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      messageSid: result.messageSid,
      twilioConfigured: isTwilioConfigured(),
      placeholderMode: result.status === 'placeholder',
      trackedLinks: tokens.length,
    });
  } catch (err) {
    console.error('[SMS Send API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    twilioConfigured: isTwilioConfigured(),
    message: isTwilioConfigured()
      ? 'Twilio is configured and ready' :'Twilio placeholder mode — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to activate',
    complianceNote: 'All SMS sends are subject to TCPA compliance checks. Leads with do_not_contact=true are automatically blocked.',
  });
}
