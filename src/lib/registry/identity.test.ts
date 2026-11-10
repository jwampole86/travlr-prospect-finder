import { describe, expect, it } from 'vitest';
import { editDistance, metresBetween, normalizeAddress } from './address';
import { resolveIdentity, type PropertyRef } from './identity';

const addr = (address: string, zip = '80302', city = 'Boulder', state = 'CO') => normalizeAddress({ address, city, state, zip });
const prop = (id: string, address: string, extra: Partial<PropertyRef> = {}, zip = '80302'): PropertyRef => ({ id, address: addr(address, zip), ...extra });

describe('normalizeAddress', () => {
  it('makes spelling variants of one address identical', () => {
    const a = addr('504 North 8th Street');
    const b = addr('504 N 8th St.');
    expect(a.key).toBe(b.key);
    expect(a.streetNumber).toBe('504');
  });

  it('separates the unit from the building, however it is written', () => {
    for (const raw of ['12 Pine Ave Apt 4B', '12 Pine Ave #4B', '12 Pine Avenue, Unit 4b', '12 Pine Ave Ste 4B']) {
      const n = addr(raw);
      expect(n.unit, raw).toBe('4b');
      expect(n.key, raw).toBe(addr('12 Pine Ave').key);
    }
    expect(addr('12 Pine Ave').unit).toBeNull();
  });

  it('takes a city, state and ZIP written into the street line off the end, only when they match', () => {
    const plain = addr('1438 Hillcrest Rd', '93103', 'Santa Barbara', 'CA');
    expect(addr('1438 Hillcrest Rd, Santa Barbara, CA 93103', '93103', 'Santa Barbara', 'CA').key).toBe(plain.key);
    expect(addr('1438 Hillcrest Rd Santa Barbara CA 93103', '93103', 'Santa Barbara', 'CA').streetName).toBe('hillcrest rd');
    expect(addr('12 Pine Ave #4B, Denver, CO 80202', '80202', 'Denver', 'CO')).toMatchObject({ unit: '4b', streetName: 'pine ave' });
    // a different city in the text is left alone, and a street is never stripped to nothing
    expect(addr('12 Denver Ave', '80202', 'Denver', 'CO').streetName).toBe('denver ave');
    expect(addr('12 Elm St, Aspen, CO 81611', '80202', 'Denver', 'CO').streetName).toContain('aspen');
  });

  it('reads a unit after a hash even when it has a space in it', () => {
    expect(addr('495 Liholiho St #Penthouse 5', '96793')).toMatchObject({ unit: 'penthouse 5', streetName: 'liholiho st' });
    expect(addr('495 Liholiho St #Penthouse 2', '96793').key).toBe(addr('495 Liholiho St #Penthouse 5', '96793').key);
  });

  it('is unusable without a street number, street name or ZIP', () => {
    expect(addr('Pine Ave').usable).toBe(false);
    expect(addr('12').usable).toBe(false);
    expect(normalizeAddress({ address: '12 Pine Ave', zip: '' }).usable).toBe(false);
    expect(normalizeAddress({ address: '', zip: '80302' }).usable).toBe(false);
  });

  it('reads a ZIP+4 as its five digits', () => {
    expect(normalizeAddress({ address: '12 Pine Ave', zip: '80302-1234' }).zip5).toBe('80302');
  });
});

describe('editDistance / metresBetween', () => {
  it('counts edits and caps them', () => {
    expect(editDistance('pine st', 'pine st')).toBe(0);
    expect(editDistance('pine st', 'pyne st')).toBe(1);
    expect(editDistance('pine st', 'oak ave')).toBe(3);
  });
  it('measures distance', () => {
    expect(metresBetween({ lat: 40, lng: -105 }, { lat: 40, lng: -105 })).toBe(0);
    expect(Math.round(metresBetween({ lat: 40, lng: -105 }, { lat: 40.001, lng: -105 }))).toBeGreaterThan(100);
  });
});

