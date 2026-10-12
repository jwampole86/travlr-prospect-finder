/**
 * One-off repair: some leads were imported with a placeholder city/state ("Denver, CO") and the real
 * address inside the street field. verified_address is the authoritative value. This script fixes the
 * lead's street/city/state/zip and replaces its scheduled text (cancel old, schedule new).
 *
 *   npx tsx scripts/fix-campaign-addresses.ts --batch=2026-10-12-verified --at=2026-10-12T15:00:00Z           (dry run)
 *   npx tsx scripts/fix-campaign-addresses.ts --batch=... --at=... --go
 */
import fs from 'fs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { draftOutreach, finalizeMessage, inSendWindow, LEAD_COLUMNS, type OutreachLead } from '@/lib/services/estimateOutreachSms';
import { scheduleSMS, cancelScheduled } from '@/lib/services/twilioSchedule';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const SITE = 'https://prospect.staytrvlr.com';
const MESSAGING_SERVICE = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG9c28a48828aae9a648e8d4bcc8c0cd41';
const batch = arg('batch') || '2026-10-12-verified';
const base = new Date(arg('at') || '2026-10-12T15:00:00Z');

const KNOWN: Record<string, string[]> = JSON.parse(fs.readFileSync('/tmp/known_cities.json', 'utf8'));
const SFX = /\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Cir|Circle|Way|Pl|PI|Place|Ter|Terrace|Trl|Trail|Pkwy|Parkway|Hwy|Loop|Cross|Bch|Beach|Walk|Path|Run|Row|Cv|Cove|Pt|Point|Rdg|Ridge|Cres|Crescent|Pass)\.?$/i;
// Cases the automatic split gets wrong or cannot split (checked by hand against the addresses).
const MANUAL: Record<string, [string, string]> = {
  '45447 Camino Del Rey Indian Wells, CA 92210': ['45447 Camino Del Rey', 'Indian Wells'],
  '7970 County Road 41 Fort Calhoun, NE 68023': ['7970 County Road 41', 'Fort Calhoun'],
  '6183 Point Glover Ln E Port Orchard, WA 98366': ['6183 Point Glover Ln E', 'Port Orchard'],
};

