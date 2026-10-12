/**
 * Scores stored short-term-rental listings for co-listing outreach and writes the result back to str_listings.
 * The scoring itself lives in src/lib/services/strScoring.ts so the scheduled refresh uses exactly the same rules.
 *
 *   npx tsx scripts/str-score-listings.ts            (prints the summary only)
 *   npx tsx scripts/str-score-listings.ts --go       (writes scores)
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { scoreListings } from '@/lib/services/strScoring';

const GO = process.argv.includes('--go');

(async () => {
  const s = await scoreListings(getSupabaseAdmin(), { write: GO });
  console.log('segments:', s.segments);
  console.log('candidates by market:', s.candidatesByMarket);
  console.log('luxury candidates:', s.luxuryCandidates, '| elite candidates:', s.eliteCandidates);
  console.log(GO ? `scored ${s.scored} listings` : 'DRY RUN: nothing written. Re-run with --go.');
})().catch(e => { console.error(e); process.exit(1); });
