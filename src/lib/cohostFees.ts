/** Expected earnings for a Co-Host listing, split with the other co-host. One place so every number in the pipeline uses the same rules. */

/** The Expected scenario the owner sees: we close this share of the gap between what the home earns now and its potential. */
export const EXPECTED_GAP_SHARE = 0.4;

/** Sliding co-host fee on the home's yearly revenue: each slice is charged at its own rate, so the effective rate falls as the home earns more. */
export const FEE_TIERS: Array<{ upTo: number; rate: number }> = [{ upTo: 100_000, rate: 0.20 }, { upTo: 200_000, rate: 0.16 }, { upTo: Infinity, rate: 0.12 }];

/** Share of the fee TRAVLR keeps; the rest goes to the other co-host. */
export const OUR_SHARE_OF_FEE = 0.5;

export interface CommissionEstimate { expectedRevenue: number; totalFee: number; effectivePct: number; ours: number; theirs: number }

export function estimateCommission(current: number | null | undefined, potential: number | null | undefined): CommissionEstimate | null {
  const pot = Number(potential ?? 0); if (!(pot > 0)) return null;
  const cur = Math.max(0, Number(current ?? 0));
  const expectedRevenue = cur + Math.max(0, pot - cur) * EXPECTED_GAP_SHARE;
  let fee = 0; let floor = 0;
  for (const t of FEE_TIERS) { if (expectedRevenue > floor) fee += (Math.min(expectedRevenue, t.upTo) - floor) * t.rate; floor = t.upTo; }
  return { expectedRevenue, totalFee: fee, effectivePct: (fee / expectedRevenue) * 100, ours: fee * OUR_SHARE_OF_FEE, theirs: fee * (1 - OUR_SHARE_OF_FEE) };
}
