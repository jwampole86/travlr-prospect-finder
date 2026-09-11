export const DEFAULT_INTERVIEW_TIMEZONE = 'America/Denver';

export function detectBrowserTimeZone(): string {
  if (typeof Intl === 'undefined') return DEFAULT_INTERVIEW_TIMEZONE;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_INTERVIEW_TIMEZONE;
}

export function getTimeZoneAbbreviation(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value || timeZone;
}

export function formatInTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(new Date(iso));
}

function partsFor(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

export function localDateTimeToUtc(localDate: string, localTime: string, timeZone: string): string {
  if (!localDate || !localTime || !timeZone) throw new Error('Date, time, and IANA timezone are required');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error('Invalid IANA timezone');
  }

  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error('Invalid local date or time');

  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i += 1) {
    const actual = partsFor(candidate, timeZone);
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + desiredUtc - actualUtc);
  }

  const verified = partsFor(candidate, timeZone);
  if (verified.year !== year || verified.month !== month || verified.day !== day || verified.hour !== hour || verified.minute !== minute) {
    throw new Error('That local time does not exist in the selected timezone. Choose another time.');
  }
  return candidate.toISOString();
}

export function isoToLocalParts(iso: string, timeZone: string) {
  const parts = partsFor(new Date(iso), timeZone);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}
