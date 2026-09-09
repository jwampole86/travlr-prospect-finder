import { NextRequest, NextResponse } from 'next/server';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { sessionId, candidateName, roleTitle, scheduledAt, zoomLink, candidateEmail, interviewerName } = await req.json();

    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const dateStr = new Date(scheduledAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = new Date(scheduledAt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #111827; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Interview Reminder</h1>
          <p style="color: #9CA3AF; margin: 8px 0 0;">TRAVLR — Hiring Team</p>
        </div>
        <p style="color: #374151; font-size: 16px;">Hi ${candidateName},</p>
        <p style="color: #374151;">This is a reminder for your upcoming interview with TRAVLR.</p>
        <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px; width: 140px;">Position</td><td style="padding: 8px 0; color: #111827; font-weight: 600;">${roleTitle}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Date</td><td style="padding: 8px 0; color: #111827; font-weight: 600;">${dateStr}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Time</td><td style="padding: 8px 0; color: #111827; font-weight: 600;">${timeStr}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Interviewer</td><td style="padding: 8px 0; color: #111827; font-weight: 600;">${interviewerName || 'Jen Wampole'}</td></tr>
            ${zoomLink ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Zoom Link</td><td style="padding: 8px 0;"><a href="${zoomLink}" style="color: #2563EB; font-weight: 600;">Join Meeting</a></td></tr>` : ''}
          </table>
        </div>
        <p style="color: #374151;">Please be ready a few minutes early. We look forward to speaking with you!</p>
        <p style="color: #374151;">Best regards,<br><strong>${interviewerName || 'Jen Wampole'}</strong><br>TRAVLR Hiring Team</p>
      </div>
    `;

    const recipients = [];
    if (candidateEmail) recipients.push({ email: candidateEmail, name: candidateName });

    if (recipients.length === 0) {
      return NextResponse.json({ message: 'No recipient email — skipped sending', skipped: true });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: recipients.map(r => r.email),
        subject: `Interview Reminder: ${roleTitle} — ${dateStr} at ${timeStr}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.message || 'Email send failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error: any) {
    console.error('[interview/send-reminder] error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
