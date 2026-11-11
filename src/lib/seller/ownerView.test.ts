import { describe, expect, it } from 'vitest';
import { ownerMilestone, ownerRecommendation } from './ownerView';

describe('ownerMilestone', () => {
  it('follows the partner referral when there is one', () => {
    expect(ownerMilestone('contacted', 'open').key).toBe('contacted');
    expect(ownerMilestone('dead', 'open').label).toBe('This introduction has ended');
  });
  it('is "being reviewed" with no referral, and "on hold" when paused', () => {
    expect(ownerMilestone(null, 'open').key).toBe('in_review');
    expect(ownerMilestone(null, 'paused').key).toBe('paused');
  });
});

describe('ownerRecommendation', () => {
  it('shares the recommendation and reasons but never the score or fee fields', () => {
    const out = ownerRecommendation({ timeline: '6 months', occupancy: 'owner_occupied', goals: [], intent_score: 80, service_fit_score: 70 }, { regulation_status: 'Allowed', estimated_net_monthly: 2000 });
    expect(out?.label).toBeTruthy();
    expect(Object.keys(out ?? {})).toEqual(['recommendation', 'label', 'reasons', 'cautions', 'earnWhileYouSell']);
  });
  it('has nothing to say without an opportunity', () => expect(ownerRecommendation(null, {})).toBeNull());
});
