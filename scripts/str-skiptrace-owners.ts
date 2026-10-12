/**
 * Skip-traces ONLY the owners of record for listings with a unique, human-reviewable registry match.
 * Searches by owner name + the mailing address on the county property record, then accepts a person only if their address history
 * contains that mailing street. The search lives in src/lib/services/strSkipTrace.ts. Nothing is contacted.
 *
 *   npx tsx scripts/str-skiptrace-owners.ts            (dry run: lists who would be searched)
 *   npx tsx scripts/str-skiptrace-owners.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cohostTraceQueue, runCohostSkipTrace } from '@/lib/services/cohostSkipTraceQueue';

const GO = process.argv.includes('--go');
const max = Number(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] ?? 50);

(async () => {
  const db = getSupabaseAdmin();
  const todo = await cohostTraceQueue(db);
  console.log(`waiting in the queue (ELITE first): ${todo.length}`);
  todo.slice(0, max).forEach(r => console.log(`  ${r.is_elite ? 'ELITE ' : r.is_luxury ? 'LUXURY' : '      '} ${String(r.matched_address).split(',')[0]} -> ${r.matched_owner.names.join(' & ')} | mailing ${r.matched_owner.mailing ?? 'none (property address)'}`));
  if (!GO) { console.log('DRY RUN: no searches made. Re-run with --go.'); return; }
  console.log(await runCohostSkipTrace(db, { max, deadlineMs: 20 * 60_000 }));
})().catch(e => { console.error(e); process.exit(1); });
