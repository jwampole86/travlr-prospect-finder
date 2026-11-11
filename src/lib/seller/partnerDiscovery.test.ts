import { describe, expect, it } from 'vitest';
import { parseCandidates } from './partnerDiscovery';

const url = 'https://example-realty.com/agents/jo';

describe('parseCandidates', () => {
  it('keeps candidates whose source page was really searched and cleans their fields', () => {
    const raw = `Here you go: {"candidates":[{"name":"Jo Smith","brokerage":"Example Realty","city":"Bentonville","phone":"(479) 555-0100","email":"not-an-email","website":null,"why":"Lists second homes","sourceUrl":"${url}"}]}`;
    expect(parseCandidates(raw, [url])).toEqual([{ name: 'Jo Smith', brokerage: 'Example Realty', city: 'Bentonville', phone: '(479) 555-0100', email: null, website: null, why: 'Lists second homes', sourceUrl: url }]);
  });

  it('drops candidates citing a page that was not in the search results, and duplicates', () => {
    const raw = `{"candidates":[{"name":"A","sourceUrl":"https://made-up.example"},{"name":"B","sourceUrl":"${url}"},{"name":"B","sourceUrl":"${url}"}]}`;
    expect(parseCandidates(raw, [url]).map((c) => c.name)).toEqual(['B']);
  });

  it('returns nothing when the reply has no JSON', () => {
    expect(parseCandidates('Sorry, I could not find any.', [url])).toEqual([]);
  });
});
