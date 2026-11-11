/**
 * Short-term-rental revenue estimate for a lead, one model for every place the app writes or shows "Est. Net/Mo".
 *
 * The earlier model looked only at bedrooms and state, so every 3-bedroom home in a state had the same figure whatever it cost. This one
 * is fitted to AirDNA's own figures for 1,500+ of our leads (price, bedrooms and AirDNA's nightly rate and occupancy). Checked on homes
 * held out of the fit, the old model ran a median 1.7x high and landed within 30% of AirDNA for 22% of homes; this one is within 30% for
 * about 6 in 10 and has no systematic bias. Where AirDNA has figures for the home itself they are blended in by confidence.
 *
 * The same fit is written in SQL in migration 20261111110000 (refresh_str_estimates); change both together.
 */
export const STR_MODEL_VERSION = 'avyro-v2.0';
/** Owner's share of gross after the 20% management fee and about 15% operating costs. */
export const OWNER_NET_SHARE = 0.65;

const SALE = { a: -0.8028, price: 0.3938, beds: 0.2306, occA: 107.52, occAdr: -8.26, occBeds: -1.293 };
const RENT = { a: 1.6982, price: 0.3864, beds: 0.1471, occA: 90.049, occAdr: -6.081, occBeds: 0.432 };
// No usable price: bedrooms alone, at the median occupancy AirDNA reports for our homes.
const BEDS_ONLY = { a: 3.8392, beds: 0.4129, occ: 57 };

const AIRDNA_WEIGHT: Record<string, number> = { high: 1, med: 0.8, medium: 0.8, low: 0.5 };

export interface StrEstimateInput {
  /** Asking price for a sale, monthly rent for a rental. */
  price?: number | null;
  priceType?: string | null;
  beds?: number | null;
  airdna?: { adr?: number | null; occupancy?: number | null; confidence?: string | null } | null;
}

export interface StrEstimate {
  adr: number;
  /** Percent of nights booked. */
  occupancy: number;
  grossMonthly: number;
  netMonthly: number;
  basis: 'airdna' | 'airdna_blend' | 'price' | 'bedrooms';
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Sale prices outside 50k-50M and rents outside $300-$30k are data errors (land, per-room prices, typos), not homes to price from. */
function usablePrice(price: number | null | undefined, type: 'sale' | 'rent'): number | null {
  const p = Number(price);
  if (!Number.isFinite(p)) return null;
  const [lo, hi] = type === 'sale' ? [50_000, 50_000_000] : [300, 30_000];
  return p >= lo && p <= hi ? p : null;
}

export function estimateStrRevenue(input: StrEstimateInput): StrEstimate {
  const type = String(input.priceType || '').toLowerCase() === 'sale' ? 'sale' : 'rent';
  const price = usablePrice(input.price, type);
  const knownBeds = Number(input.beds) > 0 ? clamp(Math.round(Number(input.beds)), 1, 6) : null;
  let adr: number;
  let occupancy: number;
  let basis: StrEstimate['basis'];

  if (price) {
    const m = type === 'sale' ? SALE : RENT;
    // A sale listing with no bedroom count is priced as a 3-bedroom; a rental with none is treated as a studio, like the data it was fitted on.
    const beds = knownBeds ?? (type === 'sale' ? 3 : 0);
    const lnAdr = m.a + m.price * Math.log(price) + m.beds * beds;
    adr = Math.exp(lnAdr);
    occupancy = m.occA + m.occAdr * lnAdr + m.occBeds * beds;
    basis = 'price';
  } else {
    adr = Math.exp(BEDS_ONLY.a + BEDS_ONLY.beds * (knownBeds ?? 3));
    occupancy = BEDS_ONLY.occ;
    basis = 'bedrooms';
  }

  const air = input.airdna;
  const airAdr = Number(air?.adr);
  const airOcc = Number(air?.occupancy);
  if (airAdr > 0 && airOcc > 0) {
    const w = AIRDNA_WEIGHT[String(air?.confidence || '').toLowerCase()] ?? 0.5;
    adr = w * airAdr + (1 - w) * adr;
    occupancy = w * airOcc + (1 - w) * occupancy;
    basis = w === 1 ? 'airdna' : 'airdna_blend';
  }

  adr = Math.round(clamp(adr, 60, 1500));
  occupancy = Math.round(clamp(occupancy, 35, 80));
  const grossMonthly = Math.round(adr * 30 * (occupancy / 100));
  return { adr, occupancy, grossMonthly, netMonthly: Math.round(grossMonthly * OWNER_NET_SHARE), basis };
}
