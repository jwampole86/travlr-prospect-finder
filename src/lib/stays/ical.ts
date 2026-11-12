/** Turns an iCal (.ics) feed from Airbnb, Vrbo or a channel manager into blocked date ranges, so co-listed homes do not get double-booked. */
export type IcalRange = { start: string; end: string };

export const MAX_ICAL_CHARS = 1_000_000;
export const MAX_ICAL_RANGES = 500;
const DAY = 86_400_000;
const HORIZON_DAYS = 800;

const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Reads the date part of DTSTART/DTEND values such as 20270105, 20270105T150000Z, or a TZID-qualified date-time. */
function datePart(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(Date.parse(iso)) || toDate(Date.parse(iso)) !== iso ? null : iso;
}

/**
 * Returns the blocked ranges (end date exclusive, matching the calendar blocks table), merged, sorted, and limited to what is still relevant.
 * Cancelled events and recurring rules are not expanded; events that already ended are dropped.
 */
export function parseIcal(text: string, today = new Date()): IcalRange[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const todayMs = Date.parse(toDate(today.getTime()));
  const ranges: IcalRange[] = [];
  let ev: { start?: string; end?: string; cancelled?: boolean } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev?.start && !ev.cancelled) {
        let startMs = Date.parse(ev.start);
        let endMs = ev.end ? Date.parse(ev.end) : startMs + DAY;
        if (!(endMs > startMs)) endMs = startMs + DAY;
        startMs = Math.max(startMs, todayMs);
        if (endMs > startMs && startMs <= todayMs + HORIZON_DAYS * DAY) ranges.push({ start: toDate(startMs), end: toDate(endMs) });
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === 'DTSTART') ev.start = datePart(value) ?? undefined;
    else if (name === 'DTEND') ev.end = datePart(value) ?? undefined;
    else if (name === 'STATUS' && value.trim().toUpperCase() === 'CANCELLED') ev.cancelled = true;
  }

  ranges.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: IcalRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) { if (r.end > last.end) last.end = r.end; } else merged.push({ ...r });
  }
  return merged;
}
