export interface CadenceStep {
  step: number;
  label: string;
  channel: 'email' | 'sms';
  delay_days: number;
  delay_hours: number;
  template_key: string;
  subject: string | null;
}

export interface CadenceSequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  trigger_stage: string;
  steps: CadenceStep[];
  created_at: string;
  updated_at: string;
}

export interface CadenceStats {
  sequenceCount: number;
  activeSequenceCount: number;
  defaultSequenceCount: number;
  enrollmentCount: number;
  activeEnrollmentCount: number;
  completedEnrollmentCount: number;
  escalatedEnrollmentCount: number;
  unsubscribedEnrollmentCount: number;
  sendCount: number;
  unsubscribeTokenCount: number;
  newLeadCount: number;
  nurturingLeadCount: number;
  humanOutreachCount: number;
  scheduledTouchCount: number;
}
