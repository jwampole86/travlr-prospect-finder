/**
 * Moves leads that already operate a licensed short-term rental out of the homeowner-conversion program and into the co-host program.
 * Evidence used: an ACTIVE entry on a public STR license registry (str_registry) at the lead's address and city.
 * A lead moved this way is never texted by the conversion campaigns, and any text still scheduled for it is cancelled.
 *
 *   npx tsx scripts/mark-existing-str-leads.ts            (dry run)
 *   npx tsx scripts/mark-existing-str-leads.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cancelScheduled } from '@/lib/services/twilioSchedule';
import { normStreet } from './lib/normStreet';
import { parse } from './lib/verifiedAddress';

const GO = process.argv.includes('--go');
type L = { id: string; address: string | null; city: string | null; state: string | null; verified_address: string | null; tags: string[] | null; program: string };

(async () => {
  const db = getSupabaseAdmin();
  // The database returns at most 1,000 rows per request, so read the registry in pages or most licenses are silently missed.
  const reg: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('str_registry').select('jurisdiction,permit_id,address,address_norm,active').eq('active', true).range(from, from + 999);
    if (error) throw error; reg.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
  }
  const byNorm = new Map<string, Array<{ jurisdiction: string; permit_id: string; address: string }>>();
  for (const r of reg) (byNorm.get(r.address_norm) ?? byNorm.set(r.address_norm, []).get(r.address_norm)!).push(r as any);

  const leads: L[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('leads').select('id,address,city,state,verified_address,tags,program').eq('state', 'CO').range(from, from + 999);
    if (error) throw error; leads.push(...((data ?? []) as L[])); if ((data ?? []).length < 1000) break;
  }
  const hits: Array<{ lead: L; street: string; permit: string; jurisdiction: string }> = [];
  for (const l of leads) {
    // Rows still holding "street, city, state" in the address field use the verified address, as the campaign scripts do.
    const fix = (l.address ?? '').includes(',') && l.verified_address ? parse(l.verified_address) : null;
    const street = fix?.street ?? l.address ?? ''; const city = (fix?.city ?? l.city ?? '').toLowerCase();
    const cands = byNorm.get(normStreet(street)); if (!cands || !city) continue;
    const m = cands.find(c => c.address.toLowerCase().includes(city));
    if (m) hits.push({ lead: l, street, permit: m.permit_id, jurisdiction: m.jurisdiction });
  }
  console.log(`Colorado leads checked: ${leads.length} | active-license matches: ${hits.length} | already co_host: ${hits.filter(h => h.lead.program === 'co_host').length}`);
  hits.slice(0, 15).forEach(h => console.log(`  ${h.lead.id} | ${h.street}, ${h.lead.city} | ${h.jurisdiction} ${h.permit}`));

  // Texts still waiting to go out for these leads.
  const ids = hits.map(h => h.lead.id); const pending: Array<{ rowId: string; sid: string; leadId: string }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('outreach_history').select('id,lead_id,metadata').eq('metadata->>kind', 'estimate_outreach').in('lead_id', ids.slice(i, i + 100));
    for (const r of data ?? []) if ((r.metadata as any)?.twilio_status === 'scheduled' && (r.metadata as any)?.message_sid) pending.push({ rowId: r.id as string, sid: (r.metadata as any).message_sid, leadId: r.lead_id as string });
  }
  console.log(`scheduled texts that would be cancelled: ${pending.length}`);
  if (!GO) { console.log('DRY RUN: nothing changed. Re-run with --go.'); return; }

  let moved = 0, cancelled = 0; const now = new Date().toISOString();
  for (const h of hits.filter(x => x.lead.program !== 'co_host')) {
    const tags = [...new Set([...(h.lead.tags ?? []), 'program:co_host'])];
    const { error } = await db.from('leads').update({ program: 'co_host', cohost_service: 'undecided', existing_platforms: ['licensed short-term rental'], program_reason: `Active ${h.jurisdiction} STR license ${h.permit}`, program_set_at: now, tags }).eq('id', h.lead.id);
    if (!error) moved++;
  }
  for (const p of pending) { const r = await cancelScheduled(p.sid); if (r.ok) { cancelled++; await db.from('outreach_history').update({ status: 'failed', metadata: { kind: 'estimate_outreach', cancelled_reason: 'moved_to_co_host_program', message_sid: p.sid, twilio_status: 'canceled' } }).eq('id', p.rowId); } }
  console.log(`moved ${moved} leads to co_host | cancelled ${cancelled} scheduled texts`);
})().catch(e => { console.error(e); process.exit(1); });
