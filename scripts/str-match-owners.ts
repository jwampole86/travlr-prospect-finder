/**
 * Matches candidate listings to public short-term-rental registry entries (and, for registries that do not publish bedrooms, to the
 * county property record). The matching itself lives in src/lib/services/strMatch.ts so the scheduled refresh uses the same rules.
 * Matches are probable, not certain, and are meant for human review.
 *
 *   npx tsx scripts/str-match-owners.ts --markets="Breckenridge, CO|Aspen, CO"          (dry run: prints results, writes nothing)
 *   npx tsx scripts/str-match-owners.ts --markets=... --go
 *   npx tsx scripts/str-match-owners.ts --all-except=CO,NV,WA,CA --go                    (every pulled market outside those states)
 *   npx tsx scripts/str-match-owners.ts --markets=... --unmatched --recheck --go         (only new listings, and those that found no registry before; use after loading registries)
 *   npx tsx scripts/str-match-owners.ts --all-except=... --statuses=too_many --radius-scale=0.5 --only-improve --go   (narrow the radius for crowded results; keeps old results unless they narrow to 1-3 homes)
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { matchOwners } from '@/lib/services/strMatch';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const ELITE = process.argv.includes('--elite');
const LUXURY = process.argv.includes('--luxury');
const UNMATCHED = process.argv.includes('--unmatched');
const RECHECK = process.argv.includes('--recheck');
const onlyStatuses = (arg('statuses') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const IMPROVE = process.argv.includes('--only-improve');
const radiusScale = Number(arg('radius-scale')) || undefined;
const maxLookups = Number(arg('max-lookups')) || undefined;
const exceptStates = (arg('all-except') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const markets = (arg('markets') ?? 'Breckenridge, CO|Aspen, CO').split('|').map(s => s.trim());

(async () => {
  const r = await matchOwners(getSupabaseAdmin(), { markets, exceptStates, write: GO, eliteOnly: ELITE, luxuryOnly: LUXURY, maxLookups, onlyUnmatched: UNMATCHED, recheckNoRegistry: RECHECK, onlyStatuses, radiusScale, onlyImprove: IMPROVE, onProgress: s => process.stdout.write(s) });
  console.log('\ncandidates checked:', r.checked, r.tally);
  for (const u of r.unique.slice(0, 8)) console.log(`UNIQUE ${u.market.split(',')[0]} | ${u.title?.slice(0, 40)} -> ${u.address} (${u.jurisdiction} ${u.permit}) ${u.distanceM}m | owner of record: ${u.owner || 'n/a'} | permit holder: ${u.holder || 'n/a'}`);
  console.log(GO ? 'saved' : '\nDRY RUN: nothing written. Re-run with --go.');
})().catch(e => { console.error(e); process.exit(1); });
