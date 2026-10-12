import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchListingsPage, toListingRow, airdnaKeys } from '@/lib/services/strPull';
import { scoreListings } from '@/lib/services/strScoring';
import { matchOwners } from '@/lib/services/strMatch';
import { enrichAssessorOwners } from '@/lib/services/strAssessor';
import { lookupEntityOwners } from '@/lib/services/strEntity';

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
export const EXCLUDED_STATES = ['CA'];
export const stateOf = (market: string) => market.split(',').pop()!.trim().toUpperCase();

export interface RefreshResult { runId: number | null; status: string; markets: string[]; apiCalls: number; newListings: number; updatedListings: number; newMatches: number; skipTraced: number; quotaRemaining: number | null; note?: string }

/**
 * Re-pulls the markets that have gone longest without a refresh (every state except California), stores new and changed listings,
 * rescores those markets, matches new candidates to public STR registries and skip-traces new unique matches.
 *
 * AirDNA calls are the scarce resource, so a run stops at a per-run call cap or when the monthly allowance drops below a reserve
 * that is kept for the rest of the app. A market too big for one run is refreshed in rotating windows of listings.
 */
export async function runCohostRefresh(db: SupabaseClient, opts: { trigger: 'cron' | 'manual'; maxCalls?: number; deadlineMs?: number }): Promise<RefreshResult> {
  const startedAt = Date.now();
  const maxCalls = opts.maxCalls ?? num(process.env.COHOST_REFRESH_CALLS_PER_RUN, 25);
  const minRemaining = num(process.env.COHOST_REFRESH_MIN_REMAINING, 800);
  const pagesPerMarket = num(process.env.COHOST_REFRESH_PAGES_PER_MARKET, 2);
  const deadline = startedAt + (opts.deadlineMs ?? 230_000);
  const empty = (status: string, note?: string): RefreshResult => ({ runId: null, status, markets: [], apiCalls: 0, newListings: 0, updatedListings: 0, newMatches: 0, skipTraced: 0, quotaRemaining: null, note });
  if (!airdnaKeys().length) return empty('skipped', 'No AirDNA key configured');

  // A run that started recently and has not finished is still going, so a second one would only double the API spend.
  const { data: active } = await db.from('str_refresh_runs').select('id').eq('status', 'running').gte('started_at', new Date(startedAt - 15 * 60_000).toISOString()).limit(1);
  if (active?.length) return empty('skipped', 'Another refresh is still running');

  const { data: run, error: runErr } = await db.from('str_refresh_runs').insert({ trigger: opts.trigger }).select('id').single();
  if (runErr || !run) throw new Error(runErr?.message ?? 'Could not start the refresh run');
  const runId = run.id as number;
  const result: RefreshResult = { runId, status: 'ok', markets: [], apiCalls: 0, newListings: 0, updatedListings: 0, newMatches: 0, skipTraced: 0, quotaRemaining: null };
  const finish = async (status: string, note?: string) => {
    result.status = status; if (note) result.note = note;
    await db.from('str_refresh_runs').update({ finished_at: new Date().toISOString(), status, note: note ?? null, markets: result.markets, api_calls: result.apiCalls, new_listings: result.newListings, updated_listings: result.updatedListings, new_matches: result.newMatches, quota_remaining: result.quotaRemaining }).eq('id', runId);
    return result;
  };

  try {
    const { data: due, error } = await db.from('str_market_refresh').select('market,state,next_offset,total_listings').eq('enabled', true).not('state', 'in', `(${EXCLUDED_STATES.join(',')})`)
      .order('last_refreshed_at', { ascending: true, nullsFirst: true }).limit(60);
    if (error) throw error;
    if (!due?.length) return await finish('skipped', 'No markets are set up for refresh');

    const touched: string[] = []; const newIds: string[] = []; let stopNote: string | undefined;
    for (const m of due) {
      if (result.apiCalls >= maxCalls || Date.now() > deadline) break;
      if (result.quotaRemaining != null && result.quotaRemaining < minRemaining) { stopNote = `Stopped to keep ${minRemaining} AirDNA requests in reserve`; break; }
      try {
        const base = { location: m.market, page_size: '100', bedrooms_min: '3', listing_type: 'entire_place' };
        let offset = m.next_offset ?? 0; let total = 0; const got: Array<Record<string, any>> = [];
        for (let page = 0; page < pagesPerMarket && result.apiCalls < maxCalls && Date.now() < deadline; page++) {
          const res = await fetchListingsPage({ ...base, offset: String(offset) }, () => { result.apiCalls++; });
          total = res.total; if (res.quotaRemaining != null) result.quotaRemaining = res.quotaRemaining;
          got.push(...res.listings); offset += 100;
          if (offset >= total || !res.listings.length) { offset = 0; break; }
        }
        const rows = [...new Map(got.filter(l => l.property_id).map(l => [String(l.property_id), toListingRow(m.market, l)])).values()];
        let fresh: typeof rows = [];
        if (rows.length) {
          const existing = new Set<string>();
          for (let i = 0; i < rows.length; i += 100) { const { data } = await db.from('str_listings').select('property_id').in('property_id', rows.slice(i, i + 100).map(r => r.property_id)); (data ?? []).forEach(r => existing.add(r.property_id)); }
          fresh = rows.filter(r => !existing.has(r.property_id)); const old = rows.filter(r => existing.has(r.property_id));
          // Hosts' portfolio sizes come from the whole table, and an update must not shrink them to this page's count.
          const perHost = new Map<string, number>(); for (const r of rows) if (r.host_id) perHost.set(r.host_id, (perHost.get(r.host_id) ?? 0) + 1);
          const withHost = fresh.map(r => ({ ...r, host_listing_count: r.host_id ? perHost.get(r.host_id) ?? 1 : null }));
          for (let i = 0; i < old.length; i += 200) { const { error: e } = await db.from('str_listings').upsert(old.slice(i, i + 200), { onConflict: 'property_id' }); if (e) throw e; }
          for (let i = 0; i < withHost.length; i += 200) { const { error: e } = await db.from('str_listings').upsert(withHost.slice(i, i + 200), { onConflict: 'property_id' }); if (e) throw e; }
          result.newListings += fresh.length; result.updatedListings += old.length; newIds.push(...fresh.map(r => r.property_id)); touched.push(m.market);
        }
        await db.from('str_market_refresh').update({ last_refreshed_at: new Date().toISOString(), total_listings: total || m.total_listings, next_offset: offset, last_new_listings: fresh.length, last_error: null }).eq('market', m.market);
        result.markets.push(m.market);
      } catch (e) {
        await db.from('str_market_refresh').update({ last_refreshed_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 200) }).eq('market', m.market);
        result.markets.push(`${m.market} (failed)`);
      }
    }

    if (touched.length) {
      await scoreListings(db, { markets: touched, write: true });
      const match = await matchOwners(db, { markets: touched, onlyUnmatched: true, write: true, maxLookups: 120 });
      result.newMatches = match.uniqueIds.length;
      await enrichAssessorOwners(db, { limit: 15, write: true }).catch(() => null);
      await lookupEntityOwners(db, { limit: 15, write: true }).catch(() => null);
      // Tracing the owners of new matches is left to the cohost-skiptrace job, which works ELITE first.
    }
    return await finish(stopNote ? 'quota_reserve' : 'ok', stopNote);
  } catch (e) {
    return await finish('error', (e as Error).message.slice(0, 300));
  }
}

/** Adds markets (for example a new city) to the refresh rotation. California is never added. */
export async function addRefreshMarkets(db: SupabaseClient, markets: string[]) {
  const rows = markets.filter(m => /,\s*[A-Za-z]{2}$/.test(m.trim()) && !EXCLUDED_STATES.includes(stateOf(m))).map(m => ({ market: m.trim(), state: stateOf(m) }));
  if (rows.length) await db.from('str_market_refresh').upsert(rows, { onConflict: 'market', ignoreDuplicates: true });
  return rows.length;
}
