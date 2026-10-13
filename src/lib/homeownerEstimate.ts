import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  HomeownerReport, EstimateScenario, RegulationReport, RegulationRequirement, RegulationTone, PermitDetails,
} from '@/lib/homeownerEstimateTypes';
import { tidySentence } from '@/lib/homeownerReportContent';
import { airdnaFiguresFor } from '@/lib/services/airdnaEstimate';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const NAME_TO_CODE = Object.fromEntries(Object.entries(STATE_NAMES).map(([c, n]) => [n.toLowerCase(), c]));

// Same ADR-by-bedroom and state multipliers the lead importer uses, so a homeowner sees the numbers our agents see.
const BASE_ADR: Record<number, number> = { 1: 120, 2: 175, 3: 225, 4: 295, 5: 380, 6: 450 };
const STATE_MULT: Record<string, number> = {
  CA: 1.35, NY: 1.30, WA: 1.20, CO: 1.15, FL: 1.25, TX: 1.10, NV: 1.20, MA: 1.25, OR: 1.10, ME: 1.05,
  UT: 1.10, MD: 1.15, AZ: 1.10, ID: 1.05, MT: 1.05, WY: 1.05, HI: 1.35, TN: 1.10, NC: 1.05,
};
// Median asking rent relative to the ZIP's typical rent, by bedroom count (from our own rental listings).
const BED_RENT_MULT: Record<number, number> = { 1: 0.9, 2: 1.0, 3: 1.2, 4: 1.55, 5: 1.75, 6: 2.0 };

// Cost shares of gross revenue. They add to 35%, so net is 65% of gross, matching the lead database.
const COST_SHARES = [
  { label: 'TRAVLR management fee', pct: 20 },
  { label: 'Cleaning & turnover', pct: 7 },
  { label: 'Platform & payment fees', pct: 3 },
  { label: 'Supplies & utilities', pct: 5 },
];

const GENERIC_CHECKLIST = [
  'City or county short-term rental permit or business license',
  'Lodging (occupancy) tax registration, and state sales tax where it applies',
  'Working smoke and carbon monoxide detectors, a fire extinguisher and posted emergency information',
  'Short-term rental insurance (standard homeowner policies often exclude it)',
  'HOA or deed restriction check, and a zoning confirmation for your parcel',
  'A local contact who can respond to guest or neighbor issues',
];

export interface ParsedAddress { street: string; city: string; state: string; zip: string }

export function parseAddress(raw: string): ParsedAddress {
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
    .filter(p => !/^(usa|us|u\.s\.a\.?|united states( of america)?)$/i.test(p));
  const street = parts[0] || '';
  let zip = '';
  let state = '';
  let stateIdx = -1;
  for (let i = parts.length - 1; i >= 1; i--) {
    let part = parts[i];
    const z = part.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (z) { zip = zip || z[1]; part = part.replace(z[0], '').trim(); }
    if (!state && part) {
      const code = part.toUpperCase();
      if (STATE_NAMES[code] && code.length === 2) { state = code; stateIdx = i; }
      else if (NAME_TO_CODE[part.toLowerCase()]) { state = NAME_TO_CODE[part.toLowerCase()]; stateIdx = i; }
    }
  }
  const city = stateIdx > 1 ? parts[stateIdx - 1].replace(/\b\d{5}\b/, '').trim() : (parts[1] || '').replace(/\b\d{5}\b/, '').trim();
  return { street, city: city === street ? '' : city, state, zip };
}

const round25 = (n: number) => Math.round(n / 25) * 25;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

interface LeadFacts {
  id: string; address: string; airdnaAdr: number | null; airdnaOccupancy: number | null; airdnaCheckedAt: string | null;
  beds: number | null; baths: number | null; type: string | null; price: number | null; priceType: string | null;
  rent: number | null; adr: number | null; occupancy: number | null;
}

