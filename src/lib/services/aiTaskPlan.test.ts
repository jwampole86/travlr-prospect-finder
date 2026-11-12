import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { withoutTravlr } from './aiTaskPlan';

describe('withoutTravlr', () => {
  it('replaces the retired name with the brand that fits the lead', () => {
    expect(withoutTravlr('Text from TRAVLR Vacation Homes about the estimate', 'NAVEO Stays')).toBe('Text from NAVEO Stays about the estimate');
    expect(withoutTravlr('travlr follow-up, then TRAVLR AI call', 'NAVEO Homes')).toBe('NAVEO Homes follow-up, then NAVEO Homes call');
    expect(withoutTravlr('No old name here', 'NAVEO Stays')).toBe('No old name here');
  });
});
