/**
 * What NAVEO is owed on a closed referral. The fee is the agreed percentage of the partner's gross commission on the referred side,
 * due within the agreed number of business days after the partner is paid. Pure functions so the amounts and dates are tested.
 */
export type FeeStatus = 'not_due' | 'awaiting_commission' | 'due' | 'invoiced' | 'paid' | 'waived';

export const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  not_due: 'Not due yet',
  awaiting_commission: 'Closed: waiting to learn the commission',
  due: 'Fee due',
  invoiced: 'Invoiced',
  paid: 'Paid',
  waived: 'Waived'
};

/** Used only for an estimate before the real commission is known, and always shown as an estimate. */
export const ASSUMED_SIDE_COMMISSION_PCT = 2.5;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFee(commissionReceived: number | null | undefined, feePercent: number | null | undefined): number | null {
  if (commissionReceived == null || feePercent == null || !(commissionReceived >= 0) || !(feePercent >= 0 && feePercent <= 100)) return null;
  return round2((commissionReceived * feePercent) / 100);
}

/** A rough figure from the close price when the commission is not known yet. Never used as the amount owed. */
export function estimateFee(closePrice: number | null | undefined, feePercent: number | null | undefined, sideCommissionPct = ASSUMED_SIDE_COMMISSION_PCT): number | null {
  if (closePrice == null || !(closePrice > 0)) return null;
  return computeFee((closePrice * sideCommissionPct) / 100, feePercent);
}

/** Adds business days (Monday to Friday) to a yyyy-mm-dd date. Holidays are not counted out. */
export function addBusinessDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

export const protectionEnds = (sentAt: string, days: number | null | undefined): string | null =>
  days == null ? null : new Date(Date.parse(sentAt) + days * 86_400_000).toISOString();

export const withinProtection = (endsAt: string | null | undefined, now: Date = new Date()): boolean => !!endsAt && Date.parse(endsAt) >= now.getTime();

export interface FeeFields {
  status: string;
  fee_status: FeeStatus;
  fee_amount: number | null;
  fee_due_on: string | null;
  fee_paid_amount?: number | null;
  close_price?: number | null;
  fee_percent?: number | null;
}

/** The fee fields to store when a referral closes or when the partner reports the commission they received. */
export function feeAfterCommission(opts: { feePercent: number | null; commissionReceived: number | null; receivedOn: string | null; dueDays: number | null }): Pick<FeeFields, 'fee_status' | 'fee_amount' | 'fee_due_on'> {
  const amount = computeFee(opts.commissionReceived, opts.feePercent);
  if (amount === null || !opts.receivedOn) return { fee_status: 'awaiting_commission', fee_amount: null, fee_due_on: null };
  return { fee_status: 'due', fee_amount: amount, fee_due_on: opts.dueDays == null ? opts.receivedOn : addBusinessDays(opts.receivedOn, opts.dueDays) };
}

export const isOverdue = (f: Pick<FeeFields, 'fee_status' | 'fee_due_on'>, now: Date = new Date()): boolean =>
  (f.fee_status === 'due' || f.fee_status === 'invoiced') && !!f.fee_due_on && f.fee_due_on < now.toISOString().slice(0, 10);

export interface Ledger { owed: number; overdue: number; overdueCount: number; paid: number; awaitingCommission: number; estimatedPending: number; partialShortfall: number }

/** Totals across referrals: what is owed now, what is late, what has been paid, and a labelled estimate for closes still waiting on a commission. */
export function ledger(rows: FeeFields[], now: Date = new Date()): Ledger {
  const out: Ledger = { owed: 0, overdue: 0, overdueCount: 0, paid: 0, awaitingCommission: 0, estimatedPending: 0, partialShortfall: 0 };
  for (const r of rows) {
    if (r.fee_status === 'due' || r.fee_status === 'invoiced') {
      out.owed += r.fee_amount ?? 0;
      if (isOverdue(r, now)) { out.overdue += r.fee_amount ?? 0; out.overdueCount++; }
    } else if (r.fee_status === 'paid') {
      out.paid += r.fee_paid_amount ?? r.fee_amount ?? 0;
      if (r.fee_amount != null && r.fee_paid_amount != null && r.fee_paid_amount < r.fee_amount) out.partialShortfall += round2(r.fee_amount - r.fee_paid_amount);
    } else if (r.fee_status === 'awaiting_commission') {
      out.awaitingCommission++;
      out.estimatedPending += estimateFee(r.close_price, r.fee_percent) ?? 0;
    }
  }
  return { owed: round2(out.owed), overdue: round2(out.overdue), overdueCount: out.overdueCount, paid: round2(out.paid), awaitingCommission: out.awaitingCommission, estimatedPending: round2(out.estimatedPending), partialShortfall: round2(out.partialShortfall) };
}
