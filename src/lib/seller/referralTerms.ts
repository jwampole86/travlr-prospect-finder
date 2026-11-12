/**
 * The standard referral terms NAVEO Homes proposes to a partner broker, and the checks a partner's terms are held to. These are drafts: whether
 * NAVEO may receive a referral fee at all, and who may pay it, differs by state and is the open question in each state's counsel sign-off
 * (the "unlicensed payee" answer on the States tab). Nothing here replaces that sign-off or turns a state on.
 */

export const STANDARD_REFERRAL_TERMS = {
  /** % of the partner brokerage's commission on the referred side. */
  feePercent: 25,
  /** Lowest fee to accept in a negotiation without a second look. */
  floorPercent: 20,
  protectionDays: 180,
  paymentDueDays: 10,
} as const;

/** What every partner agreement should say, in plain words. */
export const STANDARD_TERMS_POINTS: string[] = [
  `The fee is a percentage of the commission the partner brokerage actually collects on the referred side (standard ${STANDARD_REFERRAL_TERMS.feePercent}%, not below ${STANDARD_REFERRAL_TERMS.floorPercent}% without sign-off).`,
  'It is paid only after the commission is collected, and only broker to broker: from the partner brokerage to the licensed payee named in the agreement. Never from the owner, a buyer, or an agent personally.',
  `Owed on a closed deal for ${STANDARD_REFERRAL_TERMS.protectionDays} days after the referral is sent, and due ${STANDARD_REFERRAL_TERMS.paymentDueDays} business days after the partner is paid.`,
  'A written, signed agreement is on file before any lead is sent, and the responsible broker is named on it.',
  'The owner has agreed to be introduced, and is told about the referral relationship.',
  'No fee, bonus or other thing of value for escrow, title or mortgage business (RESPA Section 8).',
  'Never offered on a home already listed with another broker. That owner is only offered the rental side or a buyer introduction.',
  'Whether the payee may be a company that does not hold a real estate license is decided by counsel for each state before it is switched on.',
];

export interface TermsToCheck {
  feePercent?: number | string | null;
  payeeName?: string | null;
  protectionDays?: number | string | null;
  responsibleBroker?: string | null;
  agreementSignedOn?: string | null;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Gaps against the standard terms. Warnings only; the referral send step keeps its own blockers. */
export function referralTermsWarnings(t: TermsToCheck): string[] {
  const out: string[] = [];
  const fee = num(t.feePercent);
  if (fee !== null) {
    if (fee <= 0 || fee > 100) out.push('The fee must be a percentage between 0 and 100.');
    else if (fee < STANDARD_REFERRAL_TERMS.floorPercent) out.push(`${fee}% is below the ${STANDARD_REFERRAL_TERMS.floorPercent}% floor. Get sign-off before agreeing to it.`);
  }
  if (!t.payeeName?.trim()) out.push('No exact legal payee. Fees are paid to the licensed brokerage named in the agreement.');
  if (num(t.protectionDays) === null) out.push('No protection period set.');
  if (!t.responsibleBroker?.trim()) out.push('No responsible broker named for the agreement.');
  if (!t.agreementSignedOn) out.push('No signed agreement on file. Do not send leads until there is one.');
  return out;
}
