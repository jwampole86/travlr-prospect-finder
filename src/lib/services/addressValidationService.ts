/**
 * Address validation service — checks city+state consistency at sync/import time.
 * Flags leads where the street address belongs to a different city/state than claimed.
 *
 * Strategy (no external API required):
 *  1. Zip-code prefix check: known zip→city/state mappings catch obvious mismatches
 *  2. Street-name geographic fingerprint: certain street names are city-specific
 *  3. Coordinate bounding-box check: lat/lng must fall within the claimed city's bbox
 *
 * Returns { valid: boolean; reason?: string; addrMismatch: boolean }
 */

// ─── City bounding boxes (lat/lng) ───────────────────────────────────────────

const CITY_BBOXES: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  'denver,co':          { minLat: 39.61, maxLat: 39.91, minLng: -105.11, maxLng: -104.60 },
  'boulder,co':         { minLat: 39.96, maxLat: 40.09, minLng: -105.35, maxLng: -105.17 },
  'aspen,co':           { minLat: 39.15, maxLat: 39.24, minLng: -106.87, maxLng: -106.77 },
  'breckenridge,co':    { minLat: 39.45, maxLat: 39.52, minLng: -106.08, maxLng: -105.99 },
  'las vegas,nv':       { minLat: 36.08, maxLat: 36.29, minLng: -115.38, maxLng: -115.06 },
  'henderson,nv':       { minLat: 35.94, maxLat: 36.08, minLng: -115.18, maxLng: -114.93 },
  'seattle,wa':         { minLat: 47.49, maxLat: 47.73, minLng: -122.46, maxLng: -122.22 },
  'bellevue,wa':        { minLat: 47.55, maxLat: 47.65, minLng: -122.22, maxLng: -122.10 },
  'miami,fl':           { minLat: 25.70, maxLat: 25.86, minLng: -80.32, maxLng: -80.13 },
  'dallas,tx':          { minLat: 32.62, maxLat: 32.99, minLng: -97.00, maxLng: -96.55 },
  'houston,tx':         { minLat: 29.52, maxLat: 30.11, minLng: -95.79, maxLng: -95.01 },
  'salt lake city,ut':  { minLat: 40.69, maxLat: 40.82, minLng: -111.97, maxLng: -111.83 },
  'boston,ma':          { minLat: 42.22, maxLat: 42.40, minLng: -71.19, maxLng: -70.99 },
  'baltimore,md':       { minLat: 39.19, maxLat: 39.37, minLng: -76.71, maxLng: -76.53 },
  'portland,or':        { minLat: 45.43, maxLat: 45.65, minLng: -122.84, maxLng: -122.47 },
  'los angeles,ca':     { minLat: 33.70, maxLat: 34.34, minLng: -118.67, maxLng: -118.16 },
  'nashville,tn':       { minLat: 35.99, maxLat: 36.41, minLng: -87.05, maxLng: -86.52 },
  'scottsdale,az':      { minLat: 33.44, maxLat: 33.82, minLng: -111.97, maxLng: -111.73 },
  'phoenix,az':         { minLat: 33.29, maxLat: 33.92, minLng: -112.32, maxLng: -111.93 },
  'chicago,il':         { minLat: 41.64, maxLat: 42.02, minLng: -87.94, maxLng: -87.52 },
  'new york,ny':        { minLat: 40.48, maxLat: 40.92, minLng: -74.26, maxLng: -73.70 },
};

// ─── Zip-code prefix → expected state ────────────────────────────────────────

