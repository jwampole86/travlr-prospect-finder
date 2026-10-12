/**
 * Fills beds / baths / sqft / price / listing link for campaign leads from the RapidAPI "Zillow Detail Scraper".
 * Only exact-address matches are written; unit-level or mismatched records are skipped and reported.
 *
 *   npx tsx scripts/zillow-enrich-leads.ts --batch=2026-10-12-verified            (dry run, writes /tmp/zillow-results.json)
 *   npx tsx scripts/zillow-enrich-leads.ts --batch=2026-10-12-verified --go       (updates leads)
 */
import fs from 'fs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parse } from './lib/verifiedAddress';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const batch = arg('batch') || '2026-10-12-verified';
const HOST = 'zillow-detail-scraper1.p.rapidapi.com';
const KEYS = [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));

interface Raw {
  input?: string; zpid?: string | number; url?: string; street?: string; city?: string; state?: string; zip?: string;
  homeStatus?: string; homeType?: string; bedrooms?: number; bathrooms?: number; livingArea?: number; yearBuilt?: number;
  price?: number; zestimate?: number; rentZestimate?: number; lastSoldPrice?: number; error?: string;
}
interface Lead { id: string; address: string; city: string; state: string; zip: string | null; verified_address: string | null }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const STREET_SFX: Record<string, string> = { drive: 'dr', street: 'st', avenue: 'ave', road: 'rd', lane: 'ln', court: 'ct', circle: 'cir', place: 'pl', boulevard: 'blvd', terrace: 'ter', trail: 'trl', way: 'way', parkway: 'pkwy', highway: 'hwy' };
const normStreet = (s: string) => s.toLowerCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean).map(w => STREET_SFX[w] ?? w).join(' ');
const hasUnit = (s: string) => /\b(unit|apt|apartment|suite|ste|#)\b|#\s*\w+/i.test(s);

async function callBatch(homes: string[]): Promise<{ rows: Raw[]; remaining: string | null }> {
  let lastErr = '';
  for (const key of KEYS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://${HOST}/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
        body: JSON.stringify({ homes }), signal: AbortSignal.timeout(120_000),
      });
      const remaining = res.headers.get('x-ratelimit-requests-remaining') ?? res.headers.get('x-ratelimit-remaining');
      if (res.status === 401 || res.status === 403 || res.status === 429) { lastErr = `HTTP ${res.status}`; break; }
      const data = await res.json().catch(() => null);
      if (data && !Array.isArray(data) && /rate limit/i.test(String((data as { message?: string }).message))) { await sleep(2000); lastErr = 'rate limit'; continue; }
      if (!res.ok || !Array.isArray(data)) { lastErr = `HTTP ${res.status}`; await sleep(2000); continue; }
      return { rows: data as Raw[], remaining };
    }
  }
  throw new Error(`Zillow lookup failed: ${lastErr}`);
}

/** Why a returned record cannot be trusted for this lead, or null when it is the same home. */
// Some lead rows still hold "street city, ST zip" in the address field; verified_address is the reliable source for those.
const messy = (l: Lead) => l.address.includes(',');

function mismatch(lead: Lead, r: Raw): string | null {
  if (r.error || !r.street) return 'not_found';
  const want = messy(lead) ? normStreet(lead.verified_address ?? lead.address) : normStreet(lead.address);
  const got = normStreet(r.street);
  if (messy(lead)) {
    const base = got.replace(/\b(unit|apt)\b.*$/, '').trim();
    if (hasUnit(r.street)) return 'unit_level_record';
    if (!want.startsWith(base + ' ') || base.split(' ').length < 3) return want.split(' ')[0] !== got.split(' ')[0] ? 'house_number_differs' : 'street_differs';
    if (lead.verified_address && r.state && !new RegExp(`\\b${r.state}\\b`, 'i').test(lead.verified_address)) return 'state_differs';
    return null;
  }
  if (hasUnit(r.street) && !hasUnit(lead.address)) return 'unit_level_record';
  if (want.split(' ')[0] !== got.split(' ')[0]) return 'house_number_differs';
  if (got.replace(/\b(unit|apt)\b.*$/, '').trim() !== want) return 'street_differs';
  if (lead.state && r.state && lead.state.toUpperCase() !== r.state.toUpperCase()) return 'state_differs';
  if (lead.zip && r.zip && String(lead.zip).slice(0, 5) !== String(r.zip).slice(0, 5)) return 'zip_differs';
  if (r.bedrooms != null && (r.bedrooms < 0 || r.bedrooms > 12)) return 'implausible_beds';
  return null;
}

/** Rental listings carry monthly rent in `price`; sale-side records carry a list price or Zillow's value estimate. */
function priceFacts(r: Raw): { price: number; type: 'rent' | 'sale'; kind: string } | null {
  if (r.homeStatus === 'FOR_RENT' && r.price && r.price >= 400 && r.price <= 60000) return { price: Math.round(r.price), type: 'rent', kind: 'asking_rent' };
  if (r.homeStatus === 'FOR_SALE' && r.price && r.price > 50_000) return { price: Math.round(r.price), type: 'sale', kind: 'list_price' };
  const v = r.zestimate ?? (r.homeStatus === 'FOR_RENT' ? null : r.price);
  return v && v > 50_000 ? { price: Math.round(v), type: 'sale', kind: 'zestimate' } : null;
}

