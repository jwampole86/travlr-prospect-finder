import type { Tone } from '@/components/ops';

export function relativeTime(value?: string | null) {
  if (!value) return '—';
  const deltaMs = new Date(value).getTime() - Date.now();
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(deltaMs) >= size || unit === 'minute') {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(deltaMs / size), unit);
    }
  }
  return 'Just now';
}

export function shortDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function titleize(value?: string | null) {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function toneForStatus(status?: string | null): Tone {
  switch ((status || '').toLowerCase()) {
    case 'success':
    case 'succeeded':
    case 'delivered':
    case 'hired':
      return 'success';
    case 'retrying':
    case 'pending':
    case 'interviewed':
      return 'warning';
    case 'failed':
    case 'abandoned':
    case 'not_moving_forward':
    case 'error':
      return 'danger';
    default:
      return 'default';
  }
}
