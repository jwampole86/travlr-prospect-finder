import type { Tone } from '@/components/ops';
import type { PipelineCandidate, PipelineStatus } from '@/app/candidate-tracker/types';
import { PIPELINE_STAGES, PRIORITY_LABELS } from './config';

export function toneClasses(tone: Tone) {
  switch (tone) {
    case 'primary':
      return 'border-primary/20 bg-primary/10 text-primary';
    case 'success':
      return 'border-success/20 bg-success/10 text-success';
    case 'warning':
      return 'border-warning/20 bg-warning/10 text-warning';
    case 'danger':
      return 'border-danger/20 bg-danger/10 text-danger';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function stageMeta(status: PipelineStatus | null | undefined) {
  return PIPELINE_STAGES.find((stage) => stage.id === status) ?? PIPELINE_STAGES[0];
}

export function humanizePriority(priority?: string | null) {
  if (!priority) return null;
  return PRIORITY_LABELS[priority] ?? priority.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatShortDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return 'No recent activity';
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

export function candidateLocation(candidate: PipelineCandidate) {
  return [candidate.city, candidate.state].filter(Boolean).join(', ') || 'Location not saved';
}

export function candidateHeadline(candidate: PipelineCandidate) {
  return candidate.current_title || candidate.current_company || candidateLocation(candidate);
}

export function lastActivityAt(candidate: PipelineCandidate) {
  return candidate.next_interview_at || candidate.latest_interview_at || candidate.updated_at || candidate.created_at || null;
}
