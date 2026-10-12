/**
 * Skip-traces ONLY the owners of record for listings with a unique, human-reviewable registry match.
 * Searches by owner name + the mailing address on the county property record, then accepts a person only if their address history
 * contains that mailing street. The search lives in src/lib/services/strSkipTrace.ts. Nothing is contacted.
 *
 *   npx tsx scripts/str-skiptrace-owners.ts            (dry run: lists who would be searched)
 *   npx tsx scripts/str-skiptrace-owners.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { skipTraceEligibility, skipTraceListing } from '@/lib/services/strSkipTrace';

const GO = process.argv.includes('--go');

(async () => {
  const db = getSupabaseAdmin();
  const { data } = await db.from('str_listings').select('property_id,title,matched_address,matched_owner').eq('match_status', 'unique');
  // A property claimed by two listings cannot be trusted for either one.
  const addrCount = new Map<string, number>(); for (const r of data ?? []) addrCount.set(r.matched_address, (addrCount.get(r.matched_address) ?? 0) + 1);
  const todo = (data ?? []).filter(r => (addrCount.get(r.matched_address) ?? 0) === 1 && skipTraceEligibility(r.matched_owner).eligible && !r.matched_owner.skipTrace);
  console.log(`unique matches ${data?.length} | eligible for skip-trace and not yet traced ${todo.length}:`);
  todo.forEach(r => console.log(`  ${r.matched_address.split(',')[0]} -> ${r.matched_owner.names.join(' & ')} | mailing ${r.matched_owner.mailing}`));
  if (!GO) { console.log('DRY RUN: no searches made. Re-run with --go.'); return; }
  let calls = 0;
  for (const r of todo) {
    const t = await skipTraceListing(db, r); calls += t.apiCalls;
    const hits = (t.skipTrace?.results ?? []).filter((x: any) => x.found);
    console.log(`${r.matched_address.split(',')[0]}: ${t.error ?? (hits.length ? hits.map((x: any) => `${x.found.name} (${x.found.phones.length} phones, ${x.found.emails.length} emails)`).join('; ') : 'no address-confirmed person found')}`);
  }
  console.log('skip-trace API calls:', calls);
})().catch(e => { console.error(e); process.exit(1); });
