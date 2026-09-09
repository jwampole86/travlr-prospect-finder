import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { email, name, role, portfolioIds } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: `Invalid email format: ${email}` }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';
    const inviteLink = `${siteUrl}/login?invite=1&email=${encodeURIComponent(email)}`;
    const roleLabel = { agent: 'Agent', manager: 'Manager', admin: 'Admin', viewer: 'Viewer' }[role as string] || 'Team Member';

    const { data, error } = await resend.emails.send({
      from: 'TRAVLR Pro <onboarding@resend.dev>',
      to: email,
      subject: `You've been invited to TRAVLR Pro as ${roleLabel}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
          <h2 style="font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 8px;">
            Welcome to TRAVLR Pro${name ? `, ${name}` : ''}!
          </h2>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
            You've been invited to join the TRAVLR Pro platform as a <strong>${roleLabel}</strong>.
            ${portfolioIds?.length > 0 ? `You've been assigned to ${portfolioIds.length} portfolio${portfolioIds.length > 1 ? 's' : ''}.` : ''}
          </p>
          <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-bottom: 24px;">
            Set Your Password &amp; Get Started
          </a>
          <p style="color: #9ca3af; font-size: 12px;">
            This link expires in 24 hours. If you didn't expect this invite, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 11px;">TRAVLR Pro · Short-Term Rental Prospect Platform</p>
        </div>
      `,
    });

    if (error) {
      // Surface the actual Resend error — name, message, and statusCode
      const detail = [error.name, error.message].filter(Boolean).join(': ');
      console.error('[bulk-invite] Resend error for', email, '→', detail);
      return NextResponse.json(
        { error: detail || 'Resend rejected the request', resendError: error },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[bulk-invite] Unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
