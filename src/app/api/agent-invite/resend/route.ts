import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const { inviteId } = await req.json();
    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: invite, error } = await supabaseAdmin
      .from('agent_invites')
      .select('id, email, first_name, role, status')
      .eq('id', inviteId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }
    if (invite.status === 'completed') {
      return NextResponse.json({ error: 'Completed invites cannot be resent.' }, { status: 409 });
    }

    const newToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('agent_invites')
      .update({
        invite_token: newToken,
        status: 'invited',
        sent_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .eq('id', inviteId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.staytrvlr.com';
    const inviteLink = `${siteUrl}/invite/${newToken}`;
    const roleLabel = invite.role === 'team_lead' ? 'Team Lead' : invite.role === 'analyst' ? 'Analyst' : invite.role === 'owner' ? 'Owner' : 'Agent';

    const { error: emailError } = await getResendClient().emails.send({
      from: getResendFrom(),
      to: invite.email,
      subject: 'Your TRAVLR Pro invite has been refreshed',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 8px;">New invite link, ${invite.first_name}!</h1>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">Your ${roleLabel} invite has been refreshed and is valid for another 7 days.</p>
          <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Accept invite →</a>
        </div>
      `,
    });

    return NextResponse.json({ success: true, inviteLink, emailSent: !emailError, emailError: emailError?.message || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
