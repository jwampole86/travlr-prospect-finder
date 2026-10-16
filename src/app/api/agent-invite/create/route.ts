import { NextRequest, NextResponse } from 'next/server';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type InviteRole = 'owner' | 'team_lead' | 'agent' | 'analyst';
const VALID_ROLES = new Set<InviteRole>(['owner', 'team_lead', 'agent', 'analyst']);

function splitName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || 'Member' };
}

export async function POST(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const body = await req.json().catch(() => null) as {
      firstName?: string;
      lastName?: string;
      fullName?: string;
      email?: string;
      assignedPortfolios?: string[];
      invitedBy?: string;
      role?: InviteRole;
    } | null;

    if (!body?.email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const parsedName = body.fullName ? splitName(body.fullName) : null;
    const firstName = (body.firstName || parsedName?.firstName || '').trim();
    const lastName = (body.lastName || parsedName?.lastName || '').trim();
    const email = body.email.trim().toLowerCase();
    const role = VALID_ROLES.has(body.role as InviteRole) ? (body.role as InviteRole) : 'agent';
    const assignedPortfolios = [...new Set((body.assignedPortfolios || []).filter(Boolean))];

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
      .from('agent_invites')
      .select('id, status, expires_at')
      .eq('email', email)
      .in('status', ['invited'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError) {
      return NextResponse.json({ error: existingInviteError.message }, { status: 500 });
    }

    if (existingInvite && existingInvite.expires_at && new Date(existingInvite.expires_at) > new Date()) {
      return NextResponse.json({ error: 'An active invite already exists for this email.' }, { status: 409 });
    }

    const { data: invite, error: insertError } = await supabaseAdmin
      .from('agent_invites')
      .insert({
        email,
        first_name: firstName,
        last_name: lastName,
        assigned_portfolios: role === 'owner' ? [] : assignedPortfolios,
        role,
        invited_by: authorization.actor.user.id,
        status: 'invited',
      })
      .select('id, invite_token, email, first_name, last_name, role, assigned_portfolios')
      .single();

    if (insertError || !invite) {
      return NextResponse.json({ error: insertError?.message || 'Failed to create invite.' }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.staytrvlr.com';
    const inviteLink = `${siteUrl}/invite/${invite.invite_token}`;
    const roleLabel = role === 'team_lead' ? 'Team Lead' : role === 'analyst' ? 'Analyst' : role === 'owner' ? 'Owner' : 'Agent';

    const { error: emailError } = await getResendClient().emails.send({
      from: getResendFrom(),
      to: invite.email,
      subject: `You're invited to join TRAVLR Pro`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
          <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 8px;">Welcome to TRAVLR Pro, ${invite.first_name}!</h1>
          <p style="color: #6b7280; font-size: 15px; margin: 0 0 20px; line-height: 1.6;">
            You've been invited to join the workspace as <strong>${roleLabel}</strong>.
          </p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 10px; font-weight: 600;">Next steps</p>
            <ol style="color: #6b7280; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Open your invite link</li>
              <li>Create your password</li>
              <li>Sign in and review your assigned access</li>
            </ol>
          </div>
          <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 10px; text-decoration: none; margin-bottom: 28px;">
            Accept invite →
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">This invite expires in 7 days.</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      inviteLink,
      emailSent: !emailError,
      emailError: emailError?.message || null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
