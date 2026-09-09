'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';

/**
 * Twilio Voice outbound call initiation endpoint.
 * Logs the call attempt and returns TwiML or a call SID.
 * DNC check: if the lead is flagged do_not_contact, the call is blocked.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { to, from, leadId, agentId } = body as {
      to?: string;
      from?: string;
      leadId?: string;
      agentId?: string;
    };

    if (!to) {
      return NextResponse.json({ error: 'Missing required field: to' }, { status: 400 });
    }

    // ── DNC Check ─────────────────────────────────────────────────────────────
    // Block the call if the lead is flagged Do Not Contact.
    // This mirrors the same check in /api/sms/send/route.ts.
    if (leadId) {
      try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceRoleKey && !serviceRoleKey.includes('your-supabase-service-role-key')
            ? serviceRoleKey
            : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Check leads table
        const { data: lead } = await supabase
          .from('leads')
          .select('do_not_contact')
          .eq('id', leadId)
          .single();

        if (lead?.do_not_contact) {
          // Log the blocked attempt to outreach_history
          await supabase.from('outreach_history').insert({
            lead_id: leadId,
            agent_id: agentId || null,
            channel: 'call',
            status: 'blocked_dnc',
            message_body: `Outbound call to ${to} blocked — Do Not Contact flag set`,
            sent_at: new Date().toISOString(),
          }).catch(() => {});

          return NextResponse.json(
            {
              error: 'Call blocked — this lead is flagged Do Not Contact',
              status: 'blocked_dnc',
              leadId,
            },
            { status: 422 }
          );
        }

        // Also check lead_enrichments for DNC flag
        const { data: enrichment } = await supabase
          .from('lead_enrichments')
          .select('do_not_contact')
          .eq('lead_id', leadId)
          .maybeSingle();

        if (enrichment?.do_not_contact) {
          await supabase.from('outreach_history').insert({
            lead_id: leadId,
            agent_id: agentId || null,
            channel: 'call',
            status: 'blocked_dnc',
            message_body: `Outbound call to ${to} blocked — Do Not Contact flag set (enrichment)`,
            sent_at: new Date().toISOString(),
          }).catch(() => {});

          return NextResponse.json(
            {
              error: 'Call blocked — this lead is flagged Do Not Contact (enrichment data)',
              status: 'blocked_dnc',
              leadId,
            },
            { status: 422 }
          );
        }
      } catch (dncErr) {
        // DNC check failure should NOT silently allow the call — log and block
        console.error('[TwilioVoiceCall] DNC check error:', dncErr);
        return NextResponse.json(
          { error: 'Could not verify Do Not Contact status — call blocked for safety', status: 'dnc_check_failed' },
          { status: 500 }
        );
      }
    }
    // ── End DNC Check ─────────────────────────────────────────────────────────

    const fromNumber = from || process.env.TWILIO_FROM_NUMBER;
    const status = getTwilioConfigStatus();

    if (!status.voiceCallConfigured || !fromNumber || fromNumber.startsWith('your-')) {
      // Placeholder — log intent, return mock call SID
      console.info('[TwilioVoice] Placeholder mode — call not placed. Configure Twilio credentials.');
      return NextResponse.json({
        callSid: `placeholder-${Date.now()}`,
        status: 'placeholder',
        configured: false,
        missing: status.missing,
        leadId,
        agentId,
      });
    }

    const authSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const accountSid = authSid.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN! : authSid;
    const credentials = Buffer.from(`${authSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber!,
          // TwiML URL — record both legs for transcription
          Url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/twilio/voice/twiml`,
          Record: 'true',
          RecordingChannels: 'dual',
        }).toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || 'Twilio call failed', configured: true },
        { status: response.status }
      );
    }

    return NextResponse.json({
      callSid: data.sid,
      status: data.status,
      configured: true,
      leadId,
      agentId,
    });
  } catch (err) {
    console.error('[TwilioVoiceCall] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
