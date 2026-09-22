import { NextRequest, NextResponse } from 'next/server';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';

export async function POST(req: NextRequest) {
  try {
    const authorization = await requireAdminActor(req);
    if (!authorization.actor) {
      return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
    }
    const { to, subject, html } = await req.json();
    const resend = getResendClient();
    const from = getResendFrom();

    if (!to || !subject || !html) {
      return NextResponse.json({ success: false, error: 'Missing required fields: to, subject, html' }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