async function findLead(db: ReturnType<typeof getSupabaseAdmin>, a: ParsedAddress): Promise<LeadFacts | null> {
  if (!a.street || !a.state) return null;
  const number = a.street.match(/^\d+/)?.[0];
  if (!number) return null;
  const safe = a.street.replace(/[%_\\,()]/g, ' ').replace(/\s+/g, ' ').trim();
  const { data } = await db.from('leads')
    .select('id,address,city,beds,baths,property_type,price,price_type,estimated_monthly_rent_ai,estimated_adr,estimated_occupancy,airdna_adr,airdna_occupancy,airdna_checked_at')
    .eq('state', a.state).ilike('address', `${safe}%`).or('is_synthetic.is.null,is_synthetic.eq.false').limit(5);
  const lead = (data ?? []).find(l => !a.city || String(l.city || '').toLowerCase() === a.city.toLowerCase()) ?? null;
  if (!lead) return null;
  return {
    id: String(lead.id), address: String(lead.address ?? ''), airdnaAdr: lead.airdna_adr ? Number(lead.airdna_adr) : null, airdnaOccupancy: lead.airdna_occupancy ? Number(lead.airdna_occupancy) : null, airdnaCheckedAt: lead.airdna_checked_at ?? null,
    beds: lead.beds ? Math.round(Number(lead.beds)) : null,
    baths: lead.baths ? Number(lead.baths) : null,
    type: lead.property_type ? String(lead.property_type) : null,
    price: lead.price ? Number(lead.price) : null,
    priceType: lead.price_type ? String(lead.price_type) : null,
    rent: lead.estimated_monthly_rent_ai ? Number(lead.estimated_monthly_rent_ai) : null,
    adr: lead.estimated_adr ? Number(lead.estimated_adr) : null,
    occupancy: lead.estimated_occupancy ? Number(lead.estimated_occupancy) : null,
  };
}

async function rentIndex(db: ReturnType<typeof getSupabaseAdmin>, a: ParsedAddress): Promise<number | null> {
  const tries: Array<[string, string]> = [];
  if (a.zip) { tries.push(['zip', a.zip], ['zip3', a.zip.slice(0, 3)]); }
  if (a.state) tries.push(['state', a.state]);
  for (const [type, key] of tries) {
    const { data } = await db.from('market_cost_benchmarks').select('rent_index').eq('geo_type', type).eq('geo_key', key).maybeSingle();
    if (data?.rent_index && Number(data.rent_index) > 0) return Number(data.rent_index);
  }
  return null;
}

const REG_TONE: Record<string, RegulationTone> = {
  ALLOWED: 'good', ALLOWED_WITH_REQUIREMENTS: 'good', PERMIT_REQUIRED: 'good',
  RESTRICTED: 'caution', PRIMARY_RESIDENCE_REQUIRED: 'caution', PROHIBITED: 'bad',
  UNKNOWN: 'unknown', REVIEW_REQUIRED: 'unknown',
};
const REG_HEADLINE: Record<string, string> = {
  ALLOWED: 'Short-term rentals are allowed here',
  ALLOWED_WITH_REQUIREMENTS: 'Allowed, with local requirements',
  PERMIT_REQUIRED: 'Allowed with a permit',
  RESTRICTED: 'Allowed with restrictions',
  PRIMARY_RESIDENCE_REQUIRED: 'Primary residences only',
  PROHIBITED: 'Short-term rentals are restricted or prohibited here',
  UNKNOWN: 'Local rules are being confirmed',
  REVIEW_REQUIRED: 'Local rules are being confirmed',
};

