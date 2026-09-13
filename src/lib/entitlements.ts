import { FEATURE_COMPARISON, PROSPECT_FINDER_PLANS, type PlanId } from '@/lib/pricing/prospectFinderPlans';

/**
 * Lightweight entitlements helper — reads the same plan/feature config used by
 * the public /plans page so marketing copy and future feature gating never drift.
 *
 * NOTE: No real subscription/billing backend exists yet (see /billing, which is
 * still a mock UI). These functions are ready to wire up once an organization's
 * actual plan is persisted (e.g. organizations.plan_id) — nothing currently calls them.
 */

const FEATURE_KEY_TO_ROW = new Map(FEATURE_COMPARISON.map((row) => [row.key, row]));

export function hasFeature(planId: PlanId, featureKey: string): boolean {
  if (planId === 'enterprise') return true; // Enterprise always has full platform access.
  const row = FEATURE_KEY_TO_ROW.get(featureKey);
  if (!row) return false;
  return row.values[planId] === 'yes';
}

export function getFeatureAvailability(planId: PlanId, featureKey: string) {
  const row = FEATURE_KEY_TO_ROW.get(featureKey);
  return row?.values[planId] ?? 'no';
}

export function getPlanLimits(planId: PlanId) {
  return PROSPECT_FINDER_PLANS[planId].limits;
}

// Internal TRAVLR Vacation Homes org keeps full platform access regardless of the
// public plan tiers above — surfaced in the UI as "Internal" / "Full Platform Access".
export const VAYO_INTERNAL_PLAN_ID = 'enterprise' satisfies PlanId;
