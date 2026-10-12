/**
 * Matches candidate listings to public short-term-rental registry entries (and, for registries that do not publish bedrooms, to the
 * county property record). The matching itself lives in src/lib/services/strMatch.ts so the scheduled refresh uses the same rules.
 * Matches are probable, not certain, and are meant for human review.
 *
 *   npx tsx scripts/str-match-owners.ts --markets="Breckenridge, CO|Aspen, CO"          (dry run: prints results, writes nothing)
 *   npx tsx scripts/str-match-owners.ts --markets=... --go
 *   npx tsx scripts/str-match-owners.ts --all-except=CO,NV,WA,CA --go                    (every pulled market outside those states)
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { matchOwners } from '@/lib/services/strMatch';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const exceptStates = (arg('all-except') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const markets = (arg('markets') ?? 'Breckenridge, CO|Aspen, CO').split('|').map(s => s.trim());

(async () => {
  const r = await matchOwners(getSupabaseAdmin(), { markets, exceptStates, write: GO, onProgress: s => process.stdout.write(s) });
  console.log('\ncandidates checked:', r.checked, r.tally);
  for (const u of r.unique.slice(0, 8)) console.log(`UNIQUE ${u.market.split(',')[0]} | ${u.title?.slice(0, 40)} -> ${u.address} (${u.jurisdiction} ${u.permit}) ${u.distanceM}m | owner of record: ${u.owner || 'n/a'} | permit holder: ${u.holder || 'n/a'}`);
  console.log(GO ? 'saved' : '\nDRY RUN: nothing written. Re-run with --go.');
})().catch(e => { console.error(e); process.exit(1); });
