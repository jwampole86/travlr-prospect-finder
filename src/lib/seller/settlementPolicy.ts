/**
 * Escrow, title and mortgage are settlement services (RESPA Section 8, 12 U.S.C. 2607): no fee, kickback or other thing of value for
 * referring that business on a federally related mortgage loan, and no unearned fee splits. NAVEO Homes refers owners to licensed real
 * estate brokers only. It does not take referral money from escrow, title or lender companies and does not hold client funds.
 */
export const SETTLEMENT_POLICY = {
  does: [
    'Refers permissioned seller leads to licensed real estate brokers under a written agreement, paid to the brokerage.',
    'Lets the owner choose their own escrow or title company. NAVEO stays neutral.'
  ],
  doesNot: [
    'Accept or pay any fee, per-closing bonus or other thing of value for sending escrow, title or mortgage business.',
    'Hold earnest money or closing funds (that needs an escrow license, a bond and state oversight).',
    'Own part of a title, escrow or mortgage company and steer clients to it, unless counsel has set up a compliant affiliated business arrangement with the required written disclosure.',
    'Offer "we will place your escrow" as a paid service in owner or broker scripts.'
  ]
} as const;

const TERMS = /\b(escrow|title (company|insurance|agency|agent)|settlement (service|agent|company)|mortgage|lender|closing (fee|agent|company)|per[- ](closing|file|closed file|loan))\b/i;

/** A warning (never a block) for compensation terms that read like a fee tied to settlement-service business. */
export function settlementTermsWarning(text: string | null | undefined): string | null {
  if (!text || !TERMS.test(text)) return null;
  return 'These terms mention escrow, title, mortgage or a per-closing fee. A payment for referring settlement-service business can violate RESPA Section 8. Have counsel review before using them. Referral fees here are for licensed real estate brokerage referrals only.';
}
