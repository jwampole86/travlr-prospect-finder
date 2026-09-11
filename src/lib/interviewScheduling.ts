import 'server-only';

export const INTERVIEW_DURATION_MINUTES = 25;
export const INTERVIEW_BUFFER_MINUTES = 5;
export const INTERVIEW_MIN_LEAD_MINUTES = 30;
export const INTERVIEW_SLOT_INTERVAL_MINUTES = 30;

const VALID_TIMEZONES = new Set([
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
]);

export function resolveInterviewTimezone(value: unknown, fallback = 'America/Denver') {
  const timezone = typeof value === 'string' ? value.trim() : '';
  return VALID_TIMEZONES.has(timezone) ? timezone : fallback;
}

function partsForDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
}

export function localDateTimeToUtc(localDate: string, localTime: string, timeZone: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = partsForDate(new Date(guess), timeZone);
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    guess += Date.UTC(year, month - 1, day, hour, minute, 0) - represented;
  }

  return new Date(guess);
}

export function localDateTimeParts(date: Date, timeZone: string) {
  const parts = partsForDate(date, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:00`,
  };
}

export function displayLocalDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function addLocalDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function localWeekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function matchesPreferredTime(time: string, preferredTime?: string, preferredTimeOfDay?: string) {
  if (preferredTime && time.slice(0, 5) !== preferredTime.slice(0, 5)) return false;
  if (preferredTimeOfDay === 'morning') return time < '12:00:00';
  if (preferredTimeOfDay === 'afternoon') return time >= '12:00:00' && time < '17:00:00';
  if (preferredTimeOfDay === 'evening') return time >= '17:00:00';
  return true;
}
