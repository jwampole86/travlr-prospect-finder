import type { Tone } from '@/components/ops';
import type { PipelineStatus } from '@/app/candidate-tracker/types';

export const PIPELINE_STAGES: Array<{ id: PipelineStatus; label: string; tone: Tone }> = [
  { id: 'READY_TO_INTERVIEW', label: 'Ready to interview', tone: 'primary' },
  { id: 'INTERVIEWED', label: 'Interviewed', tone: 'warning' },
  { id: 'FOLLOW_UP', label: 'Follow-up', tone: 'warning' },
  { id: 'HOLD', label: 'Hold', tone: 'default' },
  { id: 'MOVE_FORWARD', label: 'Move forward', tone: 'success' },
  { id: 'HIRED', label: 'Hired', tone: 'success' },
  { id: 'NOT_MOVING_FORWARD', label: 'Not moving forward', tone: 'danger' },
];

export const PIPELINE_STAGE_OPTIONS = PIPELINE_STAGES.map((stage) => ({
  value: stage.id,
  label: stage.label,
}));

export const PRIORITY_LABELS: Record<string, string> = {
  HIGHEST: 'Highest',
  VERY_HIGH: 'Very high',
  HIGH: 'High',
  VERY_STRONG: 'Very strong',
  STRONG_SECONDARY: 'Strong secondary',
  SOLID_MID_TIER: 'Solid mid-tier',
  STANDARD: 'Standard',
};
