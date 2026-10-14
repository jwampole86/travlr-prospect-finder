import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cancelScheduled } from '@/lib/services/twilioSchedule';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface ListingStatus { /** Do not text: sold, pending, off market, or not confirmed live. */ blocked: boolean; status: string | null; reason: 'sold' | 'pending' | 'off_market' | 'unverified' | null }

const HOST = 'zillow-detail-scraper1.p.rapidapi.com';
const LIVE = new Set(['FOR_SALE', 'FOR_RENT', 'COMING_SOON']);
const FRESH_MS = 12 * 3_600_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const isZillow = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\/(www\.)?zillow\.com\/homedetails\//i.test(u);

const classify = (status: string | null): ListingStatus => {
  if (status && LIVE.has(status)) return { blocked: false, status, reason: null };
  if (!status) return { blocked: true, status, reason: 'unverified' };
  if (status === 'PENDING') return { blocked: true, status, reason: 'pending' };
  if (/SOLD/.test(status)) return { blocked: true, status, reason: 'sold' };
  return { blocked: true, status, reason: 'off_market' };
};

/** Zillow's current status for up to 20 listing pages in one request. Null when the request failed. */
async function fetchStatuses(urls: string[]): Promise<Map<string, string> | null> {
  const keys = [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const key of keys) {
      await sleep(1200);
      const res = await fetch(`https://${HOST}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, body: JSON.stringify({ homes: urls }), signal: AbortSignal.timeout(90_000) }).catch(() => null);
      if (!res || [401, 403, 429].includes(res.status)) continue;
      const data = await res.json().catch(() => null);
      if (data && !Array.isArray(data) && /rate limit/i.test(String((data as { message?: string }).message))) { await sleep(3000); continue; }
      if (!res.ok || !Array.isArray(data)) continue;
      const out = new Map<string, string>();
      (data as Array<{ input?: string; homeStatus?: string; error?: string }>).forEach((r, i) => { const u = r.input && urls.includes(r.input) ? r.input : urls[i]; if (u && r.homeStatus && !r.error) out.set(u, r.homeStatus); });
      return out;
    }
  }
  return null;
}

/**
 * Whether each Zillow-sourced lead is still a live listing, checked the day it is texted (results are reused for 12 hours).
 * A text that says "we saw your home on Zillow" must not go to a home that has sold, gone pending or come off the market.
 * Leads without a Zillow listing page are not checked, since the text does not refer to a listing.
 */
export async function checkListingStatuses(db: Db, leads: Array<{ id: string; listing_url?: string | null }>, maxAgeMs = FRESH_MS): Promise<Map<string, ListingStatus>> {
  const out = new Map<string, ListingStatus>();
  const ids = leads.filter(l => isZillow(l.listing_url)).map(l => l.id);
  if (!ids.length) return out;
  const { data: rows } = await db.from('leads').select('id,listing_url,listing_status,link_last_checked_at').in('id', ids);
  const need: Array<{ id: string; url: string }> = [];
  for (const r of rows ?? []) {
    const age = r.link_last_checked_at ? Date.now() - Date.parse(r.link_last_checked_at) : Infinity;
    if (age < maxAgeMs && r.listing_status) out.set(r.id, classify(String(r.listing_status))); else need.push({ id: r.id, url: String(r.listing_url) });
  }
  for (let i = 0; i < need.length; i += 20) {
    const group = need.slice(i, i + 20);
    const statuses = await fetchStatuses(group.map(g => g.url));
    const now = new Date().toISOString();
    for (const g of group) {
      const s = classify(statuses?.get(g.url) ?? null);
      out.set(g.id, s);
      if (s.status) await db.from('leads').update({ listing_status: s.status, link_status: s.blocked ? 'Unavailable' : 'Active', link_last_checked_at: now }).eq('id', g.id);
    }
  }
  return out;
}

/**
 * Rechecks the listing behind every text due to go out in the next hour and cancels those whose home has since sold, gone pending
 * or come off the market. A status that could not be confirmed leaves the text alone, since it was verified when scheduled.
 */
export async function cancelQueuedForDeadListings(db: Db, withinMinutes = 65): Promise<{ queued: number; checked: number; canceled: number; failed: number }> {
  const now = Date.now(); const until = now + withinMinutes * 60_000;
  const { data: rows } = await db.from('outreach_history').select('id,lead_id,metadata').eq('channel', 'sms').eq('metadata->>twilio_status', 'scheduled').eq('metadata->>kind', 'estimate_outreach').gt('sent_at', new Date(now + 3 * 60_000).toISOString()).lte('sent_at', new Date(until).toISOString()).limit(1000);
  const due = (rows ?? []).filter(r => r.lead_id && (r.metadata as { message_sid?: string })?.message_sid);
  const ids = [...new Set(due.map(r => String(r.lead_id)))];
  const { data: leads } = ids.length ? await db.from('leads').select('id,listing_url').in('id', ids) : { data: [] };
  const status = await checkListingStatuses(db, leads ?? [], 0);
  let canceled = 0; let failed = 0;
  for (const r of due) {
    const s = status.get(String(r.lead_id));
    if (!s?.blocked || s.reason === 'unverified') continue;
    const m = r.metadata as Record<string, unknown>;
    const c = await cancelScheduled(String(m.message_sid));
    if (!c.ok) { failed++; continue; }
    canceled++;
    await db.from('outreach_history').update({ metadata: { ...m, twilio_status: 'canceled', twilio_status_at: new Date().toISOString(), canceled_reason: `Zillow shows the listing as ${s.status}` } }).eq('id', r.id);
  }
  return { queued: due.length, checked: status.size, canceled, failed };
}
