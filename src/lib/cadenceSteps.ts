/**
 * Phase 3: Shared cadence step definitions
 * Single source of truth for the 5-step cadence order
 */

export interface CadenceStep {
  step: number;
  category: string;
  label: string;
}

export const CADENCE_STEPS: CadenceStep[] = [
  { step: 1, category: 'initial_outreach', label: 'Initial Outreach' },
  { step: 2, category: 'follow_up_1', label: 'Follow-Up #1' },
  { step: 3, category: 'check_in', label: 'Check-In / Re-Engage' },
  { step: 4, category: 'proposal_introduction', label: 'Proposal Introduction' },
  { step: 5, category: 'closing', label: 'Closing / Contract' },
];

export const CADENCE_ORDER = CADENCE_STEPS.map(s => s.category);

export function getCadenceStepLabel(category: string): string {
  return CADENCE_STEPS.find(s => s.category === category)?.label ?? category.replace(/_/g, ' ');
}

export function sortByCadence<T extends { category: string }>(templates: T[]): T[] {
  return [...templates].sort((a, b) => {
    const ai = CADENCE_ORDER.indexOf(a.category);
    const bi = CADENCE_ORDER.indexOf(b.category);
    const aIdx = ai === -1 ? 99 : ai;
    const bIdx = bi === -1 ? 99 : bi;
    return aIdx - bIdx;
  });
}
