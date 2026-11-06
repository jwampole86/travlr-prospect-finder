/**
 * Who may publish a photo. Photos on listing sites belong to the photographer, the listing agent or the brokerage, and are
 * licensed to the site, not to us. A NAVEO Homes gallery therefore shows only photos a person has cleared, with the reason recorded.
 */
export const RIGHTS_STATUSES = ['unreviewed', 'cleared', 'restricted', 'rejected'] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

/** Why a photo may be shown. "source_terms_allow" must name the specific permission in the note. */
export const RIGHTS_BASES = ['seller_provided', 'owner_authorized', 'licensed_feed', 'source_terms_allow', 'own_photography'] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export interface RightsChange { status: RightsStatus; basis?: RightsBasis | null; note?: string | null }

/** A person's decision, checked: clearing needs a stated basis, and "source terms" also needs the permission written down. */
export function validateRightsChange(c: RightsChange): string | null {
  if (!(RIGHTS_STATUSES as readonly string[]).includes(c.status)) return 'Unknown rights status.';
  if (c.status !== 'cleared') return null;
  if (!c.basis || !(RIGHTS_BASES as readonly string[]).includes(c.basis)) return 'Say why this photo may be published (seller provided, owner authorized, licensed feed, source terms allow, or own photography).';
  if (c.basis === 'source_terms_allow' && !(c.note ?? '').trim()) return 'Write down which source term or licence allows this photo to be republished.';
  return null;
}

/** What NAVEO may be shown: cleared and not hidden. */
export const isPublishable = (m: { rights_status: string; hidden?: boolean | null }) => m.rights_status === 'cleared' && !m.hidden;
