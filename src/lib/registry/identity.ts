import { editDistance, metresBetween, type NormalizedAddress } from './address';

/**
 * Identity resolution rules (from the NAVEO plan):
 *  - only an exact, unambiguous match is linked automatically;
 *  - address similarity and nearby coordinates are candidate signals, never proof, and go to human review;
 *  - a building and a unit in it are different things, and two units in one building are different units of one property.
 */

export interface PropertyRef {
  id: string;
  address: NormalizedAddress;
  lat?: number | null;
  lng?: number | null;
  /** Unit labels already known for this building. */
  units?: string[];
}

export interface IncomingRecord {
  address: NormalizedAddress;
  lat?: number | null;
  lng?: number | null;
}

export type ReviewReason = 'similar_address' | 'unit_ambiguity' | 'nearby_coordinates';

export type Resolution =
  | { action: 'link'; propertyId: string; unit: string | null; confidence: number; reasons: string[] }
  | { action: 'create'; reasons: string[]; reviews: Array<{ candidateId: string; reason: ReviewReason; score: number; detail: string }> }
  | { action: 'unresolvable'; reasons: string[] };

/** Coordinates sitting on this point are a database default, not a real location, so they are never used for matching. */
const PLACEHOLDER_COORDS = [{ lat: 39.7392, lng: -104.9903 }];
export const NEARBY_METRES = 25;

const realCoords = (p: { lat?: number | null; lng?: number | null }) => {
  if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (p.lat === 0 && p.lng === 0) return null;
  if (PLACEHOLDER_COORDS.some((c) => Math.abs(c.lat - p.lat!) < 1e-4 && Math.abs(c.lng - p.lng!) < 1e-4)) return null;
  return { lat: p.lat, lng: p.lng };
};

const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

/**
 * Whether two different street names might be the same street written two ways. Deliberately narrow: "M St" and "O St", "26th St" and "28th St"
 * or "Clinton Ave W" and "Clinton Ave NW" are one character apart but are different streets, so they are never flagged.
 */
export function similarStreet(a: string, b: string): { score: number; why: string } | null {
  if (a === b) return null;
  const compactA = a.replace(/ /g, ''), compactB = b.replace(/ /g, '');
  if (compactA === compactB) return { score: 0.9, why: 'same name, different spacing' };
  if (compactA.length < 6 || compactB.length < 6) return null;
  if (/\d/.test(compactA) || /\d/.test(compactB)) return null;
  const dirs = (n: string) => n.split(' ').filter((t) => DIRECTIONS.has(t)).join(' ');
  if (dirs(a) !== dirs(b)) return null;
  return editDistance(compactA, compactB) <= 1 ? { score: 0.75, why: 'one letter different' } : null;
}

export function resolveIdentity(incoming: IncomingRecord, candidates: PropertyRef[]): Resolution {
  const a = incoming.address;
  if (!a.usable) {
    return { action: 'unresolvable', reasons: ['The address has no street number, street name or ZIP, so it cannot identify a property.'] };
  }

  const same = candidates.filter((c) => c.address.usable && c.address.key === a.key);
  if (same.length > 1) {
    // Two registry properties already share this address: do not pick one; the person reviewing resolves it.
    return {
      action: 'create',
      reasons: ['More than one existing property matches this address.'],
      reviews: same.map((c) => ({ candidateId: c.id, reason: 'similar_address' as const, score: 0.9, detail: 'Several properties share this address.' })),
    };
  }

  if (same.length === 1) {
    const c = same[0];
    const unit = a.unit;
    if (unit === null && (c.units?.length ?? 0) === 0) {
      return { action: 'link', propertyId: c.id, unit: null, confidence: 0.98, reasons: ['Same normalised address.'] };
    }
    if (unit !== null) {
      // A different unit in the same building is a different unit of the same property, not a different property.
      return { action: 'link', propertyId: c.id, unit, confidence: 0.95, reasons: [`Same building, unit ${unit}.`] };
    }
    // No unit given but the building has known units. The property is the building, so this record belongs to it; which unit (if any) is simply
    // not known, and the link says so (no unit, lower confidence). Nothing is guessed, and no second property is made for the same address.
    return { action: 'link', propertyId: c.id, unit: null, confidence: 0.6, reasons: ['Same building; the address names no unit, so the unit is not known.'] };
  }

  const reviews: Array<{ candidateId: string; reason: ReviewReason; score: number; detail: string }> = [];
  for (const c of candidates) {
    if (!c.address.usable || c.address.zip5 !== a.zip5) continue;
    if (c.address.streetNumber === a.streetNumber) {
      const similar = similarStreet(a.streetName, c.address.streetName);
      if (similar) {
        reviews.push({ candidateId: c.id, reason: 'similar_address', score: similar.score, detail: `"${a.streetName}" vs "${c.address.streetName}" (${similar.why})` });
        continue;
      }
    }
    const pa = realCoords(incoming), pb = realCoords(c);
    if (pa && pb && metresBetween(pa, pb) <= NEARBY_METRES) {
      reviews.push({ candidateId: c.id, reason: 'nearby_coordinates', score: 0.5, detail: `${Math.round(metresBetween(pa, pb))} m apart at different addresses` });
    }
  }
  return { action: 'create', reasons: reviews.length ? ['New property; possible duplicates flagged for review.'] : ['No existing property matches.'], reviews };
}
