import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { inviteId } = await req.json();

    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID required.' }, { status: 400 });
    }

    // Get the invite
    const { data: invite, error } = await supabaseAdmin
      .from('agent_invites')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }

    if (invite.status === 'completed') {
      return NextResponse.json({ error: 'Cannot resend a completed invite.' }, { status: 409 });
    }

    // Regenerate token and reset expiry
    const newToken = require('crypto').randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from('agent_invites')
      .update({
        invite_token: newToken,
        status: 'invited',
        sent_at: new Date().toISOString(),
        expires_at: newExpiry,
      })
      .eq('id', inviteId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.staytrvlr.com';
    const inviteLink = `${siteUrl}/invite/${newToken}`;

    // Resend email
    await resend.emails.send({
      from: 'TRAVLR Pro <info@staytrvlr.com>',
      to: invite.email,
      subject: `Your TRAVLR Pro invite has been refreshed`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 8px;">New invite link, ${invite.first_name}!</h1>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">Your previous invite expired. Here's a fresh one — valid for 7 days.</p>
          <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-bottom: 24px;">
            Set Up My Account →
          </a>
          <p style="color: #9ca3af; font-size: 12px;">This link expires in 7 days.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 11px;">TRAVLR Pro · Short-Term Rental Prospect Platform</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, inviteLink, newToken });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