function permitDetails(row: Record<string, any>): PermitDetails | null {
  const steps: string[] = Array.isArray(row.permit_steps) ? row.permit_steps.map(String).filter(Boolean) : [];
  const safety: Array<{ item: string; detail: string }> = Array.isArray(row.safety_requirements)
    ? row.safety_requirements.filter((s: any) => s?.item).map((s: any) => ({ item: String(s.item), detail: tidySentence(String(s.detail || '')) || '' }))
    : [];
  const cost = tidySentence(row.permit_cost_summary);
  if (!steps.length && !safety.length && !cost) return null;
  const n = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    name: row.permit_name ? String(row.permit_name) : null,
    costSummary: cost,
    costLow: n(row.permit_cost_low),
    costHigh: n(row.permit_cost_high),
    renewal: tidySentence(row.permit_renewal),
    processingTime: tidySentence(row.permit_processing_time),
    applicationUrl: /^https:\/\//i.test(String(row.permit_application_url || '')) ? String(row.permit_application_url) : null,
    steps, safety,
  };
}

function yn(v: unknown): boolean | null { return typeof v === 'boolean' ? v : null; }

async function regulationFor(db: ReturnType<typeof getSupabaseAdmin>, a: ParsedAddress): Promise<RegulationReport> {
  const place = [a.city, a.state].filter(Boolean).join(', ') || 'your area';
  const empty: RegulationReport = {
    found: false, jurisdiction: place, status: 'UNKNOWN', tone: 'unknown', headline: REG_HEADLINE.UNKNOWN,
    summary: `We have not finished documenting the short-term rental rules for ${place}. The checklist below covers what almost every market requires, and your TRAVLR specialist will confirm the exact permit and tax steps for your address before anything is listed.`,
    requirements: [], taxes: null, additional: null, sourceName: null, sourceUrl: null, lastVerified: null, aiResearched: false,
    typicalChecklist: GENERIC_CHECKLIST, note: null, permit: null,
  };
  if (!a.city || !a.state) return empty;

  const { data } = await db.from('city_regulations').select('*')
    .eq('state', a.state).ilike('city', a.city.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
  if (!data) return empty;

  const status = String(data.status || 'UNKNOWN');
  const resolved = !['UNKNOWN', 'REVIEW_REQUIRED'].includes(status);
  if (!resolved) return { ...empty, jurisdiction: String(data.jurisdiction_name || place) };

  const reqs: RegulationRequirement[] = [];
  const add = (label: string, flag: boolean | null, yes: string, no: string) => {
    if (flag === true) reqs.push({ label, value: yes, required: true });
    else if (flag === false) reqs.push({ label, value: no, required: false });
  };
  add('Permit', yn(data.permit_required), 'Required before you host', 'Not required');
  add('License', yn(data.license_required), 'Required', 'Not required');
  add('Registration', yn(data.registration_required), 'Required', 'Not required');
  add('Primary residence', yn(data.primary_residence_required), 'The home must be your primary residence', 'Investment or second homes are allowed');
  add('Owner occupancy', yn(data.owner_occupancy_required), 'Owner must live on site', 'Not required');
  add('Local contact', yn(data.local_contact_required), 'A local contact must be named', 'Not required');
  add('Host presence', yn(data.host_presence_required), 'Host must be present during stays', 'Not required');
  add('Inspection', yn(data.inspection_required), 'Safety inspection required', 'Not required');
  if (Number(data.night_cap) > 0) reqs.push({ label: 'Annual night cap', value: `${data.night_cap} nights per year`, required: true });
  if (Number(data.minimum_stay) > 0) reqs.push({ label: 'Minimum stay', value: `${data.minimum_stay} nights`, required: true });
  if (Number(data.maximum_stay) > 0) reqs.push({ label: 'Maximum stay', value: `${data.maximum_stay} nights`, required: null });
  if (Number(data.occupancy_limit) > 0) reqs.push({ label: 'Guest limit', value: `${data.occupancy_limit} guests`, required: null });
  if (data.parking_requirements) reqs.push({ label: 'Parking', value: String(data.parking_requirements), required: null });
  if (data.insurance_requirements) reqs.push({ label: 'Insurance', value: String(data.insurance_requirements), required: true });
  if (data.zoning_restrictions) reqs.push({ label: 'Zoning', value: String(data.zoning_restrictions), required: null });
  if (data.hoa_consideration) reqs.push({ label: 'HOA', value: String(data.hoa_consideration), required: null });

  const prohibited = status === 'PROHIBITED';
  return {
    found: true,
    jurisdiction: String(data.jurisdiction_name || place),
    status,
    tone: REG_TONE[status] ?? 'unknown',
    headline: REG_HEADLINE[status] ?? REG_HEADLINE.UNKNOWN,
    summary: String(data.summary || data.agent_summary || ''),
    requirements: reqs,
    taxes: data.tax_requirements ? String(data.tax_requirements) : null,
    additional: data.additional_restrictions ? String(data.additional_restrictions) : null,
    sourceName: data.source_name ? String(data.source_name) : null,
    sourceUrl: data.source_url ? String(data.source_url) : null,
    lastVerified: data.last_verified_at ? String(data.last_verified_at) : null,
    aiResearched: data.source_type === 'AI_RESEARCHED',
    typicalChecklist: [],
    permit: permitDetails(data),
    note: prohibited
      ? 'Revenue shown assumes you can obtain approval. Because this market is restricted, your specialist will review which options are open to your specific property before any projection is relied on.'
      : status === 'RESTRICTED' || status === 'PRIMARY_RESIDENCE_REQUIRED'
        ? 'These rules can limit how often or how a home can be rented. Your specialist will confirm they fit your property and adjust the projection if they do not.'
        : null,
  };
}

export async function buildHomeownerReport(rawAddress: string): Promise<HomeownerReport> {
  const a = parseAddress(rawAddress);
  let db: ReturnType<typeof getSupabaseAdmin> | null = null;
  try { db = getSupabaseAdmin(); } catch { db = null; }

  const lead = db ? await findLead(db, a).catch(() => null) : null;
  const idx = db ? await rentIndex(db, a).catch(() => null) : null;

  // Real AirDNA figures for this address when we can get them; otherwise the calibrated bedroom model below.
  const air = db && lead ? await airdnaFiguresFor(db, { id: lead.id, address: lead.address, city: a.city, state: a.state, zip: a.zip, beds: lead.beds, baths: lead.baths, airdna_adr: lead.airdnaAdr, airdna_occupancy: lead.airdnaOccupancy, airdna_checked_at: lead.airdnaCheckedAt }).catch(() => null) : null;

  const assumedBeds = !lead?.beds;
  const beds = clamp(lead?.beds ?? 3, 1, 6);
  const baths = lead?.baths ?? Math.max(1, beds * 0.75);

  // Long-term rent: our per-property estimate first, then the sale-price model, then local rent x bedrooms.
  let longTermRent: number;
  let basis: HomeownerReport['basis'];
  if (lead?.priceType === 'rent' && lead.price && lead.price >= 400 && lead.price <= 25000) {
    longTermRent = lead.price; basis = 'PROPERTY';
  } else if (lead?.rent) {
    longTermRent = lead.rent; basis = 'PROPERTY';
  } else if (lead?.price && lead.priceType === 'sale' && idx) {
    longTermRent = Math.exp(1.159 + 0.31 * Math.log(lead.price) + 0.309 * Math.log(idx) + 0.041 * beds + 0.077 * baths);
    if (lead.price >= 1_500_000) longTermRent = Math.max(longTermRent, lead.price * 0.03 / 12);
    basis = 'PROPERTY';
  } else if (idx) {
    longTermRent = idx * (BED_RENT_MULT[beds] ?? 1.2); basis = 'MARKET';
  } else {
    longTermRent = 2300 * (BED_RENT_MULT[beds] ?? 1.2) * 0.9; basis = 'STATE';
  }
  longTermRent = round25(clamp(longTermRent, 600, 60000));

  // Short-term revenue. Checked against AirDNA's Rentalizer on 30 sampled addresses (Oct 2026), the bedroom model ran about 1.85x high:
  // its occupancy (68-74%) and nightly rates sat well above what AirDNA finds (about 52% booked). It is scaled down to match, and
  // AirDNA's own figures for the address replace it whenever we have them.
  const MODEL_OCC = 0.75; const MODEL_ADR = 0.74;
  const adrBase = air ? air.adr : Math.round((lead?.adr ?? (BASE_ADR[beds] ?? 225) * (STATE_MULT[a.state] ?? 1)) * MODEL_ADR);
  const occBase = air ? air.occupancy : Math.round((lead?.occupancy ?? Math.min(0.78, 0.62 + beds * 0.02) * 100) * MODEL_OCC);
  let expectedGross = adrBase * 30 * (occBase / 100);
  const floorGross = air ? 0 : longTermRent * 1.0;
  const adrExpected = expectedGross < floorGross ? Math.round(floorGross / (30 * occBase / 100)) : adrBase;
  expectedGross = Math.max(expectedGross, floorGross);

  const net = (g: number) => Math.round(g * 0.65);
  const make = (key: EstimateScenario['key'], label: string, occDelta: number, adrMult: number): EstimateScenario => {
    const occupancy = clamp(occBase + occDelta, air ? 25 : 35, 88);
    const adr = Math.round(adrExpected * adrMult);
    const gross = Math.round(adr * 30 * (occupancy / 100));
    return { key, label, occupancy, adr, grossMonthly: gross, netMonthly: net(gross), annualNet: net(gross) * 12 };
  };
  const scenarios = [
    make('conservative', 'Conservative', -9, 0.9),
    make('expected', 'Expected', 0, 1),
    make('optimistic', 'Optimistic', 7, 1.12),
  ];
  const expected = scenarios[1];

  const costs = COST_SHARES.map(c => ({ ...c, monthly: Math.round(expected.grossMonthly * c.pct / 100) }));
  const advantageMonthly = expected.netMonthly - longTermRent;
  const growth = 0.03;
  let sumStr = 0; let sumLtr = 0;
  const fiveYear = [1, 2, 3, 4, 5].map(year => {
    const f = Math.pow(1 + growth, year - 1);
    const n = Math.round(expected.annualNet * f); const l = Math.round(longTermRent * 12 * f);
    sumStr += n; sumLtr += l;
    return { year, net: n, longTerm: l };
  });

  const regulation = db ? await regulationFor(db, a).catch(() => null) : null;

  const place = [a.city, a.state].filter(Boolean).join(', ');
  return {
    address: rawAddress,
    street: a.street, city: a.city, state: a.state, zip: a.zip,
    basis,
    basisLabel: air ? (air.scope === 'area' ? 'Built from AirDNA data for similar homes nearby' : 'Built from AirDNA short-term rental data for homes like yours') : basis === 'PROPERTY'
      ? 'Built from your home\u2019s own details and local rent data'
      : basis === 'MARKET'
        ? `Built from ${a.zip ? `ZIP ${a.zip}` : 'local'} rent data and a typical ${beds}-bedroom home`
        : 'Built from regional averages. Your specialist will refine it with your home\u2019s details',
    property: { beds: lead?.beds ?? null, baths: lead?.baths ?? null, type: lead?.type ?? null, assumedBeds },
    longTermRent,
    scenarios,
    costs,
    advantageMonthly,
    advantageAnnual: advantageMonthly * 12,
    advantagePct: longTermRent > 0 ? Math.round((advantageMonthly / longTermRent) * 100) : 0,
    fiveYear,
    fiveYearTotal: sumStr,
    fiveYearLongTermTotal: sumLtr,
    regulation: regulation ?? {
      found: false, jurisdiction: place || 'your area', status: 'UNKNOWN', tone: 'unknown', headline: REG_HEADLINE.UNKNOWN,
      summary: 'Your TRAVLR specialist will confirm the permit and tax steps for your address.',
      requirements: [], taxes: null, additional: null, sourceName: null, sourceUrl: null, lastVerified: null,
      aiResearched: false, typicalChecklist: GENERIC_CHECKLIST, note: null, permit: null,
    },
    generatedAt: new Date().toISOString(),
  };
}

export { money };
