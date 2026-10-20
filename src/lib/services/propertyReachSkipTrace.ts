import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Second phone source for owner-listed rentals: PropertyReach looks an address up and returns the people tied to it. Each call that finds
 * the property costs 1 credit; "property not found" costs nothing. Phones sit inside each person ({ type: 'Owner 1' | 'Contact', phones, emails }).
 * Only the owner of record is used. The "Contact" people are relatives and associates, so their numbers are never put on the lead.
 */

const BASE = 'https://api.propertyreach.com/v1';
const last10 = (p?: string | null) => String(p ?? '').replace(/\D/g, '').slice(-10);
const e164 = (p?: string | null) => { const d = last10(p); return d.length === 10 ? `+1${d}` : null; };

interface PRPhone { number?: string; phone?: string; phoneNumber?: string; type?: string; [k: string]: unknown }
interface PRPerson { type?: string; firstName?: string; middleName?: string; lastName?: string; deceased?: boolean; phones?: PRPhone[]; emails?: Array<{ email?: string; address?: string } | string> }

export interface PropertyReachRun { tried: number; found: number; ownerNoPhone: number; notFound: number; credits: number; errors: number; stoppedEarly?: string }

async function traceAddress(street: string, city: string, state: string, zip: string, key: string) {
  const res = await fetch(`${BASE}/skip-trace`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ target: { streetAddress: street, city, state, zip } }), signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({})) as { meta?: { status?: number; credits?: number; message?: string }; persons?: PRPerson[] };
  return { httpStatus: res.status, meta: json.meta ?? {}, persons: json.persons ?? [] };
}

/** Phones of the owner, mobile first. The provider's own type label is used; numbers are de-duplicated. */
function ownerPhones(p: PRPerson): Array<{ e164: string; type: string }> {
  const seen = new Set<string>(); const out: Array<{ e164: string; type: string }> = [];
  for (const ph of p.phones ?? []) {
    const n = e164(ph.number ?? ph.phone ?? ph.phoneNumber); if (!n || seen.has(n)) continue;
    seen.add(n); out.push({ e164: n, type: String(ph.type ?? 'unknown').toLowerCase() });
  }
  const rank = (t: string) => (/mobile|cell|wireless/.test(t) ? 0 : /voip/.test(t) ? 1 : /land/.test(t) ? 3 : 2);
  return out.sort((a, b) => rank(a.type) - rank(b.type));
}

/** Traces PENDING owner-listed rentals (best prospects first) and writes the owner's name and phone onto the lead. */
export async function runPropertyReachTrace(db: SupabaseClient, opts: { limit: number; creditCap?: number }): Promise<PropertyReachRun> {
  const key = process.env.PROPERTYREACH_API_KEY;
  const run: PropertyReachRun = { tried: 0, found: 0, ownerNoPhone: 0, notFound: 0, credits: 0, errors: 0 };
  if (!key) return { ...run, stoppedEarly: 'no PROPERTYREACH_API_KEY' };
  const cap = opts.creditCap ?? opts.limit;

  const { data: leads } = await db.from('leads').select('id,address,city,state,zip,contact_name,contact_phone,secondary_phones')
    .eq('skip_trace_status', 'PENDING').eq('price_type', 'rent').is('listing_agent_name', null).is('listing_broker_name', null)
    .or('is_apartment_community.is.null,is_apartment_community.eq.false').is('contact_name', null)
    .not('zip', 'is', null).not('address', 'ilike', 'Address Not Disclosed%').not('address', 'like', '%#%')
    .is('skip_trace_result->>propertyreach', null)
    .order('prospect_score', { ascending: false, nullsFirst: false }).order('price', { ascending: false, nullsFirst: false }).limit(opts.limit);

  for (const lead of leads ?? []) {
    if (run.credits >= cap) { run.stoppedEarly = 'credit cap reached'; break; }
    run.tried++;
    const street = String(lead.address).split(',')[0];
    let r;
    try { r = await traceAddress(street, lead.city, lead.state, lead.zip, key); } catch { run.errors++; continue; }
    if (r.httpStatus === 401 || r.httpStatus === 403 || r.meta.status === 401 || r.meta.status === 403 || r.meta.status === 402 || r.httpStatus === 429) { run.stoppedEarly = `PropertyReach ${r.meta.status ?? r.httpStatus}: ${r.meta.message ?? ''}`; break; }
    run.credits += Number(r.meta.credits) || 0;
    const now = new Date().toISOString();

    if (r.meta.status === 404 || r.persons.length === 0) {
      run.notFound++;
      await db.from('leads').update({ skip_trace_result: { propertyreach: 'not_found', at: now } }).eq('id', lead.id);
      continue;
    }
    const owners = r.persons.filter(p => /^owner/i.test(p.type ?? '') && !p.deceased && p.firstName && p.lastName);
    const owner = owners.find(p => ownerPhones(p).length > 0) ?? owners[0];
    if (!owner) { run.notFound++; await db.from('leads').update({ skip_trace_result: { propertyreach: 'no_owner', at: now } }).eq('id', lead.id); continue; }

    const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase());
    const phones = ownerPhones(owner);
    const result = { provider: 'PROPERTYREACH', propertyreach: 'owner', owner: { name, type: owner.type, phones: phones.map(p => `${p.e164} (${p.type})`) }, at: now };
    if (phones.length === 0) {
      run.ownerNoPhone++;
      await db.from('leads').update({ skip_trace_status: 'POSSIBLE_MATCH', skip_traced_at: now, skip_trace_result: { ...result, note: 'owner of record found, no phone' } }).eq('id', lead.id);
      continue;
    }
    const [primary, ...rest] = phones;
    const known = new Set([lead.contact_phone, ...(lead.secondary_phones ?? [])].map(last10));
    const update: Record<string, unknown> = { skip_trace_status: 'FOUND', skip_traced_at: now, skip_trace_result: result, contact_name: name, owner_name: name, owner_source: 'PROPERTYREACH' };
    if (!lead.contact_phone) { update.contact_phone = primary.e164; update.has_phone = true; update.phone_source = 'PROPERTYREACH'; }
    const extra = rest.map(p => p.e164).filter(p => !known.has(last10(p)));
    if (extra.length) update.secondary_phones = [...(lead.secondary_phones ?? []), ...extra].slice(0, 5);
    await db.from('leads').update(update).eq('id', lead.id);
    await db.from('lead_activity_log').insert({ lead_id: lead.id, activity_type: 'ENRICHMENT', activity_data: { description: `PropertyReach found ${name} (owner of record) with ${phones.length} phone number${phones.length === 1 ? '' : 's'}.`, provider: 'PROPERTYREACH' }, performed_by_name: 'Skip trace (PropertyReach)', created_at: now });
    run.found++;
  }
  return run;
}
