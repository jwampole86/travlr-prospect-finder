import { describe, expect, it } from 'vitest';
import { dropListingBroker, parseCandidates } from './partnerDiscovery';

const url = 'https://example-realty.com/agents/jo';
const refUrl = 'https://example-realty.com/referrals';

describe('parseCandidates', () => {
  it('keeps candidates whose source page was really searched and cleans their fields', () => {
    const raw = `Here you go: {"candidates":[{"name":"Jo Smith","brokerage":"Example Realty","city":"Bentonville","phone":"(479) 555-0100","email":"not-an-email","website":null,"why":"Lists second homes","sourceUrl":"${url}"}]}`;
    const [c] = parseCandidates(raw, [url]);
    expect(c).toMatchObject({ name: 'Jo Smith', brokerage: 'Example Realty', city: 'Bentonville', phone: '(479) 555-0100', email: null, website: null, sourceUrl: url, acceptsReferrals: 'unknown' });
  });

  it('drops candidates citing a page that was not in the search results, and duplicates', () => {
    const raw = `{"candidates":[{"name":"A","sourceUrl":"https://made-up.example"},{"name":"B","sourceUrl":"${url}"},{"name":"B","sourceUrl":"${url}"}]}`;
    expect(parseCandidates(raw, [url]).map((c) => c.name)).toEqual(['B']);
  });

  it('returns nothing when the reply has no JSON', () => {
    expect(parseCandidates('Sorry, I could not find any.', [url])).toEqual([]);
  });

  it('ranks a verified referral partner above a higher self-scored one with no proof', () => {
    const raw = JSON.stringify({ candidates: [
      { name: 'Confident', sourceUrl: url, matchScore: 95, acceptsReferrals: 'yes', referralUrl: 'https://made-up.example/ref', handlesInvestment: 'unknown' },
      { name: 'Proven', sourceUrl: url, matchScore: 60, acceptsReferrals: 'yes', referralUrl: refUrl, referralEvidence: 'Refer a client program', handlesInvestment: 'yes', licensedInState: 'yes', phone: '(479) 555-0100' },
    ] });
    const out = parseCandidates(raw, [url, refUrl]);
    expect(out.map((c) => c.name)).toEqual(['Proven', 'Confident']);
    expect(out[1].acceptsReferrals).toBe('unknown');
    expect(out[0].referralUrl).toBe(refUrl);
  });

  it('puts a brokerage that says it takes no referrals last', () => {
    const raw = JSON.stringify({ candidates: [
      { name: 'No', sourceUrl: url, matchScore: 90, acceptsReferrals: 'no' },
      { name: 'Maybe', sourceUrl: url, matchScore: 50 },
    ] });
    expect(parseCandidates(raw, [url]).map((c) => c.name)).toEqual(['Maybe', 'No']);
  });

  it('drops buyer sources that belong to the listing brokerage', () => {
    const raw = JSON.stringify({ candidates: [
      { name: 'Wendy Fusselman', brokerage: 'Collier & Associates', sourceUrl: url },
      { name: 'Taylor Team', brokerage: 'Keller Williams Market Pro Realty', sourceUrl: url },
    ] });
    const all = parseCandidates(raw, [url]);
    expect(dropListingBroker(all, 'Collier & Associates- Rogers Branch').map((c) => c.name)).toEqual(['Taylor Team']);
    expect(dropListingBroker(all, null)).toHaveLength(2);
  });
});