describe('resolveIdentity', () => {
  it('links an exact address match', () => {
    const r = resolveIdentity({ address: addr('504 N 8th St') }, [prop('p1', '504 North 8th Street')]);
    expect(r).toMatchObject({ action: 'link', propertyId: 'p1', unit: null });
  });

  it('creates a new property when nothing matches, with no review noise', () => {
    const r = resolveIdentity({ address: addr('9 Elm Ct') }, [prop('p1', '504 N 8th St')]);
    expect(r).toMatchObject({ action: 'create', reviews: [] });
  });

  it('links a different unit to the same building rather than treating it as a new property', () => {
    const r = resolveIdentity({ address: addr('12 Pine Ave #5') }, [prop('p1', '12 Pine Ave', { units: ['4b'] })]);
    expect(r).toMatchObject({ action: 'link', propertyId: 'p1', unit: '5' });
  });

  it('links a unit-less address to the building without guessing a unit, at lower confidence', () => {
    const r = resolveIdentity({ address: addr('12 Pine Ave') }, [prop('p1', '12 Pine Ave', { units: ['4b', '5'] })]);
    expect(r).toMatchObject({ action: 'link', propertyId: 'p1', unit: null, confidence: 0.6 });
  });

  it('sends a near-identical street name to review instead of merging', () => {
    const r = resolveIdentity({ address: addr('12 Pyne Ave') }, [prop('p1', '12 Pine Ave')]);
    expect(r.action).toBe('create');
    expect((r as { reviews: Array<{ reason: string; candidateId: string }> }).reviews).toEqual([expect.objectContaining({ reason: 'similar_address', candidateId: 'p1' })]);
  });

  it('flags the same street written with different spacing, and does not flag different streets one character apart', () => {
    const spaced = resolveIdentity({ address: addr('13500 Golfview Dr') }, [prop('p1', '13500 Golf View Dr')]);
    expect((spaced as { reviews: Array<{ reason: string; score: number }> }).reviews).toEqual([expect.objectContaining({ reason: 'similar_address', score: 0.9 })]);
    for (const [a, b] of [['930 M St NW', '930 O St NW'], ['51 NW 28th St', '51 NW 26th St'], ['600 Clinton Ave W', '600 Clinton Ave NW'], ['408 S 13th St', '408 SW 13th St']]) {
      expect((resolveIdentity({ address: addr(a, '20001') }, [prop('p1', b, {}, '20001')]) as { reviews: unknown[] }).reviews, `${a} vs ${b}`).toEqual([]);
    }
  });

  it('flags nearby coordinates at different addresses, but ignores the database default coordinates', () => {
    const near = resolveIdentity(
      { address: addr('20 Oak Rd'), lat: 40.0150, lng: -105.2705 },
      [prop('p1', '22 Birch Rd', { lat: 40.01501, lng: -105.27051 })],
    );
    expect((near as { reviews: unknown[] }).reviews).toHaveLength(1);
    const placeholder = resolveIdentity(
      { address: addr('20 Oak Rd'), lat: 39.7392, lng: -104.9903 },
      [prop('p1', '22 Birch Rd', { lat: 39.7392, lng: -104.9903 })],
    );
    expect((placeholder as { reviews: unknown[] }).reviews).toHaveLength(0);
  });

  it('does not compare across ZIP codes', () => {
    const r = resolveIdentity({ address: addr('504 N 8th St', '80301') }, [prop('p1', '504 N 8th St', {}, '80302')]);
    expect(r).toMatchObject({ action: 'create', reviews: [] });
  });

  it('reports an unusable address instead of inventing a property', () => {
    expect(resolveIdentity({ address: addr('Unknown') }, [])).toMatchObject({ action: 'unresolvable' });
  });

  it('does not pick between two registry properties that already share an address', () => {
    const r = resolveIdentity({ address: addr('504 N 8th St') }, [prop('p1', '504 N 8th St'), prop('p2', '504 North 8th Street')]);
    expect(r.action).toBe('create');
    expect((r as { reviews: unknown[] }).reviews).toHaveLength(2);
  });
});
