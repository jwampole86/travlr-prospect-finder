/** Normalizes a street line so registry addresses and property records compare equal (suffix and direction abbreviations). */
const SFX: Record<string, string> = { DRIVE: 'DR', STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', LANE: 'LN', COURT: 'CT', CIRCLE: 'CIR', PLACE: 'PL', BOULEVARD: 'BLVD', TERRACE: 'TER', TRAIL: 'TRL', WAY: 'WAY', PARKWAY: 'PKWY', HIGHWAY: 'HWY', ROUTE: 'RTE', LOOP: 'LOOP', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' };
export const normStreet = (s: string) => s.toUpperCase().split(',')[0].replace(/[.#]/g, ' ').split(/\s+/).filter(Boolean).map(w => SFX[w] ?? w).join(' ');
