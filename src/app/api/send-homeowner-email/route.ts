import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, message, leadId, agentId, propertyAddress } = body;

    if (!to || !message || !leadId) {
      return NextResponse.json({ error: 'Missing required fields: to, message, leadId' }, { status: 400 });
    }

    const emailSubject = subject || `TRAVLR Vacation Homes — ${propertyAddress}`;
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br/>');
    const { data, error } = await getResendClient().emails.send({
      from: getResendFrom(),
      to: [to],
      subject: emailSubject,
      text: message,
      html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
          <p style="white-space: pre-wrap; line-height: 1.7; font-size: 15px;">${escapedMessage}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">TRAVLR Vacation Homes · <a href="https://staytrvlr.com" style="color: #6366f1;">staytrvlr.com</a></p>
        </div>`,
    });

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to send email' }, { status: 500 });
    }

    // Log to outreach_history using service role (server-side)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const serviceKey = serviceRoleKey && !serviceRoleKey.includes('your-supabase-service-role-key')
      ? serviceRoleKey
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      await supabase.from('outreach_history').insert({
          lead_id: leadId,
          channel: 'email',
          subject: emailSubject,
          body_preview: message.slice(0, 200),
          full_body: message,
          status: 'sent',
          recipient_email: to,
          agent_id: agentId || null,
          sent_at: new Date().toISOString(),
          metadata: { resend_id: data?.id, property_address: propertyAddress },
        });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
