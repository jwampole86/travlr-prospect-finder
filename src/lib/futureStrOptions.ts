/** Answer choices for the "Future of STR" survey. Shared by the public form, the API checks and the admin tab. */
export type Audience = 'homeowner' | 'operator';

export const COMFORT = [
  { id: 'comfortable', label: 'Yes, I would be comfortable' },
  { id: 'conditions', label: 'Maybe, with the right safeguards' },
  { id: 'unsure', label: 'I am not sure yet' },
  { id: 'not_comfortable', label: 'No, I would not be comfortable' },
] as const;

export const CONCERNS = [
  { id: 'privacy', label: 'Privacy: cameras, data and who can see inside my property' },
  { id: 'safety', label: 'Safety of my property and the people in it' },
  { id: 'damage', label: 'Damage, and who is responsible for it' },
  { id: 'quality', label: 'Cleaning quality and reliability' },
  { id: 'guests', label: 'How guests would react' },
  { id: 'cleaners', label: 'The effect on cleaning crews' },
  { id: 'cost', label: 'Cost' },
  { id: 'other', label: 'Something else' },
] as const;

export const HOME_INTERESTS = [
  { id: 'updates', label: 'Send me occasional updates' },
  { id: 'interview', label: 'I am open to a short conversation about this' },
  { id: 'pilot_property', label: 'My property could be considered for a future supervised pilot (no commitment)' },
] as const;

export const OP_INTERESTS = [
  { id: 'updates', label: 'Send me occasional updates' },
  { id: 'interview', label: 'I am open to a 20-minute conversation' },
  { id: 'design_partner', label: 'I would like to be considered as an early design partner' },
] as const;

export const ROLES = [
  { id: 'property_manager', label: 'I manage vacation rental properties' },
  { id: 'cleaning_company', label: 'I run a cleaning or turnover company' },
  { id: 'other', label: 'Something else' },
] as const;

export const SIZES = [
  { id: '1-10', label: '1 to 10 properties' },
  { id: '11-50', label: '11 to 50 properties' },
  { id: '51-200', label: '51 to 200 properties' },
  { id: '200+', label: 'More than 200 properties' },
] as const;

export const PAY = [
  { id: 'yes', label: 'Yes, that would be worth paying for' },
  { id: 'maybe', label: 'Maybe, depending on price' },
  { id: 'no', label: 'No' },
] as const;

export const CONSENT_TEXT = 'Yes, add me to the AVYRO AI research list. We will email once to confirm my address before sending anything else, and I can unsubscribe at any time.';

export const ids = (list: ReadonlyArray<{ id: string }>) => list.map(x => x.id);
export const labelOf = (list: ReadonlyArray<{ id: string; label: string }>, id: string | null | undefined) => list.find(x => x.id === id)?.label ?? id ?? '';
