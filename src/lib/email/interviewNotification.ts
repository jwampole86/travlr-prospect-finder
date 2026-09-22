import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { createInterviewIcs, type InterviewCalendarEvent } from '@/lib/interviewCalendar';

export interface InterviewNotificationInput extends InterviewCalendarEvent {
  candidateEmail?: string | null;
  interviewerEmail?: string | null;
  interviewerName?: string | null;
  timeZone?: string | null;
  purpose: 'invite' | 'reminder';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

export async function sendInterviewNotification(input: InterviewNotificationInput) {
  const recipients = [...new Set([input.candidateEmail, input.interviewerEmail].filter((email): email is string => Boolean(email)))];
  if (recipients.length === 0) return { skipped: true };

  const timeZone = input.timeZone || 'America/Denver';
  const scheduledAt = new Date(input.scheduledAt);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(scheduledAt);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(scheduledAt);
  const isFollowUp = input.eventType !== 'initial_interview';
  const heading = input.purpose === 'invite'
    ? (isFollowUp ? 'Follow-Up Call Scheduled' : 'Interview Scheduled')
    : (isFollowUp ? 'Follow-Up Call Reminder' : 'Interview Reminder');
  const intro = input.purpose === 'invite'
    ? (isFollowUp ? 'A candidate follow-up call has been scheduled.' : 'An interview has been scheduled.')
    : (isFollowUp ? 'This is a reminder for the upcoming candidate follow-up call.' : 'This is a reminder for the upcoming interview.');
  const meetingRow = input.meetingUrl
    ? `<tr><td style="padding:8px 0;color:#6B7280">Meeting</td><td style="padding:8px 0"><a href="${escapeHtml(input.meetingUrl)}" style="color:#2563EB;font-weight:600">Join meeting</a></td></tr>`
    : '';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#111827;padding:24px;border-radius:12px;margin-bottom:24px">
        <h1 style="color:white;margin:0;font-size:20px">${heading}</h1>
        <p style="color:#9CA3AF;margin:8px 0 0">TRAVLR Hiring Team</p>
      </div>
      <p style="color:#374151">${intro}</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:20px;margin:20px 0">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#6B7280;width:140px">Candidate</td><td style="padding:8px 0;color:#111827;font-weight:600">${escapeHtml(input.candidateName)}</td></tr>
          <tr><td style="padding:8px 0;color:#6B7280">Position</td><td style="padding:8px 0;color:#111827;font-weight:600">${escapeHtml(input.roleTitle)}</td></tr>
          <tr><td style="padding:8px 0;color:#6B7280">Date</td><td style="padding:8px 0;color:#111827;font-weight:600">${date}</td></tr>
          <tr><td style="padding:8px 0;color:#6B7280">Time</td><td style="padding:8px 0;color:#111827;font-weight:600">${time}</td></tr>
          <tr><td style="padding:8px 0;color:#6B7280">Interviewer</td><td style="padding:8px 0;color:#111827;font-weight:600">${escapeHtml(input.interviewerName || 'TRAVLR Hiring Team')}</td></tr>
          ${meetingRow}
        </table>
      </div>
      <p style="color:#374151">The attached calendar event includes reminders 24 hours and 30 minutes before the call.</p>
    </div>`;

  const { error } = await getResendClient().emails.send({
    from: getResendFrom(),
    to: recipients,
    subject: `${heading}: ${input.candidateName} - ${date} at ${time}`,
    html,
    attachments: [{
      filename: `TRAVLR-follow-up-${input.candidateName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`,
      content: Buffer.from(createInterviewIcs(input)).toString('base64'),
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
    }],
  });
  if (error) throw new Error(error.message || 'Email send failed');
  return { skipped: false, recipients };
}