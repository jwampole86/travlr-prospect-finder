/**
 * Local Blurb Lookup Table — exact text from TRAVLR spec
 * Resolution priority: city/neighborhood → state → neutral fallback
 */

export interface LocalBlurbEntry {
  state: string;
  zone: string; // city or "Statewide"
  blurb: string;
}

export const STATE_NAMES: Record<string, string> = {
  AZ: 'Arizona',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  FL: 'Florida',
  GA: 'Georgia',
  ID: 'Idaho',
  KS: 'Kansas',
  MA: 'Massachusetts',
  MD: 'Maryland',
  ME: 'Maine',
  MN: 'Minnesota',
  MO: 'Missouri',
  MT: 'Montana',
  NC: 'North Carolina',
  NE: 'Nebraska',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NV: 'Nevada',
  NY: 'New York',
  OR: 'Oregon',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  WA: 'Washington',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

export const LOCAL_BLURBS: LocalBlurbEntry[] = [
  // Arizona
  { state: 'AZ', zone: 'Scottsdale', blurb: "we're actively evaluating luxury short-term rental opportunities right here in Scottsdale as part of our Arizona growth market" },
  { state: 'AZ', zone: 'Phoenix',    blurb: "we're actively evaluating luxury short-term rental opportunities across the Phoenix market and greater Arizona" },
  { state: 'AZ', zone: 'Statewide',  blurb: "we're actively evaluating luxury short-term rental opportunities across Arizona" },
  // Colorado
  { state: 'CO', zone: 'Denver',       blurb: "we operate throughout Colorado, including the Denver metro, alongside our established presence in Aspen, Breckenridge, and Vail" },
  { state: 'CO', zone: 'Boulder',      blurb: "we operate throughout Colorado, including Boulder and the Front Range, alongside our established mountain-market presence" },
  { state: 'CO', zone: 'Aspen',        blurb: "we've built our Colorado presence right here in Aspen since launching our subsidiary in early 2025" },
  { state: 'CO', zone: 'Breckenridge', blurb: "we've built our Colorado presence right here in Breckenridge since launching our subsidiary in early 2025" },
  { state: 'CO', zone: 'Vail',         blurb: "we've built our Colorado presence right here in Vail since launching our subsidiary in early 2025" },
  { state: 'CO', zone: 'Frisco',       blurb: "we've built our Colorado presence throughout Summit County, including Frisco and nearby Breckenridge" },
  { state: 'CO', zone: 'Avon',         blurb: "we've built our Colorado presence throughout the Vail Valley, including Avon and nearby Vail" },
  { state: 'CO', zone: 'Steamboat Springs', blurb: "we're actively evaluating mountain-market opportunities in Steamboat Springs as part of our Colorado portfolio" },
  { state: 'CO', zone: 'Statewide',    blurb: "we operate throughout Colorado, from the Front Range to established resort markets like Aspen, Breckenridge, and Vail" },
  // Nevada
  { state: 'NV', zone: 'Las Vegas',    blurb: "we're growing our presence right here in Las Vegas as part of our expanding Nevada portfolio" },
  { state: 'NV', zone: 'Henderson',    blurb: "we're growing our presence right here in Henderson as part of our expanding Nevada portfolio" },
  { state: 'NV', zone: 'Zephyr Cove',  blurb: "we're growing our Nevada presence across both Las Vegas and Lake Tahoe-area resort markets like Zephyr Cove" },
  { state: 'NV', zone: 'Statewide',    blurb: "we're growing our presence across Nevada, from Las Vegas to resort markets around Lake Tahoe" },
  // Washington
  { state: 'WA', zone: 'Seattle',      blurb: "we're expanding into Washington State, with a growing presence right here in Seattle" },
  { state: 'WA', zone: 'Bellevue',     blurb: "we're expanding into Washington State, with a growing presence right here in Bellevue" },
  { state: 'WA', zone: 'Renton',       blurb: "we're expanding into Washington State, with a growing presence right here in Renton" },
  { state: 'WA', zone: 'Sammamish',    blurb: "we're expanding into Washington State, including high-demand Eastside markets like Sammamish" },
  { state: 'WA', zone: 'Poulsbo',      blurb: "we're expanding into Washington State, including waterfront and weekend-drive markets like Poulsbo" },
  { state: 'WA', zone: 'Statewide',    blurb: "we're expanding into Washington State across Seattle, Eastside, and weekend-drive markets" },
  // California
  { state: 'CA', zone: 'Los Angeles',      blurb: "we manage luxury vacation homes throughout Southern California, including here in Los Angeles" },
  { state: 'CA', zone: 'Sherman Oaks',     blurb: "we manage luxury vacation homes throughout Southern California, including here in Sherman Oaks" },
  { state: 'CA', zone: 'Studio City',      blurb: "we manage luxury vacation homes throughout Southern California, including Studio City and the surrounding Valley markets" },
  { state: 'CA', zone: 'North Hollywood',  blurb: "we manage luxury vacation homes throughout Southern California, including North Hollywood and the surrounding Valley markets" },
  { state: 'CA', zone: 'Hollywood',        blurb: "we manage luxury vacation homes throughout Southern California, including here in Hollywood" },
  { state: 'CA', zone: 'Malibu',           blurb: "we manage luxury vacation homes throughout Southern California, including here in Malibu" },
  { state: 'CA', zone: 'Newport Beach',    blurb: "we manage luxury vacation homes throughout Southern California, including here in Newport Beach" },
  { state: 'CA', zone: 'Palm Springs',     blurb: "we manage luxury vacation homes throughout Southern California, including desert resort markets like Palm Springs" },
  { state: 'CA', zone: 'Palm Desert',      blurb: "we manage luxury vacation homes throughout Southern California, including desert resort markets like Palm Desert" },
  { state: 'CA', zone: 'La Quinta',        blurb: "we manage luxury vacation homes throughout Southern California, including Coachella Valley markets like La Quinta" },
  { state: 'CA', zone: 'Indio',            blurb: "we manage luxury vacation homes throughout Southern California, including Coachella Valley markets like Indio" },
  { state: 'CA', zone: 'Rancho Mirage',    blurb: "we manage luxury vacation homes throughout Southern California, including Coachella Valley markets like Rancho Mirage" },
  { state: 'CA', zone: 'San Diego',        blurb: "we manage luxury vacation homes throughout Southern California, including coastal markets like San Diego" },
  { state: 'CA', zone: 'La Jolla',         blurb: "we manage luxury vacation homes throughout Southern California, including coastal markets like La Jolla" },
  { state: 'CA', zone: 'Encinitas',        blurb: "we manage luxury vacation homes throughout Southern California, including coastal markets like Encinitas" },
  { state: 'CA', zone: 'Santa Barbara',    blurb: "we manage luxury vacation homes throughout Southern California, including coastal markets like Santa Barbara" },
  { state: 'CA', zone: 'Truckee',          blurb: "we manage luxury vacation homes across California, including mountain resort markets like Truckee" },
  { state: 'CA', zone: 'South Lake Tahoe', blurb: "we manage luxury vacation homes across California, including mountain resort markets like South Lake Tahoe" },
  { state: 'CA', zone: 'Statewide',        blurb: "we manage luxury vacation homes throughout California, from coastal Southern California to desert and mountain resort markets" },
  // Florida
  { state: 'FL', zone: 'Miami',            blurb: "we're expanding into Florida, with Miami among our first target markets" },
  { state: 'FL', zone: 'Miami Beach',      blurb: "we're expanding into Florida, including high-demand coastal markets like Miami Beach" },
  { state: 'FL', zone: 'West Palm Beach',  blurb: "we're expanding into Florida, including Palm Beach County markets like West Palm Beach" },
  { state: 'FL', zone: 'Palm Beach Gardens', blurb: "we're expanding into Florida, including Palm Beach County markets like Palm Beach Gardens" },
  { state: 'FL', zone: 'Naples',           blurb: "we're expanding into Florida, including luxury Gulf Coast markets like Naples" },
  { state: 'FL', zone: 'Fort Lauderdale',  blurb: "we're expanding into Florida, including Broward County markets like Fort Lauderdale" },
  { state: 'FL', zone: 'Boca Raton',       blurb: "we're expanding into Florida, including South Florida markets like Boca Raton" },
  { state: 'FL', zone: 'Tampa',            blurb: "we're expanding into Florida, including Gulf Coast markets like Tampa" },
  { state: 'FL', zone: 'Statewide',        blurb: "we're expanding into Florida across coastal, Gulf Coast, and South Florida markets" },
  // Georgia
  { state: 'GA', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Georgia" },
  // Idaho
  { state: 'ID', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Idaho" },
  // Tennessee
  { state: 'TN', zone: 'Nashville',    blurb: "we're actively evaluating short-term rental opportunities in Nashville as part of our Tennessee growth market" },
  { state: 'TN', zone: 'Franklin',     blurb: "we're actively evaluating short-term rental opportunities around Franklin and the greater Nashville market" },
  { state: 'TN', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Tennessee" },
  // Utah
  { state: 'UT', zone: 'Park City',    blurb: "we're expanding into Utah, including resort markets like Park City" },
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
  { state: 'TX', zone: 'Statewide',    blurb: "we're expanding into Texas across major metro and drive-to leisure markets" },
  // Maryland
  { state: 'MD', zone: 'Baltimore',    blurb: "we're expanding into Maryland, with Baltimore among our first target markets" },
  { state: 'MD', zone: 'Statewide',    blurb: "we're expanding into Maryland as one of our newest growth markets" },
  // Other active lead states
  { state: 'CT', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Connecticut" },
  { state: 'KS', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Kansas" },
  { state: 'MN', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Minnesota" },
  { state: 'MO', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Missouri" },
  { state: 'MT', zone: 'Bozeman',      blurb: "we're actively evaluating mountain-market opportunities in Bozeman as part of our Montana growth market" },
  { state: 'MT', zone: 'Statewide',    blurb: "we're actively evaluating mountain-market opportunities across Montana" },
  { state: 'NC', zone: 'Charlotte',    blurb: "we're actively evaluating short-term rental opportunities in Charlotte as part of our North Carolina growth market" },
  { state: 'NC', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across North Carolina" },
  { state: 'NE', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Nebraska" },
  { state: 'NH', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across New Hampshire" },
  { state: 'NJ', zone: 'Asbury Park',  blurb: "we're actively evaluating coastal short-term rental opportunities in Asbury Park as part of our New Jersey growth market" },
  { state: 'NJ', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across New Jersey" },
  { state: 'NM', zone: 'Santa Fe',     blurb: "we're actively evaluating short-term rental opportunities in Santa Fe as part of our New Mexico growth market" },
  { state: 'NM', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across New Mexico" },
  { state: 'NY', zone: 'Greenport',    blurb: "we're actively evaluating coastal and weekend-drive opportunities in Greenport as part of our New York growth market" },
  { state: 'NY', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across New York" },
  { state: 'VT', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Vermont" },
  { state: 'WI', zone: 'Statewide',    blurb: "we're actively evaluating short-term rental opportunities across Wisconsin" },
  { state: 'WY', zone: 'Jackson',      blurb: "we're actively evaluating mountain-market opportunities in Jackson as part of our Wyoming growth market" },
  { state: 'WY', zone: 'Statewide',    blurb: "we're actively evaluating mountain-market opportunities across Wyoming" },
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
    if (stateMatch) {
      if (normalizedCity && STATE_NAMES[normalizedState]) {
        const cityName = city?.trim();
        return {
          blurb: `we're actively evaluating short-term rental opportunities in ${cityName} and across ${STATE_NAMES[normalizedState]}`,
          source: 'city',
          needsFlag: false,
        };
      }
      return { blurb: stateMatch.blurb, source: 'state', needsFlag: false };
    }

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
  { value: 'AZ', label: 'Arizona' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CA', label: 'California' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'NV', label: 'Nevada' },
  { value: 'WA', label: 'Washington' },
  { value: 'UT', label: 'Utah' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'ID', label: 'Idaho' },
  { value: 'KS', label: 'Kansas' },
  { value: 'ME', label: 'Maine' },
  { value: 'OR', label: 'Oregon' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'MD', label: 'Maryland' },
  { value: 'VT', label: 'Vermont' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];
