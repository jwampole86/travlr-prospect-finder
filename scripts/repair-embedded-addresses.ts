/**
 * Repairs leads whose address text still carries "Street City, ST 12345" while city/state hold a wrong value (Denver CO).
 * The authoritative string is leads.verified_address. When another lead already holds the corrected address, the unique
 * address index would reject the update, so that lead is flagged as a duplicate of it instead.
 *
 *   npx tsx scripts/repair-embedded-addresses.ts          (dry run)
 *   npx tsx scripts/repair-embedded-addresses.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parse } from './lib/verifiedAddress';

const GO = process.argv.includes('--go');
const fingerprint = (a: string, c: string, s: string) => `${a.replace(/\s+/g, ' ').trim().toLowerCase()}|${c.trim().toLowerCase()}|${s.trim().toLowerCase()}`;

(async () => {
  const db = getSupabaseAdmin();
  const leads: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('leads').select('id,address,city,state,zip,verified_address,tags,possible_duplicate').not('verified_address', 'is', null).range(from, from + 999);
    if (error) throw error;
    leads.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const textedIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outreach_history').select('lead_id').eq('channel', 'sms').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) textedIds.add(r.lead_id as string);
    if ((data ?? []).length < 1000) break;
  }
  // Leads that already have text history keep their record as it was sent.
  const broken = leads.filter(l => /,\s*[A-Za-z]{2}\s+\d{5}\s*$/.test(l.address ?? '') && !textedIds.has(l.id));
  console.log(`never-texted leads with an embedded city/state/ZIP in the address: ${broken.length}`);

  let fixed = 0; let duplicates = 0; const skipped: string[] = [];
  for (const l of broken) {
    const p = parse(String(l.verified_address));
    if (!p || !p.street || !p.city || !p.state) { skipped.push(`${l.id} cannot parse "${l.verified_address}"`); continue; }
    // The address text must be the same string, otherwise it is a different problem.
    if (l.address.replace(/\s+/g, ' ').trim() !== String(l.verified_address).replace(/\s+/g, ' ').trim()) { skipped.push(`${l.id} address differs from verified_address`); continue; }
    const fp = fingerprint(p.street, p.city, p.state);
    const { data: twin } = await db.from('leads').select('id').eq('address_fingerprint', fp).neq('id', l.id).limit(1).maybeSingle();
    if (twin) {
      duplicates++; console.log(`DUPLICATE ${l.id} -> ${twin.id}  ${p.street}, ${p.city}, ${p.state} ${p.zip}`);
      if (GO) {
        const tags = [...new Set([...(l.tags as string[] | null ?? []), `duplicate-of:${twin.id}`])];
        const { error } = await db.from('leads').update({ possible_duplicate: true, tags }).eq('id', l.id);
        if (error) throw error;
      }
      continue;
    }
    fixed++; console.log(`FIX       ${l.id}  "${l.address}" [${l.city} ${l.state}] -> ${p.street} | ${p.city} | ${p.state} | ${p.zip || l.zip}`);
    if (GO) {
      const { error } = await db.from('leads').update({ address: p.street, city: p.city, state: p.state, zip: p.zip || l.zip }).eq('id', l.id);
      if (error) { skipped.push(`${l.id} update failed: ${error.message}`); fixed--; }
    }
  }
  console.log(`\n${GO ? 'DONE' : 'DRY RUN'}: repaired ${fixed} | flagged duplicate ${duplicates} | skipped ${skipped.length}`);
  skipped.forEach(s => console.log('  skipped:', s));
})().catch(e => { console.error(e); process.exit(1); });
