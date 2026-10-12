/**
 * Exports the Colorado co-listing shortlist to a CSV for hand review before any outreach.
 * One row per candidate listing: the evidence for underperformance, the photo review, how confident the owner match is, and what to do next.
 *
 *   npx tsx scripts/str-export-shortlist.ts [--out=~/Downloads/colorado-colisting-shortlist.csv]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const outArg = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const out = outArg ?? path.join(os.homedir(), 'Downloads', 'colorado-colisting-shortlist.csv');
const esc = (v: unknown) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };

(async () => {
  const db = getSupabaseAdmin();
  const rows: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('str_listings').select('*').in('segment', ['candidate']).range(from, from + 999);
    if (error) throw error; rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
  }
  const addrCount = new Map<string, number>(); for (const r of rows) if (r.match_status === 'unique') addrCount.set(r.matched_address, (addrCount.get(r.matched_address) ?? 0) + 1);

  const action = (r: Record<string, any>) => {
    if (r.match_status === 'unique' && (addrCount.get(r.matched_address) ?? 0) > 1) return 'HOLD: two listings matched the same home, so at least one is wrong. Check by hand.';
    if (r.match_status === 'unique' && r.matched_owner?.skipTrace?.results?.some((x: any) => x.found)) return 'REVIEW MATCH, then contact: owner and phone confirmed against mailing address.';
    if (r.match_status === 'unique' && r.matched_owner?.type === 'Organization') return 'Owner is a company: look up the registered agent or manager.';
    if (r.match_status === 'unique') return 'REVIEW MATCH: probable address, owner contact not yet found.';
    if (r.match_status === 'ambiguous') return 'Pick the right home from the 2-3 possibilities, then trace.';
    if (r.match_status === 'no_registry_nearby') return 'No license list for this area available to us yet.';
    if (r.match_status) return 'No licensed home nearby fits the bedrooms and bathrooms.';
    return 'Not checked (outside Breckenridge, Aspen and Snowmass).';
  };
  const rank = (r: Record<string, any>) => (r.match_status === 'unique' ? 0 : r.match_status === 'ambiguous' ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || (b.photo_score != null ? 1 : 0) - (a.photo_score != null ? 1 : 0) || b.under_score - a.under_score);

  const cols = ['market', 'title', 'listing_url', 'bedrooms', 'bathrooms', 'nightly_rate', 'occupancy_pct', 'revenue_ltm', 'revenue_potential', 'rating', 'reviews', 'host_listings', 'luxury', 'underperformance_score', 'why_flagged',
    'photo_score', 'hero_photo', 'photos_look_dated', 'missing_shots', 'photo_fixes', 'match_status', 'location_confidence', 'matched_address', 'permit', 'owner_of_record', 'owner_type', 'owner_mailing_address', 'owner_found_phones', 'owner_found_emails', 'next_step'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    const n = r.photo_notes ?? {}; const o = r.matched_owner ?? {}; const st = (o.skipTrace?.results ?? []).filter((x: any) => x.found).map((x: any) => x.found);
    lines.push([r.market, r.title, r.airbnb_url ?? r.vrbo_url ?? r.booking_url, r.bedrooms, r.bathrooms, r.adr ? Math.round(r.adr) : '', r.occupancy_pct ? Math.round(r.occupancy_pct) : '', r.revenue_ltm ? Math.round(r.revenue_ltm) : '', r.revenue_potential_ltm ? Math.round(r.revenue_potential_ltm) : '',
      r.rating, r.reviews, r.host_listing_count, r.is_luxury ? 'yes' : '', r.under_score, (r.under_reasons ?? []).join('; '),
      r.photo_score, n.hero, n.looksDated ? 'yes' : (r.photo_score != null ? 'no' : ''), (n.missingShots ?? []).join('; '), (n.fixes ?? []).join(' | '),
      r.match_status ?? '', r.address_match_confidence, r.matched_address, o.permit, (o.names ?? []).join(' & '), o.type, o.mailing,
      st.flatMap((p: any) => p.phones.map((x: any) => `${p.name}: ${x.e164} (${x.type})`)).join('; '), st.flatMap((p: any) => p.emails.map((e: string) => `${p.name}: ${e}`)).join('; '), action(r)].map(esc).join(','));
  }
  fs.writeFileSync(out, lines.join('\n') + '\n');
  const photo = rows.filter(r => r.photo_score != null);
  console.log(`wrote ${rows.length} rows to ${out} | with photo review: ${photo.length} | matched: ${rows.filter(r => r.match_status === 'unique').length} unique, ${rows.filter(r => r.match_status === 'ambiguous').length} ambiguous`);
})().catch(e => { console.error(e); process.exit(1); });
