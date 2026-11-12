import { describe, expect, it } from 'vitest';
import { parseIcal } from './ical';

const today = new Date('2027-01-01T12:00:00Z');
const cal = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
const ev = (...props: string[]) => `BEGIN:VEVENT\r\n${props.join('\r\n')}\r\nEND:VEVENT`;

describe('parseIcal', () => {
  it('reads all-day reservations with an exclusive end date', () => {
    const out = parseIcal(cal(ev('DTSTART;VALUE=DATE:20270110', 'DTEND;VALUE=DATE:20270115', 'SUMMARY:Reserved')), today);
    expect(out).toEqual([{ start: '2027-01-10', end: '2027-01-15' }]);
  });

  it('reads date-times and unfolds long lines', () => {
    const out = parseIcal(cal(ev('DTSTART:20270110T150000Z', 'DTEND:20270112T110000Z', 'SUMMARY:A very long\r\n  summary')), today);
    expect(out).toEqual([{ start: '2027-01-10', end: '2027-01-12' }]);
  });

  it('skips cancelled events, past events and events with no readable start', () => {
    const out = parseIcal(cal(
      ev('DTSTART:20270110', 'DTEND:20270112', 'STATUS:CANCELLED'),
      ev('DTSTART:20260101', 'DTEND:20260105'),
      ev('DTSTART:garbage', 'DTEND:20270112'),
    ), today);
    expect(out).toEqual([]);
  });

  it('trims a stay already under way to today, and gives a one-night block when there is no end', () => {
    const out = parseIcal(cal(ev('DTSTART:20261230', 'DTEND:20270103'), ev('DTSTART:20270120')), today);
    expect(out).toEqual([{ start: '2027-01-01', end: '2027-01-03' }, { start: '2027-01-20', end: '2027-01-21' }]);
  });

  it('merges overlapping and back-to-back stays and sorts them', () => {
    const out = parseIcal(cal(ev('DTSTART:20270120', 'DTEND:20270125'), ev('DTSTART:20270110', 'DTEND:20270120'), ev('DTSTART:20270123', 'DTEND:20270127')), today);
    expect(out).toEqual([{ start: '2027-01-10', end: '2027-01-27' }]);
  });

  it('ignores events beyond the booking horizon and non-calendar text', () => {
    expect(parseIcal(cal(ev('DTSTART:20300101', 'DTEND:20300105')), today)).toEqual([]);
    expect(parseIcal('<html>not a calendar</html>', today)).toEqual([]);
  });
});
