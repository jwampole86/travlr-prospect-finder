/**
 * Re-quotes scheduled campaign texts whose revenue range changed after the lead data improved (for example Zillow beds/rent),
 * so the text always matches what the estimate page shows. Each replaced text keeps its original send time.
 *
 *   npx tsx scripts/refresh-campaign-estimates.ts --batch=2026-10-12-verified          (dry run)
 *   npx tsx scripts/refresh-campaign-estimates.ts --batch=2026-10-12-verified --go
 */
import fs from 'fs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { draftOutreach, finalizeMessage, LEAD_COLUMNS, type OutreachLead } from '@/lib/services/estimateOutreachSms';
import { scheduleSMS, cancelScheduled } from '@/lib/services/twilioSchedule';
import { parse } from './lib/verifiedAddress';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const batch = arg('batch') || '2026-10-12-verified';
const SITE = 'https://prospect.staytrvlr.com';
const MESSAGING_SERVICE = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG9c28a48828aae9a648e8d4bcc8c0cd41';

type L = OutreachLead & { verified_address: string | null };

(async () => {
  if (process.env.SMS_FIRST_TOUCH_ENABLED !== 'true') throw new Error('SMS_FIRST_TOUCH_ENABLED=true must be set');
  const db = getSupabaseAdmin();
  const { data: hist, error } = await db.from('outreach_history').select('id,lead_id,metadata').eq('channel', 'sms').eq('metadata->>batch', batch).eq('metadata->>kind', 'estimate_outreach');
  if (error) throw error;
  const rows = hist ?? [];
  const { data: leads } = await db.from('leads').select(`${LEAD_COLUMNS},verified_address`).in('id', rows.map(r => r.lead_id as string));
  const byId = new Map(((leads ?? []) as L[]).map(l => [l.id, l]));

  const changes: Array<{ row: (typeof rows)[number]; lead: L; sendAt: Date; variant: 'friendly' | 'direct'; oldRange: string; draft: Awaited<ReturnType<typeof draftOutreach>> }> = [];
  let same = 0; const problems: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < rows.length) {
      const row = rows[next++]; const m = row.metadata as { range?: string; scheduled_for?: string; variant?: string };
      const base = byId.get(row.lead_id as string); if (!base) continue;
      // Same lead view the repair used: authoritative street/city/state for rows that still carry the placeholder city.
      const fix = (base.address ?? '').includes(',') && base.verified_address ? parse(base.verified_address) : null;
      const lead: L = fix ? { ...base, address: fix.street, city: fix.city, state: fix.state, zip: fix.zip || base.zip } : base;
      const sendAt = new Date(m.scheduled_for ?? '');
      if (Number.isNaN(sendAt.getTime())) { problems.push(`${lead.id} no send time`); continue; }
      const variant = m.variant === 'direct' ? 'direct' : 'friendly';
      // The old row is this lead's own earlier text; ignore it for the "contacted recently" guard.
      const draft = await draftOutreach(db, lead, { site: SITE, tone: variant, now: sendAt });
      const blockers = draft.blockers.filter(b => b !== 'contacted_recently');
      if (blockers.length || !draft.to || !draft.range) { problems.push(`${lead.id} ${blockers.join(',') || 'no range'}`); continue; }
      if (draft.range === m.range) { same++; continue; }
      changes.push({ row, lead, sendAt, variant, oldRange: m.range ?? '', draft });
    }
  }));
  console.log(`texts ${rows.length} | already match the estimate page ${same} | need re-quoting ${changes.length} | problems ${problems.length}`, problems.slice(0, 10));
  changes.slice(0, 12).forEach(c => console.log(`${c.lead.address}, ${c.lead.city}: ${c.oldRange} -> ${c.draft.range}`));
  if (!GO) { console.log('\nDRY RUN: nothing changed. Re-run with --go.'); return; }
  if (changes.some(c => c.sendAt.getTime() - Date.now() < 30 * 60_000)) throw new Error('A send time is less than 30 minutes away; refusing.');

  fs.writeFileSync(`/tmp/refresh-backup-${Date.now()}.json`, JSON.stringify(changes.map(c => c.row)));
  const log = { replaced: 0, failed: [] as string[] };
  let k = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (k < changes.length) {
      const c = changes[k++]; const sid = (c.row.metadata as { message_sid?: string }).message_sid;
      try {
        // Schedule the new text first; only cancel the old one once the new one exists, so a lead is never left without a text.
        const d = await draftOutreach(db, c.lead, { site: SITE, tone: c.variant, now: c.sendAt });
        const draft = { ...d, blockers: d.blockers.filter(b => b !== 'contacted_recently') };
        if (draft.blockers.length || !draft.to) throw new Error(`blocked: ${draft.blockers.join(',')}`);
        const message = await finalizeMessage(db, draft, SITE);
        const r = await scheduleSMS({ to: draft.to, body: message, sendAt: c.sendAt, messagingServiceSid: MESSAGING_SERVICE, statusCallback: `${SITE}/api/sms/delivery` });
        if (!r.ok || !r.sid) throw new Error(r.error || 'schedule_failed');
        if (sid) { const x = await cancelScheduled(sid); if (!x.ok) { await cancelScheduled(r.sid); throw new Error(`old text not cancelable: ${x.error}`); } }
        const meta = c.row.metadata as Record<string, unknown>;
        await db.from('outreach_history').update({ metadata: { ...meta, message, range: draft.range, segments: draft.segments, generated_by: draft.generatedBy, message_sid: r.sid, estimate_refreshed: true, previous_range: c.oldRange } }).eq('id', c.row.id);
        log.replaced++;
      } catch (e) { log.failed.push(`${c.lead.id} ${(e as Error).message}`); }
    }
  }));
  console.log('RESULT', JSON.stringify(log, null, 1));

  const { data: after } = await db.from('outreach_history').select('lead_id,metadata').eq('metadata->>batch', batch).eq('metadata->>kind', 'estimate_outreach');
  const messages = (after ?? []).map(r => { const m = r.metadata as { message_sid: string; to: string; scheduled_for: string }; return { sid: m.message_sid, leadId: r.lead_id, to: m.to, sendAt: m.scheduled_for }; });
  fs.writeFileSync(`/tmp/campaign-${batch}.json`, JSON.stringify({ batch, messages }, null, 1));
  console.log(`manifest rebuilt: ${messages.length} messages`);
})().catch(e => { console.error(e); process.exit(1); });