(async () => {
  if (!KEYS.length) throw new Error('No RAPIDAPI_KEY_* configured');
  const db = getSupabaseAdmin();
  const { data: hist, error: he } = await db.from('outreach_history').select('lead_id').eq('metadata->>batch', batch).eq('metadata->>kind', 'estimate_outreach');
  if (he) throw he;
  const ids = [...new Set((hist ?? []).map(h => h.lead_id as string))];
  const { data, error } = await db.from('leads').select('id,address,city,state,zip,verified_address').in('id', ids);
  if (error) throw error;
  const leads = (data ?? []) as Lead[];
  console.log(`leads in batch: ${leads.length}`);

  const results: Array<{ leadId: string; query: string; reason: string | null; facts?: Raw; price?: ReturnType<typeof priceFacts> }> = [];
  let remaining: string | null = null;
  for (let i = 0; i < leads.length; i += 20) {
    const chunk = leads.slice(i, i + 20);
    const queries = chunk.map(l => messy(l) && l.verified_address ? l.verified_address : [l.address, l.city, `${l.state} ${l.zip ?? ''}`.trim()].filter(Boolean).join(', '));
    const { rows, remaining: rem } = await callBatch(queries);
    remaining = rem ?? remaining;
    chunk.forEach((lead, j) => {
      const row = rows.find(r => r.input === queries[j]) ?? rows[j];
      const reason = row ? mismatch(lead, row) : 'no_row';
      results.push({ leadId: lead.id, query: queries[j], reason, facts: reason ? undefined : row, price: reason || !row ? undefined : priceFacts(row) });
    });
    process.stdout.write(`.${Math.min(i + 20, leads.length)}`);
    await sleep(1200);
  }
  console.log(`\nrate-limit remaining header: ${remaining ?? 'n/a'}`);
  fs.writeFileSync('/tmp/zillow-results.json', JSON.stringify(results));

  const ok = results.filter(r => !r.reason);
  const reasons: Record<string, number> = {};
  results.filter(r => r.reason).forEach(r => { reasons[r.reason!] = (reasons[r.reason!] ?? 0) + 1; });
  const count = (f: (r: typeof ok[number]) => string) => ok.reduce<Record<string, number>>((a, r) => { const k = f(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});
  console.log(`confirmed exact matches: ${ok.length}/${results.length} | skipped:`, reasons);
  console.log('status:', count(r => r.facts?.homeStatus ?? '?'), '| price kind:', count(r => r.price?.kind ?? 'none'));
  console.log('beds:', count(r => String(r.facts?.bedrooms ?? 'none')));

  if (!GO) { console.log('\nDRY RUN: nothing written. Re-run with --go.'); return; }
  const now = new Date().toISOString();
  const { data: before } = await db.from('leads').select('id,beds,baths,price,price_type,square_feet,year_built,property_type,listing_url,listing_source_url,source_listing_id,beds_source,baths_source,beds_retrieved_at,price_verified_at').in('id', ok.map(o => o.leadId));
  fs.writeFileSync(`/tmp/zillow-backup-${Date.now()}.json`, JSON.stringify(before));
  let written = 0; let twinsFilled = 0; const failed: string[] = [];
  for (const r of ok) {
    const f = r.facts!;
    const update: Record<string, unknown> = {};
    if (f.bedrooms) { update.beds = Math.round(f.bedrooms); update.beds_source = 'zillow'; update.beds_retrieved_at = now; }
    if (f.bathrooms) { update.baths = f.bathrooms; update.baths_source = 'zillow'; }
    if (f.livingArea) update.square_feet = Math.round(f.livingArea);
    if (f.yearBuilt) update.year_built = f.yearBuilt;
    if (f.homeType) update.property_type = f.homeType;
    if (r.price) { update.price = r.price.price; update.price_type = r.price.type; update.price_verified_at = now; }
    if (f.url) { update.listing_url = f.url; update.listing_source_url = f.url; }
    if (f.zpid) update.source_listing_id = String(f.zpid);
    if (!Object.keys(update).length) continue;
    const { error: ue } = await db.from('leads').update(update).eq('id', r.leadId);
    if (ue) failed.push(`${r.leadId} ${ue.message}`); else written++;

    // A lead whose address row could not be corrected (another lead owns that address) gets its estimate from that twin, so fill the twin too.
    const lead = leads.find(l => l.id === r.leadId);
    const fix = lead && messy(lead) && lead.verified_address ? parse(lead.verified_address) : null;
    if (fix) {
      const { data: twins } = await db.from('leads').select('id,beds').eq('address', fix.street).ilike('city', fix.city).eq('state', fix.state).neq('id', r.leadId);
      for (const twin of twins ?? []) if (!twin.beds) { await db.from('leads').update(update).eq('id', twin.id); twinsFilled++; }
    }
  }
  console.log(`updated ${written} leads (+${twinsFilled} duplicate-address records) | failed ${failed.length}`, failed.slice(0, 5));
})().catch(e => { console.error(e); process.exit(1); });
