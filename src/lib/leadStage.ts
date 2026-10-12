import type { LeadStage } from '@/data/mockLeads';

const UI_STAGES: LeadStage[] = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];

// The text and email cadences write their own stage names onto leads; the screens that draw a stage badge only know the pipeline stages.
const CADENCE_STAGE: Record<string, LeadStage> = {
  new: 'New Lead', nurturing: 'Contacted', contacted: 'Contacted', engaged: 'Contacted',
  human_outreach: 'Interested', closed_won: 'Live', closed_dead: 'Not a Fit',
};

/** Maps any stored stage value to a pipeline stage the UI can draw, so an unfamiliar value never breaks a page. */
export function normalizeLeadStage(raw: unknown): LeadStage {
  const s = String(raw ?? '').trim();
  if ((UI_STAGES as string[]).includes(s)) return s as LeadStage;
  return CADENCE_STAGE[s.toLowerCase().replace(/[\s-]+/g, '_')] ?? 'New Lead';
}