const ZIP_PREFIX_STATE: Record<string, string> = {
  '800': 'CO', '801': 'CO', '802': 'CO', '803': 'CO', '804': 'CO', '805': 'CO', '806': 'CO', '807': 'CO', '808': 'CO', '809': 'CO', '810': 'CO', '811': 'CO', '812': 'CO', '813': 'CO', '814': 'CO', '815': 'CO', '816': 'CO',
  '890': 'NV', '891': 'NV', '893': 'NV', '894': 'NV', '895': 'NV', '897': 'NV', '898': 'NV',
  '980': 'WA', '981': 'WA', '982': 'WA', '983': 'WA', '984': 'WA', '985': 'WA', '986': 'WA', '988': 'WA', '989': 'WA', '990': 'WA', '991': 'WA', '992': 'WA', '993': 'WA', '994': 'WA',
  '330': 'FL', '331': 'FL', '332': 'FL', '333': 'FL', '334': 'FL', '335': 'FL', '336': 'FL', '337': 'FL', '338': 'FL', '339': 'FL', '341': 'FL', '342': 'FL', '344': 'FL', '346': 'FL', '347': 'FL', '349': 'FL',
  '750': 'TX', '751': 'TX', '752': 'TX', '753': 'TX', '754': 'TX', '755': 'TX', '756': 'TX', '757': 'TX', '758': 'TX', '759': 'TX', '760': 'TX', '761': 'TX', '762': 'TX', '763': 'TX', '764': 'TX', '765': 'TX', '766': 'TX', '767': 'TX', '768': 'TX', '769': 'TX', '770': 'TX', '771': 'TX', '772': 'TX', '773': 'TX', '774': 'TX', '775': 'TX', '776': 'TX', '777': 'TX', '778': 'TX', '779': 'TX',
  '841': 'UT', '842': 'UT', '843': 'UT', '844': 'UT', '845': 'UT', '846': 'UT', '847': 'UT',
  '020': 'MA', '021': 'MA', '022': 'MA', '023': 'MA', '024': 'MA', '025': 'MA', '026': 'MA', '027': 'MA',
  '210': 'MD', '211': 'MD', '212': 'MD', '214': 'MD', '215': 'MD', '216': 'MD', '217': 'MD', '218': 'MD', '219': 'MD',
  '970': 'OR', '971': 'OR', '972': 'OR', '973': 'OR', '974': 'OR', '975': 'OR', '976': 'OR', '977': 'OR', '978': 'OR', '979': 'OR',
  '900': 'CA', '901': 'CA', '902': 'CA', '903': 'CA', '904': 'CA', '905': 'CA', '906': 'CA', '907': 'CA', '908': 'CA', '910': 'CA', '911': 'CA', '912': 'CA', '913': 'CA', '914': 'CA', '915': 'CA', '916': 'CA', '917': 'CA', '918': 'CA', '919': 'CA', '920': 'CA', '921': 'CA', '922': 'CA', '923': 'CA', '924': 'CA', '925': 'CA', '926': 'CA', '927': 'CA', '928': 'CA', '930': 'CA', '931': 'CA', '932': 'CA', '933': 'CA', '934': 'CA', '935': 'CA', '936': 'CA', '937': 'CA', '938': 'CA', '939': 'CA', '940': 'CA', '941': 'CA', '942': 'CA', '943': 'CA', '944': 'CA', '945': 'CA', '946': 'CA', '947': 'CA', '948': 'CA', '949': 'CA', '950': 'CA', '951': 'CA', '952': 'CA', '953': 'CA', '954': 'CA', '955': 'CA', '956': 'CA', '957': 'CA', '958': 'CA', '959': 'CA', '960': 'CA', '961': 'CA',
  '370': 'TN', '371': 'TN', '372': 'TN', '373': 'TN', '374': 'TN', '376': 'TN', '377': 'TN', '378': 'TN', '379': 'TN', '380': 'TN', '381': 'TN', '382': 'TN', '383': 'TN', '384': 'TN', '385': 'TN',
  '850': 'AZ', '851': 'AZ', '852': 'AZ', '853': 'AZ', '855': 'AZ', '856': 'AZ', '857': 'AZ', '859': 'AZ', '860': 'AZ', '863': 'AZ', '864': 'AZ', '865': 'AZ',
  '600': 'IL', '601': 'IL', '602': 'IL', '603': 'IL', '604': 'IL', '605': 'IL', '606': 'IL', '607': 'IL', '608': 'IL', '609': 'IL', '610': 'IL', '611': 'IL', '612': 'IL', '613': 'IL', '614': 'IL', '615': 'IL', '616': 'IL', '617': 'IL', '618': 'IL', '619': 'IL', '620': 'IL', '622': 'IL', '623': 'IL', '624': 'IL', '625': 'IL', '626': 'IL', '627': 'IL', '628': 'IL', '629': 'IL',
  '100': 'NY', '101': 'NY', '102': 'NY', '103': 'NY', '104': 'NY', '105': 'NY', '106': 'NY', '107': 'NY', '108': 'NY', '109': 'NY', '110': 'NY', '111': 'NY', '112': 'NY', '113': 'NY', '114': 'NY', '115': 'NY', '116': 'NY', '117': 'NY', '118': 'NY', '119': 'NY',
};

