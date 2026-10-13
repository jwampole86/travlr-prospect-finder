/**
 * VAYO "Future of Property Turnovers" newsletter sender. Dry run unless --go. Nothing can send until
 * FUTURE_STR_SENDING_ENABLED=true and the FUTURE_STR_* sender, reply-to, postal and site settings exist.
 *
 *   npx tsx scripts/future-str-send.ts --status
 *   npx tsx scripts/future-str-send.ts --confirmations [--go]
 *   npx tsx scripts/future-str-send.ts --issue=1 --audience=homeowner --test-to=you@example.com
 *   npx tsx scripts/future-str-send.ts --issue=1 --audience=homeowner [--go]
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { readiness, sendConfirmations, sendIssue } from '@/lib/services/futureStr';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string) => process.argv.includes(`--${n}`);

(async () => {
  console.log('readiness:', readiness());
  if (has('status')) return;
  const db = getSupabaseAdmin(); const go = has('go');
  if (has('confirmations')) { console.log(await sendConfirmations(db, { go })); if (!go) console.log('DRY RUN: nothing sent. Re-run with --go.'); return; }
  const issue = Number(arg('issue')); const audience = arg('audience');
  if (!issue || (audience !== 'homeowner' && audience !== 'operator')) throw new Error('Use --issue=<n> --audience=homeowner|operator');
  const r = await sendIssue(db, { issue, audience, go, testTo: arg('test-to') });
  console.log(r); if (!go && !arg('test-to')) console.log('DRY RUN: nothing sent. Re-run with --go.');
})().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