function parse(v: string): { street: string; city: string; state: string; zip: string } | null {
  v = v.trim();
  const m = v.match(/^(.*?)[,\s]+([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?$/);
  if (!m) return null;
  const [, body, st, zp] = m; const state = st.toUpperCase(); const zip = zp || '';
  if (MANUAL[v]) return { street: MANUAL[v][0], city: MANUAL[v][1], state, zip };
  if (body.includes(',')) { const i = body.lastIndexOf(','); return { street: body.slice(0, i).trim(), city: body.slice(i + 1).trim(), state, zip }; }
  // Prefer a city that is known for this state and follows a street suffix.
  for (const c of [...(KNOWN[state] ?? [])].sort((a, b) => b.length - a.length)) {
    const rest = body.toLowerCase().endsWith(' ' + c.toLowerCase()) ? body.slice(0, body.length - c.length).trim() : null;
    if (rest && rest.length > 3 && SFX.test(rest)) return { street: rest, city: c, state, zip };
  }
  for (const c of [...(KNOWN[state] ?? [])].sort((a, b) => b.length - a.length)) {
    const rest = body.toLowerCase().endsWith(' ' + c.toLowerCase()) ? body.slice(0, body.length - c.length).trim() : null;
    if (rest && rest.length > 3) return { street: rest, city: c, state, zip };
  }
  // Unknown city: split after the first street-type word (lazy), e.g. "150 Bird Dr Ketchum".
  const sfx = SFX.source.replace(/\\b/, '').replace(/\$$/, '');
  const mm = body.match(new RegExp(`^(.*?\\b${sfx})\\s+([A-Za-z][A-Za-z .'-]+)$`, 'i'));
  if (mm) return { street: mm[1].trim(), city: mm[2].trim(), state, zip };
  return null;
}

function sendTimeFor(state: string | null, from: Date): Date | null {
  for (let h = 0; h <= 8; h++) { const t = new Date(from.getTime() + h * 3_600_000); if (inSendWindow(state, t)) return t; }
  return null;
}
async function twilioStatus(sid: string): Promise<string | null> {
  const key = process.env.TWILIO_ACCOUNT_SID!; const sec = process.env.TWILIO_AUTH_TOKEN!;
  const acct = key.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN! : key;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/Messages/${sid}.json`, { headers: { Authorization: `Basic ${Buffer.from(`${key}:${sec}`).toString('base64')}` } });
  return r.ok ? ((await r.json()) as { status?: string }).status ?? null : null;
}
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

(async () => {
  const db = getSupabaseAdmin();
  if (process.env.SMS_FIRST_TOUCH_ENABLED !== 'true') throw new Error('SMS_FIRST_TOUCH_ENABLED=true must be set');
  if (GO && Date.now() > base.getTime() - 30 * 60_000) throw new Error('Too close to (or past) the send time; refusing to reschedule.');

  const { data: hist, error: he } = await db.from('outreach_history').select('id,lead_id,metadata').eq('channel', 'sms').eq('metadata->>batch', batch).eq('metadata->>kind', 'estimate_outreach');
  if (he) throw he;
  const rows = hist ?? [];
  const leadIds = [...new Set(rows.map(r => r.lead_id as string))];
  const { data: leads, error: le } = await db.from('leads').select(`${LEAD_COLUMNS},verified_address`).in('id', leadIds);
  if (le) throw le;

  const todo: Array<{ lead: OutreachLead & { verified_address: string | null }; fix: NonNullable<ReturnType<typeof parse>>; old: typeof rows }> = [];
  const unparsed: string[] = [];
  for (const lead of (leads ?? []) as Array<OutreachLead & { verified_address: string | null }>) {
    if (!lead.verified_address) continue;
    const fix = parse(lead.verified_address);
    if (!fix) { unparsed.push(`${lead.id} ${lead.verified_address}`); continue; }
    const streetHasComma = (lead.address ?? '').includes(',');
    const mine = rows.filter(r => r.lead_id === lead.id);
    const replaced = mine.some(r => (r.metadata as { address_repaired?: boolean })?.address_repaired);
    if (replaced) continue;
    let canceled = false;
    for (const r of mine) { const sid = (r.metadata as { message_sid?: string })?.message_sid; if (sid && (await twilioStatus(sid)) === 'canceled') canceled = true; }
    const differs = streetHasComma || canceled || norm(fix.city) !== norm(lead.city) || norm(fix.state) !== norm(lead.state);
    if (differs) todo.push({ lead, fix, old: rows.filter(r => r.lead_id === lead.id) });
  }
  console.log(`batch leads ${leadIds.length} | need fixing ${todo.length} | could not parse ${unparsed.length}`, unparsed);
  const sanity = todo.filter(t => !t.fix.zip || t.fix.street.length < 4);
  if (sanity.length) console.log('suspicious:', sanity.map(s => s.lead.verified_address));
  todo.slice(0, 200).forEach(t => console.log(`${t.lead.verified_address}  =>  [${t.fix.street}] [${t.fix.city}] [${t.fix.state}] [${t.fix.zip}]   (was ${t.lead.city}, ${t.lead.state})`));
  if (!GO) { console.log('\nDRY RUN: nothing changed. Re-run with --go.'); return; }

  fs.writeFileSync(`/tmp/address-fix-backup-${Date.now()}.json`, JSON.stringify(todo.map(t => ({ id: t.lead.id, address: t.lead.address, city: t.lead.city, state: t.lead.state, zip: t.lead.zip, oldHistory: t.old })), null, 1));

  const log = { collisions: [] as string[], fixed: 0, canceled: 0, cancelFailed: [] as string[], scheduled: 0, failed: [] as string[] };
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < todo.length) {
      const t = todo[next++]; const id = t.lead.id;
      try {
        // 1. Cancel the old (wrong-address) texts first. If Twilio says it can no longer cancel, leave the lead alone.
        let canCancel = true;
        for (const o of t.old) {
          const sid = (o.metadata as { message_sid?: string })?.message_sid; if (!sid) continue;
          const st = await twilioStatus(sid);
          const r = st === 'canceled' ? { ok: true as const, error: undefined } : await cancelScheduled(sid);
          if (!r.ok) { canCancel = false; log.cancelFailed.push(`${id} ${sid} ${r.error ?? ''}`); } else log.canceled++;
        }
        if (!canCancel) continue;
        // Old rows would trip the "contacted recently" guard; the texts are canceled, so clear them now (backup file keeps them).
        await db.from('outreach_history').delete().in('id', t.old.map(o => o.id));

        // 2. Correct the lead. If another lead already owns this exact address, keep this row as-is and only use the corrected address for the text.
        const { error } = await db.from('leads').update({ address: t.fix.street, city: t.fix.city, state: t.fix.state, zip: t.fix.zip || t.lead.zip }).eq('id', id);
        if (error) { if (error.code === '23505') log.collisions.push(`${id} ${t.lead.verified_address}`); else throw error; } else log.fixed++;
        const lead = { ...t.lead, address: t.fix.street, city: t.fix.city, state: t.fix.state, zip: t.fix.zip || t.lead.zip };

        // 3. Fresh text with the right location; keep the A/B variant and move the send time to the right time zone.
        const variant = ((t.old[0]?.metadata as { variant?: string })?.variant === 'direct' ? 'direct' : 'friendly') as 'friendly' | 'direct';
        const sendAt = sendTimeFor(lead.state, base);
        if (!sendAt) throw new Error('no_send_window');
        const d = await draftOutreach(db, lead, { site: SITE, tone: variant, now: sendAt });
        if (d.blockers.length || !d.to) throw new Error(`blocked: ${d.blockers.join(',')}`);
        const message = await finalizeMessage(db, d, SITE);
        const r = await scheduleSMS({ to: d.to, body: message, sendAt, messagingServiceSid: MESSAGING_SERVICE, statusCallback: `${SITE}/api/sms/delivery` });
        if (!r.ok || !r.sid) throw new Error(r.error || 'schedule_failed');

        // 4. Swap the log rows and drop the old short links (they pointed at the wrong estimate).
        await db.from('link_clicks').delete().eq('lead_id', id).eq('sequence_name', 'estimate_outreach').neq('original_url', d.longUrl);
        await db.from('outreach_history').insert({
          lead_id: id, channel: 'sms', status: 'sent', sent_at: sendAt.toISOString(),
          metadata: { kind: 'estimate_outreach', batch, to: d.to, message, variant, generated_by: d.generatedBy, range: d.range, segments: d.segments, state: lead.state,
            message_sid: r.sid, twilio_status: 'scheduled', scheduled_for: sendAt.toISOString(), named: /^Hi [A-Z]/.test(message) && !message.startsWith('Hi there'), address_repaired: true },
        });
        log.scheduled++;
      } catch (e) { log.failed.push(`${id} ${(e as Error).message}`); }
    }
  }));
  console.log('\nRESULT', JSON.stringify(log, null, 1));

  // Rebuild the cancel manifest from the database so it matches what is really scheduled.
  const { data: after } = await db.from('outreach_history').select('lead_id,metadata').eq('metadata->>batch', batch).eq('metadata->>kind', 'estimate_outreach');
  const messages = (after ?? []).map(r => { const m = r.metadata as { message_sid: string; to: string; scheduled_for: string }; return { sid: m.message_sid, leadId: r.lead_id, to: m.to, sendAt: m.scheduled_for }; });
  fs.writeFileSync(`/tmp/campaign-${batch}.json`, JSON.stringify({ batch, messages }, null, 1));
  console.log(`manifest rebuilt: ${messages.length} messages -> /tmp/campaign-${batch}.json`);
})().catch(e => { console.error(e); process.exit(1); });