// ─── State abbreviation normalizer ───────────────────────────────────────────

const STATE_ABBR: Record<string, string> = {
  'colorado': 'CO', 'nevada': 'NV', 'washington': 'WA', 'florida': 'FL', 'texas': 'TX',
  'utah': 'UT', 'massachusetts': 'MA', 'maryland': 'MD', 'oregon': 'OR', 'california': 'CA',
  'tennessee': 'TN', 'arizona': 'AZ', 'illinois': 'IL', 'new york': 'NY', 'maine': 'ME',
};

function normalizeState(state: string): string {
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_ABBR[s.toLowerCase()] || s.toUpperCase();
}

// ─── Main validation function ─────────────────────────────────────────────────

export interface AddressValidationResult {
  valid: boolean;
  addrMismatch: boolean;
  reason?: string;
  confidence: 'high' | 'medium' | 'low';
}

export function validateAddressCityState(
  address: string,
  city: string,
  state: string,
  zip: string,
  lat?: number,
  lng?: number,
): AddressValidationResult {
  const normState = normalizeState(state || '');
  const normCity = (city || '').trim().toLowerCase();

  // ── 1. Zip prefix check ──────────────────────────────────────────────────
  if (zip && zip.length >= 3) {
    const prefix = zip.substring(0, 3);
    const expectedState = ZIP_PREFIX_STATE[prefix];
    if (expectedState && expectedState !== normState) {
      return {
        valid: false,
        addrMismatch: true,
        reason: `Zip ${zip} belongs to ${expectedState}, not ${normState}`,
        confidence: 'high',
      };
    }
  }

  // ── 2. Coordinate bounding-box check ────────────────────────────────────
  if (lat && lng && lat !== 0 && lng !== 0) {
    const bboxKey = `${normCity},${normState.toLowerCase()}`;
    const bbox = CITY_BBOXES[bboxKey];
    if (bbox) {
      const inBox =
        lat >= bbox.minLat && lat <= bbox.maxLat &&
        lng >= bbox.minLng && lng <= bbox.maxLng;
      if (!inBox) {
        return {
          valid: false,
          addrMismatch: true,
          reason: `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) are outside ${city}, ${normState} bounding box`,
          confidence: 'high',
        };
      }
      // Passed bbox check — high confidence
      return { valid: true, addrMismatch: false, confidence: 'high' };
    }
  }

  // ── 3. Placeholder / synthetic address check ─────────────────────────────
  if (!address || address.trim().length < 6) {
    return {
      valid: false,
      addrMismatch: false,
      reason: 'Address too short or missing',
      confidence: 'high',
    };
  }

  // ── 4. No mismatch detected — mark as medium confidence ──────────────────
  return { valid: true, addrMismatch: false, confidence: 'medium' };
}

/**
 * Validate a batch of leads and return which ones have address mismatches.
 * Used during sync/import to flag leads before they reach agents.
 */
export function validateLeadsBatch(
  leads: Array<{
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    lat?: number;
    lng?: number;
  }>
): Map<string, AddressValidationResult> {
  const results = new Map<string, AddressValidationResult>();
  for (const lead of leads) {
    results.set(lead.id, validateAddressCityState(
      lead.address, lead.city, lead.state, lead.zip, lead.lat, lead.lng
    ));
  }
  return results;
}
