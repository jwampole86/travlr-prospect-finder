/**
 * Broker partner referrals: the statuses a partner reports back, the update rate that follows from them, and the flag for a partner
 * who has stopped reporting. Pure functions, so the rules are tested and shown the same way on every screen.
 */
export const REFERRAL_STATUSES = ['sent', 'received', 'contacted', 'listed', 'under_contract', 'closed', 'dead'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  sent: 'Sent, waiting for the partner',
  received: 'Received',
  contacted: 'Contacted the owner',
  listed: 'Listed',
  under_contract: 'Under contract',
  closed: 'Closed',
  dead: 'Dead (no deal)'
};

export const isFinal = (s: ReferralStatus) => s === 'closed' || s === 'dead';

/** A partner is expected to report within a week of a referral being sent, then on every change, and to check in monthly on open ones. */
export const FIRST_UPDATE_DAYS = 7;
export const OPEN_CHECKIN_DAYS = 30;
/** The update rate a partner should keep, and how many referrals past the first week it takes before the rate is judged. */
export const TARGET_RATE = 0.7;
export const MIN_DUE_FOR_FLAG = 3;
/** A license check older than this is shown as due for another look. */
export const LICENSE_RECHECK_DAYS = 90;

export interface ReferralRow { status: ReferralStatus; sent_at: string; status_at: string }

const DAY = 86_400_000;
const days = (from: string, now: Date) => Math.floor((now.getTime() - Date.parse(from)) / DAY);

export interface PartnerScore {
  total: number;
  open: number;
  /** Referrals sent more than a week ago: the ones the partner should already have reported on. */
  due: number;
  /** Of those, how many have any status beyond "sent". */
  reported: number;
  /** reported / due, or null before there is anything due. */
  rate: number | null;
  /** Open referrals with no status change for a month. */
  stale: number;
  /** Sent more than a week ago and still "sent": the partner has not even confirmed receiving them. */
  silent: number;
  listed: number;
  underContract: number;
  closed: number;
  dead: number;
  flag: 'ok' | 'watch' | 'stopped';
  reason: string | null;
}

export function scorePartner(rows: ReferralRow[], now: Date = new Date()): PartnerScore {
  const open = rows.filter((r) => !isFinal(r.status));
  const due = rows.filter((r) => days(r.sent_at, now) > FIRST_UPDATE_DAYS);
  const reported = due.filter((r) => r.status !== 'sent');
  const silent = due.filter((r) => r.status === 'sent').length;
  const stale = open.filter((r) => r.status !== 'sent' && days(r.status_at, now) > OPEN_CHECKIN_DAYS).length;
  const rate = due.length ? reported.length / due.length : null;

  let flag: PartnerScore['flag'] = 'ok';
  let reason: string | null = null;
  if (due.length >= MIN_DUE_FOR_FLAG && rate !== null && rate < TARGET_RATE) {
    flag = 'stopped';
    reason = `Only ${reported.length} of ${due.length} referrals older than a week have a status (target ${Math.round(TARGET_RATE * 100)}%).`;
  } else if (silent >= 2 || stale >= 2) {
    flag = 'stopped';
    reason = silent >= 2 ? `${silent} referrals sent over a week ago have not been acknowledged.` : `${stale} open referrals have had no update for over a month.`;
  } else if (silent === 1 || stale === 1 || (rate !== null && rate < TARGET_RATE)) {
    flag = 'watch';
    reason = silent === 1 ? 'A referral sent over a week ago has not been acknowledged.' : stale === 1 ? 'An open referral has had no update for over a month.' : `Update rate is ${Math.round((rate ?? 0) * 100)}%, below the ${Math.round(TARGET_RATE * 100)}% target.`;
  }
  const count = (s: ReferralStatus) => rows.filter((r) => r.status === s).length;
  return { total: rows.length, open: open.length, due: due.length, reported: reported.length, rate, stale, silent, listed: count('listed'), underContract: count('under_contract'), closed: count('closed'), dead: count('dead'), flag, reason };
}

/** What must be true before a lead may be sent to a partner. The same three checks as routing a sale to one, plus the partner being in play. */
export function referralBlockers(p: { license_status?: string | null; legal_reviewed?: boolean | null; agreement_on_file?: boolean | null; relationship_status?: string | null }): string[] {
  const out: string[] = [];
  if (p.license_status !== 'verified') out.push("The partner's license must be verified.");
  if (!p.legal_reviewed) out.push('The partner arrangement needs legal review.');
  if (!p.agreement_on_file) out.push('Put the signed partner agreement on file.');
  if (p.relationship_status === 'paused' || p.relationship_status === 'ended') out.push(`The partner is ${p.relationship_status}.`);
  return out;
}

/** The official place to check a license. Always the government site; ARELLO is only a cross-check. */
export const LICENSE_LOOKUPS: Record<string, { label: string; url: string }> = {
  AZ: { label: 'Arizona Department of Real Estate public database', url: 'https://services.azre.gov/PdbWeb/' },
  NV: { label: 'Nevada Real Estate Division license lookup', url: 'https://www.red.nv.gov/online-services/license-lookup/' },
  CO: { label: 'Colorado Division of Real Estate license lookup', url: 'https://apps2.colorado.gov/dre/licensing/lookup/licenselookup.aspx' }
};
export const ARELLO_URL = 'https://www.arello.org/programs/license-verification/';

export function licenseLookupFor(state: string | null | undefined): { label: string; url: string } {
  const hit = state ? LICENSE_LOOKUPS[state.trim().toUpperCase()] : undefined;
  return hit ?? { label: 'ARELLO license verification (then confirm on the state site)', url: ARELLO_URL };
}

export const licenseCheckAgeDays = (verifiedAt: string | null | undefined, now: Date = new Date()): number | null => (verifiedAt ? days(verifiedAt, now) : null);

/** A single recorded step is only allowed to move a referral forward: closed and dead end it, and nothing goes back to "sent". */
export function canMoveTo(from: ReferralStatus, to: ReferralStatus): boolean {
  if (from === to) return false;
  if (isFinal(from)) return false;
  if (to === 'sent') return false;
  return true;
}
