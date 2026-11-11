import { describe, expect, it } from 'vitest';
import { matchPartners, type MatchLead, type MatchPartner, type MatchStats } from './partnerMatch';
import { scorePartner } from './partnerReferrals';

const partner = (over: Partial<MatchPartner> = {}): MatchPartner => ({
  id: 'p1', name: 'Desert Peak', relationship_status: 'active', license_status: 'verified', legal_reviewed: true, agreement_on_file: true, license_state: 'AZ', states: [],
  markets: ['Tucson'], property_types: ['sfr'], price_min: 300000, price_max: 1200000, max_open_leads: 10, do_not_assign: false, match_boost: 0, accepts_referrals: 'yes', exclusive_territory: null, ...over
});
const stats = (over: Partial<MatchStats> = {}): MatchStats => ({ openLeads: 2, score: scorePartner([]), closed: 0, assigned: 0, ...over });
const lead: MatchLead = { state: 'AZ', city: 'Tucson', county: 'Pima', propertyType: 'sfr', salePrice: 650000 };
const run = (ps: MatchPartner[], st: Record<string, MatchStats>, l: MatchLead = lead) => matchPartners(ps, l, new Map(Object.entries(st)));

describe('hard rules', () => {
  it('suggests an active, verified, signed partner licensed in the state who covers the market', () => {
    const r = run([partner()], { p1: stats() });
    expect(r.suggestions.map((s) => s.partner.id)).toEqual(['p1']);
    expect(r.rejected).toEqual([]);
  });

  it('rejects, with reasons, a partner that fails any rule', () => {
    const cases: Array<[Partial<MatchPartner>, RegExp]> = [
      [{ relationship_status: 'paused' }, /paused/], [{ do_not_assign: true }, /do not assign/], [{ license_status: 'unverified' }, /License not verified/],
      [{ agreement_on_file: false }, /Agreement or legal review/], [{ accepts_referrals: 'no' }, /Does not accept/], [{ license_state: 'NV' }, /Not licensed in AZ/],
      [{ markets: ['Phoenix'] }, /Does not cover Tucson/], [{ property_types: ['condo'] }, /Does not take sfr/], [{ price_min: 700000 }, /Below their price range/], [{ price_max: 500000 }, /Above their price range/]
    ];
    for (const [over, re] of cases) {
      const r = run([partner(over)], { p1: stats() });
      expect(r.suggestions, JSON.stringify(over)).toEqual([]);
      expect(r.rejected[0].why.join(' '), JSON.stringify(over)).toMatch(re);
    }
  });

  it('rejects a partner at capacity or who has stopped reporting', () => {
    expect(run([partner({ max_open_leads: 2 })], { p1: stats({ openLeads: 2 }) }).rejected[0].why[0]).toMatch(/At capacity/);
    const NOW = new Date('2026-11-10T00:00:00Z');
    const old = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    const silent = scorePartner([{ status: 'sent', sent_at: old(20), status_at: old(20) }, { status: 'sent', sent_at: old(15), status_at: old(15) }], NOW);
    expect(run([partner()], { p1: stats({ score: silent }) }).rejected[0].why).toContain('Has stopped reporting');
  });

  it('does not filter on what the lead does not say: unknown type or price still matches', () => {
    expect(run([partner()], { p1: stats() }, { ...lead, propertyType: null, salePrice: null }).suggestions).toHaveLength(1);
    expect(run([partner({ markets: [], property_types: [] })], { p1: stats() }).suggestions).toHaveLength(1);
  });

  it('matches a county when the city is not listed, and a county name with the word County', () => {
    expect(run([partner({ markets: ['Pima County'] })], { p1: stats() }).suggestions).toHaveLength(1);
  });
});

describe('ranking', () => {
  it('puts the city match, the reliable reporter and the closer first', () => {
    const NOW = new Date('2026-11-10T00:00:00Z');
    const old = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    const good = scorePartner([{ status: 'closed', sent_at: old(60), status_at: old(10) }, { status: 'listed', sent_at: old(30), status_at: old(5) }], NOW);
    const r = run(
      [partner({ id: 'a', name: 'A county only', markets: ['Pima'] }), partner({ id: 'b', name: 'B city', markets: ['Tucson'] }), partner({ id: 'c', name: 'C reliable', markets: ['Tucson'] })],
      { a: stats(), b: stats(), c: stats({ score: good, closed: 1 }) }
    );
    expect(r.suggestions.map((s) => s.partner.id)).toEqual(['c', 'b', 'a']);
    expect(r.suggestions[0].reasons.join(' ')).toMatch(/Works in Tucson/);
  });

  it('adds a manual boost and an exclusive territory, and ties break by name', () => {
    const r = run([partner({ id: 'a', name: 'Zed', match_boost: 5 }), partner({ id: 'b', name: 'Amy', exclusive_territory: 'Tucson, Oro Valley' }), partner({ id: 'c', name: 'Bob' })], { a: stats(), b: stats(), c: stats() });
    expect(r.suggestions.map((s) => s.partner.id)).toEqual(['b', 'a', 'c']);
  });
});
