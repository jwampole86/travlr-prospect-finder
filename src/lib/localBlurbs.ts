/**
 * Local Blurb Lookup Table — exact text from TRAVLR spec
 * Resolution priority: city/neighborhood → state → neutral fallback
 */

export interface LocalBlurbEntry {
  state: string;
  zone: string; // city or "Statewide"
  blurb: string;
}

export const LOCAL_BLURBS: LocalBlurbEntry[] = [
  // Colorado
  { state: 'CO', zone: 'Denver',       blurb: "we operate throughout Colorado, including the Denver metro, alongside our established presence in Aspen, Breckenridge, and Vail" },
  { state: 'CO', zone: 'Aspen',        blurb: "we've built our Colorado presence right here in Aspen since launching our subsidiary in early 2025" },
  { state: 'CO', zone: 'Breckenridge', blurb: "we've built our Colorado presence right here in Breckenridge since launching our subsidiary in early 2025" },
  { state: 'CO', zone: 'Vail',         blurb: "we've built our Colorado presence right here in Vail since launching our subsidiary in early 2025" },
  // Nevada
  { state: 'NV', zone: 'Las Vegas',    blurb: "we're growing our presence right here in Las Vegas as part of our expanding Nevada portfolio" },
  { state: 'NV', zone: 'Henderson',    blurb: "we're growing our presence right here in Henderson as part of our expanding Nevada portfolio" },
  // Washington
  { state: 'WA', zone: 'Seattle',      blurb: "we're expanding into Washington State, with a growing presence right here in Seattle" },
  { state: 'WA', zone: 'Bellevue',     blurb: "we're expanding into Washington State, with a growing presence right here in Bellevue" },
  { state: 'WA', zone: 'Renton',       blurb: "we're expanding into Washington State, with a growing presence right here in Renton" },
  // California
  { state: 'CA', zone: 'Los Angeles',      blurb: "we manage luxury vacation homes throughout Southern California, including here in Los Angeles" },
  { state: 'CA', zone: 'Sherman Oaks',     blurb: "we manage luxury vacation homes throughout Southern California, including here in Sherman Oaks" },
  { state: 'CA', zone: 'Hollywood',        blurb: "we manage luxury vacation homes throughout Southern California, including here in Hollywood" },
  { state: 'CA', zone: 'Malibu',           blurb: "we manage luxury vacation homes throughout Southern California, including here in Malibu" },
  { state: 'CA', zone: 'Newport Beach',    blurb: "we manage luxury vacation homes throughout Southern California, including here in Newport Beach" },
  // Florida
  { state: 'FL', zone: 'Miami',        blurb: "we're expanding into Florida, with Miami among our first target markets" },
  // Utah
  { state: 'UT', zone: 'Statewide',    blurb: "we're expanding into Utah as one of our newest growth markets" },
  // Maine
  { state: 'ME', zone: 'Statewide',    blurb: "we're expanding into Maine as one of our newest growth markets" },
  // Massachusetts
  { state: 'MA', zone: 'Statewide',    blurb: "we're expanding into Massachusetts as one of our newest growth markets" },
  // Oregon
  { state: 'OR', zone: 'Statewide',    blurb: "we're expanding into Oregon as one of our newest growth markets" },
  // Texas
  { state: 'TX', zone: 'Dallas',       blurb: "we're expanding into Texas, with Dallas among our first target markets" },
  { state: 'TX', zone: 'Houston',      blurb: "we're expanding into Texas, with Houston among our first target markets" },
  // Maryland
  { state: 'MD', zone: 'Baltimore',    blurb: "we're expanding into Maryland, with Baltimore among our first target markets" },
  { state: 'MD', zone: 'Statewide',    blurb: "we're expanding into Maryland as one of our newest growth markets" },
];

export const NEUTRAL_BLURB = "we're actively growing our footprint across the western and eastern US";

/**
 * Resolve the best local blurb for a given city and state.
 * Priority: city match (case-insensitive) → state statewide fallback → neutral fallback
 * Flags the record when falling back to neutral (no entry in table).
 */
export function resolveLocalBlurb(
  city?: string,
  state?: string
): { blurb: string; source: 'city' | 'state' | 'neutral'; needsFlag: boolean } {
  const normalizedState = state?.toUpperCase().trim();
  const normalizedCity  = city?.trim().toLowerCase();

  if (normalizedCity && normalizedState) {
    const cityMatch = LOCAL_BLURBS.find(
      (b) =>
        b.state.toUpperCase() === normalizedState &&
        b.zone.toLowerCase() === normalizedCity
    );
    if (cityMatch) return { blurb: cityMatch.blurb, source: 'city', needsFlag: false };
  }

  if (normalizedState) {
    // State-level fallback: pick the "Statewide" entry if present
    const stateMatch = LOCAL_BLURBS.find(
      (b) => b.state.toUpperCase() === normalizedState && b.zone === 'Statewide'
    );
    if (stateMatch) return { blurb: stateMatch.blurb, source: 'state', needsFlag: false };

    // For states that have city entries but no Statewide entry, use first city entry as state fallback
    const anyStateEntry = LOCAL_BLURBS.find(
      (b) => b.state.toUpperCase() === normalizedState
    );
    if (anyStateEntry) return { blurb: anyStateEntry.blurb, source: 'state', needsFlag: false };
  }

  return { blurb: NEUTRAL_BLURB, source: 'neutral', needsFlag: true };
}

/**
 * All portfolio states for dropdown
 */
export const PORTFOLIO_STATES = [
  { value: 'CO', label: 'Colorado' },
  { value: 'CA', label: 'California' },
  { value: 'NV', label: 'Nevada' },
  { value: 'WA', label: 'Washington' },
  { value: 'UT', label: 'Utah' },
  { value: 'FL', label: 'Florida' },
  { value: 'ME', label: 'Maine' },
  { value: 'OR', label: 'Oregon' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'TX', label: 'Texas' },
  { value: 'MD', label: 'Maryland' },
];
