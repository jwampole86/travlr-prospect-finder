'use client';

import { Loader2 } from 'lucide-react';
import { inputClass } from '@/components/ops';
import type { PipelineStatus } from '../types';

const OPTIONS: Array<{ value: PipelineStatus; label: string }> = [
  { value: 'READY_TO_INTERVIEW', label: 'Ready to interview' },
  { value: 'INTERVIEWED', label: 'Interviewed' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'HOLD', label: 'Hold' },
  { value: 'MOVE_FORWARD', label: 'Move forward' },
  { value: 'HIRED', label: 'Hired' },
  { value: 'NOT_MOVING_FORWARD', label: 'Not moving forward' },
];

export function StageSelect({
  value,
  disabled,
  saving,
  onChange,
}: {
  value: PipelineStatus;
  disabled?: boolean;
  saving?: boolean;
  onChange: (value: PipelineStatus) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        disabled={disabled || saving}
        onChange={(event) => onChange(event.target.value as PipelineStatus)}
        className={`${inputClass} min-w-[170px] py-1.5 text-xs`}
        aria-label="Update pipeline stage"
      >
        {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {saving ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
