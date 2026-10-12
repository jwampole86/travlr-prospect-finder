/**
 * Schedules the estimate outreach text for every "Fully Verified" lead, once per phone number.
 *
 *   npx tsx scripts/estimate-sms-campaign.ts --at=2026-10-12T15:00:00Z --batch=2026-10-12-verified          (dry run, schedules nothing)
 *   npx tsx scripts/estimate-sms-campaign.ts --at=... --batch=... --test-to=+15551234567                   (texts 2 sample messages to YOUR phone now; schedules nothing)
 *   npx tsx scripts/estimate-sms-campaign.ts --at=... --batch=... --go --tested                            (schedules with Twilio; --tested confirms you read the test texts)
 *   npx tsx scripts/estimate-sms-campaign.ts --cancel=/tmp/campaign-<batch>.json                            (cancels every message still scheduled)
 *
 * --audience=fully-verified (default) | luxury-phone (the dashboard's "Luxury + Phone Available" count, rentals left out).
 * --states=CO,FL,AZ  only leads in these states (early results favored them, so send these first).
 * Anyone already texted by ANY campaign (same lead or same phone number) is skipped, so re-running later only adds leads that
 * became eligible since, and nobody is texted twice.
 *
 * Needs the usual .env values exported, plus SMS_FIRST_TOUCH_ENABLED=true. server-only is stubbed via NODE_PATH when run from tsx.
 */
import fs from 'fs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { draftOutreach, finalizeMessage, inSendWindow, LEAD_COLUMNS, type OutreachLead, type Blocker } from '@/lib/services/estimateOutreachSms';
import { lookupPhoneNumber, smsBlockReason, dispatchSMS } from '@/lib/services/twilioService';
import { scheduleSMS, cancelScheduled } from '@/lib/services/twilioSchedule';
import { toE164 } from '@/lib/services/smsConsent';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const TESTED = process.argv.includes('--tested');
const TEST_TO = toE164(arg('test-to'));
const STATES = arg('states')?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const AUDIENCE = arg('audience') || 'fully-verified';
const SITE = 'https://prospect.staytrvlr.com';
const MESSAGING_SERVICE = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG9c28a48828aae9a648e8d4bcc8c0cd41';

