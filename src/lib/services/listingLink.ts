import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { airdnaAddress } from '@/lib/services/airdnaEstimate';
import { normStreet } from '@/lib/normStreet';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface LinkLead { id: string; address: string; city?: string | null; state?: string | null; zip?: string | null }
export interface FilledFacts { beds?: number; baths?: number; price?: number; priceType?: 'rent' | 'sale' }
export type LinkResult =
  | { status: 'found'; url: string; facts: FilledFacts }
  | { status: 'filled'; facts: FilledFacts }
  | { status: 'related'; url: string; address: string }
  | { status: 'not_found'; reason: string }
  | { status: 'error'; reason: string };

interface Raw { parcelId?: string; county?: string; taxAssessedValue?: number; url?: string; zpid?: string | number; street?: string; state?: string; zip?: string; homeStatus?: string; homeType?: string; bedrooms?: number; bathrooms?: number; livingArea?: number; yearBuilt?: number; price?: number; zestimate?: number; rentZestimate?: number; agentName?: string; agentPhone?: string; mlsId?: string; error?: string }

const HOST = 'zillow-detail-scraper1.p.rapidapi.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const hasUnit = (s: string) => /\b(unit|apt|apartment|suite|ste)\b|#\s*\w+/i.test(s);

/** Zillow's detail record for an address or Zillow URL. Null when the request itself failed. */
async function zillowRow(home: string): Promise<Raw | null | undefined> {
  const keys = [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const key of keys) {
      await sleep(1200);
      const res = await fetch(`https://${HOST}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, body: JSON.stringify({ homes: [home] }), signal: AbortSignal.timeout(60_000) }).catch(() => null);
      if (!res || [401, 403, 429].includes(res.status)) continue;
      const data = await res.json().catch(() => null);
      if (data && !Array.isArray(data) && /rate limit/i.test(String((data as { message?: string }).message))) { await sleep(3000); continue; }
      if (!res.ok || !Array.isArray(data)) continue;
      const row = (data as Raw[])[0];
      return row && !row.error && row.street ? row : undefined;
    }
  }
  return null;
}

/** Why a returned record is not this lead's home, or null when it is. Exact street match only: a wrong link is worse than none. */
function mismatch(lead: LinkLead, got: Raw): string | null {
  const messy = lead.address.includes(',');
  const want = normStreet(lead.address);
  const have = normStreet(String(got.street).replace(/\b(unit|apt|apartment|suite|ste)\b.*$/i, '').replace(/#.*$/, ''));
  if (!have) return 'no_street';
  if (hasUnit(String(got.street)) && !hasUnit(lead.address)) return 'unit_level_record';
  if (want.split(' ')[0] !== have.split(' ')[0]) return 'house_number_differs';
  if (want !== have && !(messy && want.startsWith(have + ' ') && have.split(' ').length >= 3)) return 'street_differs';
  const wantState = messy ? lead.address.match(/,\s*([A-Za-z]{2})\b/)?.[1] : lead.state;
  if (wantState && got.state && wantState.toUpperCase() !== got.state.toUpperCase()) return 'state_differs';
  if (!messy && lead.zip && got.zip && String(lead.zip).slice(0, 5) !== String(got.zip).slice(0, 5)) return 'zip_differs';
  return null;
}

/** True when a Zillow URL's slug is this lead's street, city and state (a building page has a hash on the end of the slug). */
export function slugMatches(url: string, lead: LinkLead): boolean {
  const m = url.match(/^https?:\/\/(?:www\.)?zillow\.com\/(?:homedetails|b)\/([^/]+)\//i);
  if (!m || !lead.city || !lead.state || lead.address.includes(',')) return false;
  let tokens = m[1].toLowerCase().split('-');
  if (/\/b\//i.test(url)) tokens = tokens.slice(0, -1);
  const city = lead.city.toLowerCase().split(/\s+/);
  const at = tokens.findIndex((_, i) => city.every((c, j) => tokens[i + j] === c) && tokens[i + city.length] === lead.state!.toLowerCase());
  if (at < 1) return false;
  const street = tokens.slice(0, at).join(' ').replace(/\b(unit|apt|apartment|suite|ste)\b.*$/, '').trim();
  return normStreet(street) === normStreet(lead.address);
}

/** The research step: web search for the address with the owner's name, as a person would, keeping only URLs whose slug is this home. */
async function searchZillowUrl(lead: LinkLead, ownerName: string | null | undefined, allowUnit: boolean): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const who = (ownerName ?? '').replace(/&.*$/, '').trim();
  const full = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 700, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, allowed_domains: ['zillow.com'] }], messages: [{ role: 'user', content: `Search for: ${full} ${who} zillow. List every zillow.com URL in the results that is the page for this exact address (a homedetails or /b/ building page).` }] }),
  }).catch(() => null);
  const j = (await res?.json().catch(() => null)) as { content?: Array<{ type: string; content?: Array<{ url?: string }> | unknown; text?: string }> } | null;
  const found = (j?.content ?? []).flatMap(c => (c.type === 'web_search_tool_result' && Array.isArray(c.content) ? (c.content as Array<{ url?: string }>).map(r => r.url ?? '') : []))
    .concat((j?.content ?? []).flatMap(c => (c.type === 'text' ? (c.text?.match(/https?:\/\/www\.zillow\.com\/(?:homedetails|b)\/[^\s)*"'\]]+/g) ?? []) : [])));
  const ok = [...new Set(found.map(u => u.replace(/[.,;]+$/, '')))].filter(u => slugMatches(u, lead) && (allowUnit || !/-(unit|apt|apartment|suite|ste)-/i.test(u)));
  return ok.find(u => /\/homedetails\//.test(u) && !/unit|apt/i.test(u)) ?? ok[0] ?? null;
}

/** A listed rent or sale price, else Zillow's own value estimate. */
function priceOf(r: Raw): { price: number; type: 'rent' | 'sale' } | null {
  if (r.homeStatus === 'FOR_RENT' && r.price && r.price >= 400 && r.price <= 60000) return { price: Math.round(r.price), type: 'rent' };
  if (r.homeStatus === 'FOR_SALE' && r.price && r.price > 50_000) return { price: Math.round(r.price), type: 'sale' };
  if (r.homeStatus === 'FOR_RENT' && r.rentZestimate && r.rentZestimate >= 400) return { price: Math.round(r.rentZestimate), type: 'rent' };
  const v = r.zestimate ?? (r.homeStatus === 'FOR_RENT' ? null : r.price);
  return v && v > 50_000 ? { price: Math.round(v), type: 'sale' } : null;
}

/** Writes only the facts the lead is missing. */
async function applyRecord(db: Db, leadId: string, row: Raw, extra: Record<string, unknown>): Promise<FilledFacts> {
  const { data: cur } = await db.from('leads').select('beds,baths,price,price_type,square_feet,year_built,property_type,source_listing_id,listing_agent_name,listing_agent_phone,mls_number,apn,county,tax_assessment').eq('id', leadId).maybeSingle();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { listing_link_lookup_at: now, ...extra };
  const facts: FilledFacts = {};
  if (!Number(cur?.beds) && row.bedrooms && row.bedrooms > 0 && row.bedrooms <= 12) { update.beds = facts.beds = Math.round(row.bedrooms); update.beds_source = 'zillow'; update.beds_retrieved_at = now; }
  if (!Number(cur?.baths) && row.bathrooms && row.bathrooms > 0) { update.baths = facts.baths = row.bathrooms; update.baths_source = 'zillow'; }
  const p = priceOf(row);
  if (!Number(cur?.price) && p) { update.price = facts.price = p.price; update.price_type = facts.priceType = p.type; update.price_verified_at = now; }
  if (!Number(cur?.square_feet) && row.livingArea) update.square_feet = Math.round(row.livingArea);
  if (!Number(cur?.year_built) && row.yearBuilt) update.year_built = row.yearBuilt;
  if (!cur?.property_type && row.homeType) update.property_type = row.homeType;
  if (!cur?.source_listing_id && row.zpid) update.source_listing_id = String(row.zpid);
  if (!cur?.listing_agent_name && row.agentName) update.listing_agent_name = row.agentName;
  if (!cur?.listing_agent_phone && row.agentPhone) update.listing_agent_phone = row.agentPhone;
  if (!cur?.mls_number && row.mlsId) update.mls_number = row.mlsId;
  if (!cur?.apn && row.parcelId) update.apn = String(row.parcelId);
  if (!cur?.county && row.county) update.county = row.county;
  if (!Number(cur?.tax_assessment) && row.taxAssessedValue) update.tax_assessment = Math.round(row.taxAssessedValue);
  await db.from('leads').update(update).eq('id', leadId);
  return facts;
}

/**
 * Finds a lead's Zillow record by address and fills the facts it lacks (beds, baths, price). With a stored listing link
 * the record is read from that link first. A record for one unit of a building is used only when the lead's owner is verified.
 */
export async function findListingLink(db: Db, lead: LinkLead, storedUrl?: string | null): Promise<LinkResult> {
  const { data: o } = await db.from('leads').select('verified_owner,ownership_record_verified,listing_evidence').eq('id', lead.id).maybeSingle();
  const ownerVerified = !!(o?.verified_owner || o?.ownership_record_verified);
  const stamp = (extra: Record<string, unknown> = {}) => db.from('leads').update({ listing_link_lookup_at: new Date().toISOString(), ...extra }).eq('id', lead.id);

  if (storedUrl) {
    const byUrl = await zillowRow(storedUrl);
    if (byUrl) return { status: 'filled', facts: await applyRecord(db, lead.id, byUrl, {}) };
  }
  const row = await zillowRow(airdnaAddress({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip }));
  if (row === null) return { status: 'error', reason: 'Zillow lookup failed' };
  const why = !row || !row.url ? 'not_found' : mismatch(lead, row);

  if (row?.url && (!why || (why === 'unit_level_record' && ownerVerified))) {
    const facts = await applyRecord(db, lead.id, row, storedUrl ? {} : { listing_url: row.url, listing_source_url: row.url });
    return storedUrl ? { status: 'filled', facts } : { status: 'found', url: row.url, facts };
  }
  if (!storedUrl) {
    const { data: who } = await db.from('leads').select('owner_name,contact_name').eq('id', lead.id).maybeSingle();
    const hit = await searchZillowUrl(lead, who?.owner_name || who?.contact_name, ownerVerified);
    if (hit) {
      const rec = await zillowRow(hit);
      const facts = await applyRecord(db, lead.id, rec ?? {}, { listing_url: hit, listing_source_url: hit });
      return { status: 'found', url: hit, facts };
    }
  }
  if (why === 'unit_level_record' && row?.url) {
    // One unit of a multi-unit building, owner not verified: kept as a labeled reference, never as the direct link.
    await stamp({ listing_evidence: { ...((o?.listing_evidence as Record<string, unknown>) ?? {}), related_zillow: { url: row.url, address: row.street, beds: row.bedrooms ?? null, found_at: new Date().toISOString() } } });
    return { status: 'related', url: row.url, address: String(row.street) };
  }
  await stamp();
  return { status: 'not_found', reason: why ?? 'not_found' };
}
