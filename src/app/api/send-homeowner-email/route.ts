import { NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, message, leadId, agentId, propertyAddress } = body;

    if (!to || !message || !leadId) {
      return NextResponse.json({ error: 'Missing required fields: to, message, leadId' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    // Send email via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [to],
        subject: subject || `TRAVLR Vacation Homes — ${propertyAddress}`,
        text: message,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
          <p style="white-space: pre-wrap; line-height: 1.7; font-size: 15px;">${message.replace(/\n/g, '<br/>')}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">TRAVLR Vacation Homes · <a href="https://staytrvlr.com" style="color: #6366f1;">staytrvlr.com</a></p>
        </div>`,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return NextResponse.json({ error: resendData.message || 'Failed to send email' }, { status: 500 });
    }

    // Log to outreach_history using service role (server-side)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/outreach_history`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          lead_id: leadId,
          channel: 'email',
          subject: subject || `TRAVLR Vacation Homes — ${propertyAddress}`,
          body_preview: message.slice(0, 200),
          full_body: message,
          status: 'sent',
          recipient_email: to,
          agent_id: agentId || null,
          sent_at: new Date().toISOString(),
          metadata: { resend_id: resendData.id, property_address: propertyAddress },
        }),
      });
    }

    return NextResponse.json({ success: true, id: resendData.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
