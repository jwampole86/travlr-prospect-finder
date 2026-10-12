/**
 * Scores listing photos with a vision model for the shortlisted candidates, and stores concrete improvement notes.
 * Every photo in the listing is reviewed (src/lib/services/strPhotos.ts): the complete photo list is fetched first when the stored one holds
 * only the first twelve, photos that cannot be loaded are counted and left out, and a listing whose photos cannot be reviewed is not scored
 * at all, so a score never blames an owner for spaces that were simply outside a sample.
 *
 *   npx tsx scripts/str-score-photos.ts --limit=3          (dry run: shows the plan; scores listings that already have every photo, saves nothing)
 *   npx tsx scripts/str-score-photos.ts --limit=40 --go    (fetch complete photo sets, score and store the top 40)
 *
 * A listing is queued when it has no score, or when its score came from a partial photo sample.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { PHOTO_MODEL, completePhotoSets, hasAllPhotos, scoreListingPhotos, type PhotoListing } from '@/lib/services/strPhotos';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const LIMIT = Number(arg('limit') ?? 40);
const CONCURRENCY = Number(arg('concurrency') ?? 2);
type Row = PhotoListing & { under_score: number | null; photo_score: number | null; photo_notes: { complete?: boolean } | null };

(async () => {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const db = getSupabaseAdmin(); const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 180_000 });
  const cols = 'property_id,market,title,bedrooms,bathrooms,photo_count,photo_urls_all,under_score,photo_score,photo_notes';

  // Matched listings first (they are the ones outreach could actually reach), then the strongest remaining owner-hosted luxury candidates.
  const { data: matched } = await db.from('str_listings').select(cols).in('match_status', ['unique', 'ambiguous']).order('under_score', { ascending: false, nullsFirst: false }).limit(1000);
  const { data: rest } = await db.from('str_listings').select(cols).eq('segment', 'candidate').eq('is_luxury', true).lte('host_listing_count', 2).order('under_score', { ascending: false, nullsFirst: false }).limit(600);
  const seen = new Set<string>();
  const picks = ([...(matched ?? []), ...(rest ?? [])] as Row[]).filter(r => (seen.has(r.property_id) ? false : (seen.add(r.property_id), (r.photo_count ?? 0) >= 3 && !(r.photo_score != null && r.photo_notes?.complete)))).slice(0, LIMIT);
  const incomplete = picks.filter(r => !hasAllPhotos(r));
  const markets = new Set(incomplete.map(r => r.market));
  console.log(`listings to score: ${picks.length} (model ${PHOTO_MODEL}) | need their full photo list first: ${incomplete.length} across ${markets.size} markets`);

  if (GO && incomplete.length) {
    const r = await completePhotoSets(db, incomplete, { onLog: s => console.log('  ' + s) });
    console.log(`photo lists completed: ${r.updated}, not found: ${r.notFound} | AirDNA calls: ${r.apiCalls}`);
    const { data: fresh } = await db.from('str_listings').select('property_id,photo_urls_all,photo_count').in('property_id', incomplete.map(p => p.property_id));
    const byId = new Map((fresh ?? []).map(f => [f.property_id, f])); for (const p of incomplete) Object.assign(p, byId.get(p.property_id));
  }

  let inT = 0, outT = 0, done = 0, skipped = 0, failed = 0, next = 0;
  async function worker() {
    while (next < picks.length) {
      const l = picks[next++]; const label = `${l.market.split(',')[0].padEnd(10)} ${String(l.title).slice(0, 38).padEnd(38)}`;
      if (!hasAllPhotos(l)) { skipped++; console.log(`SKIP ${label} photo list incomplete${GO ? ' (listing no longer found in its market feed)' : ' (run with --go to fetch it)'}`); continue; }
      try {
        const res = await scoreListingPhotos(client, l); inT += res.inputTokens; outT += res.outputTokens;
        if (!res.verdict) {
          skipped++; console.log(`SKIP ${label} ${res.reason}`);
          // A score from a partial sample is misleading, so it is withdrawn rather than left in place.
          if (GO && l.photo_score != null) await db.from('str_listings').update({ photo_score: null, photo_notes: { complete: false, reason: res.reason, at: new Date().toISOString() } }).eq('property_id', l.property_id);
          continue;
        }
        const v = res.verdict; done++;
        console.log(`[${String(v.score).padStart(3)}] ${label} ${res.reviewed}/${res.total} photos | hero ${v.hero} | ${v.looksDated ? 'dated | ' : ''}missing: ${(v.missingShots ?? []).slice(0, 3).join(', ') || 'none'}\n        fix: ${(v.fixes ?? [])[0] ?? ''}`);
        if (GO) await db.from('str_listings').update({ photo_score: Math.round(Number(v.score)), photo_notes: { ...v, model: PHOTO_MODEL, photosReviewed: res.reviewed, of: res.total, unreachable: res.unreachable, complete: true, at: new Date().toISOString() } }).eq('property_id', l.property_id);
      } catch (e) { failed++; console.log(`FAILED ${label} ${(e as Error).message.slice(0, 140)}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
  const usd = (inT / 1e6) * 3 + (outT / 1e6) * 15;
  console.log(`scored ${done}, skipped ${skipped}, failed ${failed} | tokens in ${inT} out ${outT} | about $${usd.toFixed(2)} | ${GO ? 'saved' : 'NOT saved (add --go)'}`);
})().catch(e => { console.error(e); process.exit(1); });
