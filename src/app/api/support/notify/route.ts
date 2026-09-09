import { NextRequest, NextResponse } from 'next/server';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

interface NotifyPayload {
  ticketNumber: string;
  userEmail: string;
  subject: string;
  category: string;
  status: string;
  eventType: 'created' | 'status_changed';
  adminNotes?: string;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  suggestion: 'Feature Suggestion',
  question: 'Question',
  other: 'Other',
};

function buildEmailHtml(payload: NotifyPayload): string {
  const statusLabel = STATUS_LABELS[payload.status] || payload.status;
  const categoryLabel = CATEGORY_LABELS[payload.category] || payload.category;
  const isCreated = payload.eventType === 'created';

  const statusColor = payload.status === 'resolved' ?'#10b981'
    : payload.status === 'in_progress' ?'#f59e0b' :'#3b82f6';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: #1e1b4b; padding: 24px 28px;">
      <p style="color: #a5b4fc; font-size: 12px; margin: 0 0 4px;">TRAVLR Prospect Finder</p>
      <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 600;">
        ${isCreated ? 'Support Ticket Created' : 'Ticket Status Updated'}
      </h1>
    </div>
    <div style="padding: 24px 28px;">
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Ticket Reference</p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #4f46e5; font-family: monospace;">${payload.ticketNumber}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; width: 120px;">Subject</td>
          <td style="padding: 8px 0; color: #111827; font-weight: 500;">${payload.subject}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Category</td>
          <td style="padding: 8px 0; color: #111827;">${categoryLabel}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Status</td>
          <td style="padding: 8px 0;">
            <span style="background: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor}40; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;">${statusLabel}</span>
          </td>
        </tr>
        ${payload.adminNotes ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Notes</td>
          <td style="padding: 8px 0; color: #111827;">${payload.adminNotes}</td>
        </tr>` : ''}
      </table>
      ${isCreated ? `
      <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
        Your ticket has been received. Our team will review it and you will receive an email update when the status changes.
        You can also track your tickets in the <strong>My Tickets</strong> section of the Support page.
      </p>` : `
      <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
        Your support ticket status has been updated. Log in to TRAVLR Prospect Finder to view the full details.
      </p>`}
    </div>
    <div style="padding: 16px 28px; border-top: 1px solid #e5e7eb; background: #f9fafb;">
      <p style="margin: 0; font-size: 11px; color: #9ca3af;">
        This is an automated notification from TRAVLR Prospect Finder. Reply to <a href="mailto:support@travlr.com" style="color: #4f46e5;">support@travlr.com</a> for assistance.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const payload: NotifyPayload = await req.json();

    if (!payload.userEmail || !payload.ticketNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const emailSubject = payload.eventType === 'created'
      ? `[${payload.ticketNumber}] Support ticket received — ${payload.subject}`
      : `[${payload.ticketNumber}] Status update: ${STATUS_LABELS[payload.status] || payload.status}`;

    const { data, error } = await getResendClient().emails.send({
      from: getResendFrom(),
      to: [payload.userEmail],
      subject: emailSubject,
      html: buildEmailHtml(payload),
    });

    if (error) {
      return NextResponse.json({ error: `Resend error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