async function pool<T, R>(items: T[], size: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

/** Earliest time at or after `base` (within 8 hours) that falls inside the lead's 9am-8pm local window. */
function sendTimeFor(state: string | null, base: Date): Date | null {
  for (let h = 0; h <= 8; h++) { const t = new Date(base.getTime() + h * 3_600_000); if (inSendWindow(state, t)) return t; }
  return null;
}

(async () => {
  const cancelFile = arg('cancel');
  if (cancelFile) {
    const m = JSON.parse(fs.readFileSync(cancelFile, 'utf8')) as { messages: Array<{ sid: string }> };
    let ok = 0; let fail = 0;
    await pool(m.messages, 5, async x => { const r = await cancelScheduled(x.sid); r.ok ? ok++ : fail++; });
    console.log(`canceled ${ok}, failed ${fail} (already sent or already canceled)`);
    return;
  }

  const at = arg('at'); const batch = arg('batch') || `estimate-${Date.now()}`;
  if (!at || Number.isNaN(Date.parse(at))) throw new Error('--at=<ISO UTC time> is required');
  const base = new Date(at);
  if (process.env.SMS_FIRST_TOUCH_ENABLED !== 'true') throw new Error('SMS_FIRST_TOUCH_ENABLED=true must be set');
  const db = getSupabaseAdmin();

  type Aud = OutreachLead & { prospect_score: number | null };
  let audience: Aud[] = [];
  if (AUDIENCE === 'luxury-phone') {
    // Same flags the dashboard counts for "Luxury + Phone Available" (dashboard_lead_facts), real leads only.
    const { data: facts, error: fe } = await db.from('dashboard_lead_facts').select('lead_id').eq('luxury', true).eq('phone_available', true).limit(5000);
    if (fe) throw fe;
    const ids = (facts ?? []).map(f => f.lead_id as string);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from('leads').select(`${LEAD_COLUMNS},prospect_score`).in('id', ids.slice(i, i + 100)).or('is_synthetic.is.null,is_synthetic.eq.false').or('price_type.is.null,price_type.neq.rent');
      if (error) throw error;
      audience.push(...((data ?? []) as Aud[]));
    }
  } else if (AUDIENCE === 'fully-verified') {
    // Same filter as the lead-management "Fully Verified" view, real (non-synthetic) leads only.
    const { data, error } = await db.from('leads').select(`${LEAD_COLUMNS},prospect_score`).eq('fully_verified', true).or('is_synthetic.is.null,is_synthetic.eq.false').limit(2000);
    if (error) throw error;
    audience = (data ?? []) as Aud[];
  } else throw new Error(`Unknown --audience=${AUDIENCE}`);
  if (STATES?.length) audience = audience.filter(l => STATES.includes(String(l.state ?? '').toUpperCase()));

  // Everyone already texted by any campaign, by lead and by phone number.
  const textedLeads = new Set<string>(); const textedPhones = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outreach_history').select('lead_id,metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) { textedLeads.add(r.lead_id as string); const to = (r.metadata as { to?: string })?.to; if (to) textedPhones.add(to); }
    if ((data ?? []).length < 1000) break;
  }
  const total = audience.length;
  // Leads texted earlier already passed the phone screening, so they count toward how many numbers were screened.
  const alreadyPassed = audience.filter(l => textedLeads.has(l.id)).length;
  audience = audience.filter(l => !textedLeads.has(l.id) && !textedPhones.has(toE164(l.contact_phone) ?? '#'));
  console.log(`audience "${AUDIENCE}": ${total} leads | already texted by an earlier campaign: ${total - audience.length} | new: ${audience.length}`);

  // One text per phone number: keep the highest-scoring lead for each.
  const byPhone = new Map<string, Aud>();
  for (const l of audience.sort((a, b) => (b.prospect_score ?? 0) - (a.prospect_score ?? 0))) {
    const key = toE164(l.contact_phone) ?? `bad:${l.id}`;
    if (!byPhone.has(key)) byPhone.set(key, l);
  }
  const leads = [...byPhone.values()];
  console.log(`${audience.length} leads -> ${leads.length} distinct phone numbers`);

  const skipped: Record<string, number> = {}; const skip = (r: string) => { skipped[r] = (skipped[r] ?? 0) + 1; };
  const prefiltered: Array<{ id: string; reason: 'landline' | 'invalid' }> = [];
  const plan: Array<{ lead: OutreachLead; to: string; sendAt: Date; message: string; variant: string; by: string; segments: number; range: string }> = [];

  await pool(leads, 4, async (lead, i) => {
    const sendAt = sendTimeFor(lead.state, base);
    if (!sendAt) return skip('no_send_window');
    // A/B: alternate tone so replies and clicks can be compared afterwards.
    const variant = i % 2 === 0 ? 'friendly' : 'direct';
    const d = await draftOutreach(db, lead, { site: SITE, tone: variant as 'friendly' | 'direct', now: sendAt });
    const blockers = d.blockers as Blocker[];
    if (blockers.length || !d.to) return skip(blockers[0] ?? 'no_phone');
    const look = await lookupPhoneNumber(d.to);
    const blocked = smsBlockReason(look);
    if (blocked) { prefiltered.push({ id: lead.id, reason: blocked }); return skip(blocked === 'invalid' ? 'invalid_number' : 'landline'); }
    plan.push({ lead, to: d.to, sendAt, message: d.message, variant, by: d.generatedBy, segments: d.segments, range: d.range });
    // The real short link is only created when we actually schedule.
    (plan[plan.length - 1] as { draft?: unknown }).draft = d;
  });

  // ── Report ──
  const count = <K extends string | number>(f: (p: typeof plan[number]) => K) => plan.reduce<Record<string, number>>((a, p) => { const k = String(f(p)); a[k] = (a[k] ?? 0) + 1; return a; }, {});
  console.log('\nready to schedule:', plan.length, '| skipped:', skipped);
  console.log('send times (UTC):', count(p => p.sendAt.toISOString().slice(11, 16)));
  console.log('segments:', count(p => p.segments), '| written by:', count(p => p.by), '| variants:', count(p => p.variant));
  const totalSegs = plan.reduce((a, p) => a + p.segments, 0);
  console.log(`total segments ${totalSegs} -> about $${(totalSegs * 0.0083).toFixed(2)} Twilio + carrier fees $${(totalSegs * 0.003).toFixed(2)}-$${(totalSegs * 0.005).toFixed(2)}`);
  console.log('named greetings:', plan.filter(p => /^Hi [A-Z]/.test(p.message) && !p.message.startsWith('Hi there')).length, 'of', plan.length);
  console.log('\n--- 5 samples ---');
  plan.slice(0, 5).forEach(p => console.log(`\n[${p.lead.state}] ${p.variant}/${p.by}/${p.segments}seg send ${p.sendAt.toISOString()}\n${p.message}`));

  if (TEST_TO) {
    // Exactly the copy that would go out, one per wording, texted to the tester now. Nothing is logged against a lead or scheduled.
    for (const variant of ['friendly', 'direct']) {
      const p = plan.find(x => x.variant === variant); if (!p) continue;
      const r = await dispatchSMS({ to: TEST_TO, body: `[TEST ${variant}] ${p.message}`, leadId: 'campaign-test' });
      console.log(r.success ? `test text (${variant}) sent` : `test text (${variant}) FAILED: ${r.error}`);
    }
    console.log('\nTest texts sent. Read them on your phone, then re-run with --go --tested.'); return;
  }
  if (!GO) { console.log('\nDRY RUN: nothing scheduled. Re-run with --test-to=<your phone> first, then --go --tested.'); return; }
  if (!TESTED) throw new Error('Send the test texts to yourself first (--test-to=<your phone>), read them, then re-run with --go --tested.');

  // Keep the pre-send phone screening: it is the first measure of how accurate the phone numbers are, and the CRM should know which leads to call instead of text.
  if (prefiltered.length) {
    for (const reason of ['landline', 'invalid'] as const) {
      for (const id of prefiltered.filter(p => p.reason === reason).map(p => p.id)) {
        const { data: row } = await db.from('leads').select('tags').eq('id', id).maybeSingle();
        const tags = [...new Set([...(row?.tags as string[] | null ?? []).filter(t => !t.startsWith('sms:phone:')), `sms:phone:${reason}`])];
        await db.from('leads').update({ tags }).eq('id', id);
      }
    }
  }
  await db.from('campaign_insight_snapshots').delete().eq('batch', `${batch}:prefilter`);
  await db.from('campaign_insight_snapshots').insert({ batch: `${batch}:prefilter`, report: { audience: AUDIENCE, audienceLeads: alreadyPassed + leads.length, landline: prefiltered.filter(p => p.reason === 'landline').length, invalid: prefiltered.filter(p => p.reason === 'invalid').length, recordedAt: new Date().toISOString() } });

  // ── Schedule ──
  const manifest: Array<{ sid: string; leadId: string; to: string; sendAt: string }> = []; const failures: Array<{ leadId: string; error?: string }> = [];
  await pool(plan, 5, async p => {
    const d = (p as unknown as { draft: Parameters<typeof finalizeMessage>[1] }).draft;
    const message = await finalizeMessage(db, d, SITE);
    const r = await scheduleSMS({ to: p.to, body: message, sendAt: p.sendAt, messagingServiceSid: MESSAGING_SERVICE, statusCallback: `${SITE}/api/sms/delivery` });
    if (!r.ok || !r.sid) { failures.push({ leadId: p.lead.id, error: r.error }); return; }
    manifest.push({ sid: r.sid, leadId: p.lead.id, to: p.to, sendAt: p.sendAt.toISOString() });
    await db.from('outreach_history').insert({
      lead_id: p.lead.id, channel: 'sms', status: 'sent', sent_at: p.sendAt.toISOString(),
      metadata: { kind: 'estimate_outreach', batch, audience: AUDIENCE, to: p.to, message, variant: p.variant, generated_by: p.by, range: p.range, segments: p.segments, state: p.lead.state,
        message_sid: r.sid, twilio_status: 'scheduled', scheduled_for: p.sendAt.toISOString(), named: /^Hi [A-Z]/.test(message) && !message.startsWith('Hi there') },
    });
  });
  // Merge with any earlier run of this batch so the cancel list always covers every scheduled text, and never overwrite it with an empty list.
  const file = `/tmp/campaign-${batch}.json`;
  const earlier = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).messages as typeof manifest) : [];
  if (manifest.length) fs.writeFileSync(file, JSON.stringify({ batch, messages: [...earlier, ...manifest] }, null, 1));
  console.log(`\nSCHEDULED ${manifest.length} | failed ${failures.length}`, failures.slice(0, 5), `\nmanifest (use --cancel to undo): ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
