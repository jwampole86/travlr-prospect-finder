import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Imports owner contacts requested in AirDNA (Property Manager > All Listings > Request info) into the co-host listings.
 * Works from a pasted table or a CSV export, so it does not depend on how AirDNA hands the data over. Each row is matched to a
 * listing by its Airbnb or Vrbo listing id or link, and the contact is stored in the same place as skip-trace results
 * (matched_owner.skipTrace), tagged with the source AIRDNA, so the rest of the co-host pipeline picks it up.
 */

export function parseDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = first.includes('\t') ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; continue; }
    if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pick = (headers: string[], tests: RegExp[]) => headers.findIndex(h => tests.some(t => t.test(h)));

export interface ContactRow { row: number; name: string; phones: string[]; emails: string[]; address: string | null; propertyIds: string[]; raw: Record<string, string> }

const e164 = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : null; };

export function readContacts(text: string): { contacts: ContactRow[]; columns: Record<string, string | null>; problem?: string } {
  const table = parseDelimited(text.trim());
  if (table.length < 2) return { contacts: [], columns: {}, problem: 'Paste the table with its header row, then the contacts.' };
  const headers = table[0].map(norm);
  const idx = {
    first: pick(headers, [/^(owner )?first name$/, /^first$/]), last: pick(headers, [/^(owner )?last name$/, /^last$/]),
    name: pick(headers, [/^(owner |contact |host )?(full )?name$/, /owner name/, /contact name/]),
    email: headers.flatMap((h, i) => (/e ?mail/.test(h) ? [i] : [])), phone: headers.flatMap((h, i) => (/phone|mobile|cell/.test(h) ? [i] : [])),
    address: pick(headers, [/^(property |listing |street )?address$/, /mailing address/, /^address/]),
    link: headers.flatMap((h, i) => (/airbnb|vrbo|url|link|listing/.test(h) ? [i] : [])), id: headers.flatMap((h, i) => (/(listing|property|airbnb|vrbo).*id|^id$|^listing$/.test(h) ? [i] : [])),
  };
  const columns = { name: idx.name >= 0 ? table[0][idx.name] : idx.first >= 0 ? `${table[0][idx.first]} + ${idx.last >= 0 ? table[0][idx.last] : ''}` : null, phones: idx.phone.map(i => table[0][i]).join(', ') || null, emails: idx.email.map(i => table[0][i]).join(', ') || null, address: idx.address >= 0 ? table[0][idx.address] : null, listing: [...new Set([...idx.link, ...idx.id])].map(i => table[0][i]).join(', ') || null };
  if (!idx.link.length && !idx.id.length) return { contacts: [], columns, problem: 'No listing id or link column was found, so contacts cannot be matched to listings. Include the Airbnb/Vrbo link or listing id.' };

  const contacts: ContactRow[] = table.slice(1).map((cells, i) => {
    const get = (k: number) => (k >= 0 ? (cells[k] ?? '').trim() : '');
    const name = get(idx.name) || [get(idx.first), get(idx.last)].filter(Boolean).join(' ');
    const ids = new Set<string>();
    for (const k of [...idx.link, ...idx.id]) {
      const v = (cells[k] ?? '').trim(); if (!v) continue;
      const airbnb = v.match(/airbnb\.[a-z.]+\/rooms\/(\d+)/i)?.[1]; const vrbo = v.match(/vrbo\.com\/(\d+)/i)?.[1];
      if (airbnb) ids.add(`abnb_${airbnb}`); if (vrbo) ids.add(`vrbo_${vrbo}`);
      if (/^(abnb|vrbo)_\d+$/i.test(v)) ids.add(v.toLowerCase());
      else if (/^\d{6,}$/.test(v)) { ids.add(`abnb_${v}`); ids.add(`vrbo_${v}`); }
    }
    const raw: Record<string, string> = {}; table[0].forEach((h, k) => { if (cells[k]) raw[h] = cells[k]; });
    return {
      row: i + 2, name, address: get(idx.address) || null, propertyIds: [...ids],
      phones: [...new Set(idx.phone.flatMap(k => (cells[k] ?? '').split(/[;/|]/)).map(e164).filter((x): x is string => !!x))],
      emails: [...new Set(idx.email.flatMap(k => (cells[k] ?? '').split(/[;,\s|]+/)).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))],
      raw,
    };
  }).filter(c => c.name || c.phones.length || c.emails.length);
  return { contacts, columns };
}

export interface ImportSummary { rows: number; matched: number; alreadyHadContact: number; updated: number; unmatched: Array<{ row: number; name: string }>; withPhone: number; withEmail: number; columns: Record<string, string | null>; applied: boolean; problem?: string }

export async function importAirdnaContacts(db: SupabaseClient, text: string, apply: boolean): Promise<ImportSummary> {
  const { contacts, columns, problem } = readContacts(text);
  const sum: ImportSummary = { rows: contacts.length, matched: 0, alreadyHadContact: 0, updated: 0, unmatched: [], withPhone: 0, withEmail: 0, columns, applied: apply, problem };
  if (problem) return sum;

  const wanted = [...new Set(contacts.flatMap(c => c.propertyIds))];
  const found = new Map<string, Record<string, any>>();
  for (let i = 0; i < wanted.length; i += 100) {
    const { data } = await db.from('str_listings').select('property_id,matched_owner,matched_address,match_status').in('property_id', wanted.slice(i, i + 100));
    for (const r of data ?? []) found.set(r.property_id as string, r);
  }
  const now = new Date().toISOString();
  for (const c of contacts) {
    const listing = c.propertyIds.map(id => found.get(id)).find(Boolean);
    if (!listing) { sum.unmatched.push({ row: c.row, name: c.name }); continue; }
    sum.matched++; if (c.phones.length) sum.withPhone++; if (c.emails.length) sum.withEmail++;
    const owner = (listing.matched_owner ?? {}) as Record<string, any>;
    if ((owner.skipTrace?.results ?? []).some((x: any) => x?.found?.source === 'AIRDNA')) { sum.alreadyHadContact++; continue; }
    if (!apply) continue;
    const hit = { name: c.name, personId: null, source: 'AIRDNA', addressConfirmed: !!c.address, phones: c.phones.map(p => ({ e164: p, type: 'unknown' })), emails: c.emails, importedAt: now };
    const results = [...(owner.skipTrace?.results ?? []).filter((x: any) => x?.found), { searched: c.name, found: hit }];
    const matched_owner = { ...owner, names: owner.names?.length ? owner.names : [c.name], airdna: { name: c.name, address: c.address, importedAt: now }, skipTrace: { ...(owner.skipTrace ?? {}), at: now, via: 'airdna', attempts: Number(owner.skipTrace?.attempts ?? 0) + 1, results } };
    const patch: Record<string, unknown> = { matched_owner };
    if (!listing.matched_address && c.address) { patch.matched_address = c.address; patch.match_status = 'unique'; patch.matched_at = now; }
    const { error } = await db.from('str_listings').update(patch).eq('property_id', listing.property_id);
    if (!error) sum.updated++;
  }
  sum.unmatched = sum.unmatched.slice(0, 20);
  return sum;
}
