export interface InterviewCalendarEvent {
  id: string;
  candidateName: string;
  roleTitle: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl?: string | null;
  description?: string;
  eventType?: 'initial_interview' | 'candidate_follow_up';
}

function compactUtc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function eventRange(event: InterviewCalendarEvent) {
  const start = new Date(event.scheduledAt);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  return `${compactUtc(start.toISOString())}/${compactUtc(end.toISOString())}`;
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  chunks.push(remaining);
  return chunks.join('\r\n');
}

export function calendarEventTitle(event: InterviewCalendarEvent) {
  return event.eventType === 'initial_interview'
    ? `TRAVLR interview with ${event.candidateName}`
    : `TRAVLR follow-up call with ${event.candidateName}`;
}

export function calendarEventDescription(event: InterviewCalendarEvent) {
  if (event.description) return event.description;
  return event.eventType === 'initial_interview'
    ? `Interview for ${event.roleTitle}.`
    : `Follow-up interview for ${event.roleTitle}. Open TRAVLR Interview Calendar at the scheduled time to launch the candidate follow-up teleprompter.`;
}

export function createGoogleCalendarUrl(event: InterviewCalendarEvent) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: calendarEventTitle(event),
    dates: eventRange(event),
    details: calendarEventDescription(event),
  });
  if (event.meetingUrl) params.set('location', event.meetingUrl);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function createOutlookCalendarUrl(event: InterviewCalendarEvent) {
  const start = new Date(event.scheduledAt);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: calendarEventTitle(event),
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: calendarEventDescription(event),
  });
  if (event.meetingUrl) params.set('location', event.meetingUrl);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function createInterviewIcs(event: InterviewCalendarEvent) {
  const start = new Date(event.scheduledAt);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TRAVLR//Candidate Follow-Up//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(event.id)}@travlr`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `DTSTART:${compactUtc(start.toISOString())}`,
    `DTEND:${compactUtc(end.toISOString())}`,
    `SUMMARY:${escapeIcs(calendarEventTitle(event))}`,
    `DESCRIPTION:${escapeIcs(calendarEventDescription(event))}`,
    ...(event.meetingUrl ? [`LOCATION:${escapeIcs(event.meetingUrl)}`, `URL:${escapeIcs(event.meetingUrl)}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${event.eventType === 'initial_interview' ? 'TRAVLR interview' : 'TRAVLR follow-up call'} tomorrow`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${event.eventType === 'initial_interview' ? 'TRAVLR interview' : 'TRAVLR follow-up call'} in 30 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}