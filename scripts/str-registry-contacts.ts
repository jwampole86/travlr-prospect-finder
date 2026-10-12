/**
 * Finds phone, email and mailing-address columns in the public STR registries that the loaders left out, and stores them on str_registry.contact.
 *
 *   npx tsx scripts/str-registry-contacts.ts          (report only)
 *   npx tsx scripts/str-registry-contacts.ts --go     (write contact onto matching rows)
 */
import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const GO = process.argv.includes('--go');
const PHONE = /phone|\btel\b|mobile|\bcell\b|contact_?num/i;
const EMAIL = /e-?mail/i;
const MAILING = /(owner|mail(ing)?)_?(addr|street)|owner_?address|mail_?addr/i;
const OTHER_ROLE = /manager|agent|emergency|local|responsible|operator|representative/i;

type Src = { kind: 'arcgis' | 'socrata'; org: string; name: string; url: string; state: string; fields: Record<string, string | null> };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36);
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

async function rows(s: Src): Promise<Array<Record<string, any>>> {
  if (s.kind === 'socrata') { const r = await fetch(`${s.url}?$limit=50000`, { signal: AbortSignal.timeout(90_000) }).catch(() => null); return (await r?.json().catch(() => [])) ?? []; }
  const out: Array<Record<string, any>> = [];
  for (let offset = 0; offset < 60_000; offset += 1000) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: '1000', f: 'json' });
    const d = await (await fetch(`${s.url}/query?${q}`, { signal: AbortSignal.timeout(90_000) }).catch(() => null))?.json().catch(() => null) as { features?: any[]; exceededTransferLimit?: boolean } | null;
    if (!d?.features) break;
    out.push(...d.features.map(f => f.attributes ?? {}));
    if (d.features.length < 1000 && !d.exceededTransferLimit) break;
  }
  return out;
}

const validPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 10 || (d.length === 11 && d.startsWith('1')) ? v : ''; };
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : '';

(async () => {
  const srcs = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'national-registries.json'), 'utf8')) as Src[];
  const db = getSupabaseAdmin(); let total = 0;
  for (const s of srcs) {
    const data = await rows(s); if (!data.length) continue;
    const keys = Object.keys(data[0]);
    const phoneKeys = keys.filter(k => PHONE.test(k)), emailKeys = keys.filter(k => EMAIL.test(k)), mailKeys = keys.filter(k => MAILING.test(k));
    if (!phoneKeys.length && !emailKeys.length && !mailKeys.length) continue;
    const juris = `${s.state.toLowerCase()}_${slug(s.org || s.name)}_${slug(s.name).slice(0, 14)}`; const f = s.fields; const seen = new Set<string>();
    const updates: Array<{ permit_id: string; contact: Record<string, string> }> = [];
    for (const [idx, a] of data.entries()) {
      if (!clean(a[f.address!]) || !/\d/.test(clean(a[f.address!]))) continue;
      let pid = clean(f.id ? a[f.id] : '') || `${idx}`; if (seen.has(pid)) pid = `${pid}#${idx}`; seen.add(pid);
      const c: Record<string, string> = {};
      for (const k of phoneKeys) { const v = validPhone(clean(a[k])); if (v) c[OTHER_ROLE.test(k) ? 'managerPhone' : 'phone'] ??= v; }
      for (const k of emailKeys) { const v = validEmail(clean(a[k])); if (v) c[OTHER_ROLE.test(k) ? 'managerEmail' : 'email'] ??= v; }
      for (const k of mailKeys) { const v = clean(a[k]); if (v.length > 8) c.ownerMailing ??= v; }
      if (Object.keys(c).length) updates.push({ permit_id: pid.slice(0, 120), contact: c });
    }
    console.log(`${s.state} ${juris}: columns [${[...phoneKeys, ...emailKeys, ...mailKeys].join(', ')}], ${updates.length} of ${data.length} rows carry contact data`);
    total += updates.length;
    if (!GO) continue;
    for (let i = 0; i < updates.length; i += 25) await Promise.all(updates.slice(i, i + 25).map(u => db.from('str_registry').update({ contact: u.contact }).eq('jurisdiction', juris).eq('permit_id', u.permit_id).is('contact', null)));
  }
  console.log(`\n${GO ? 'Wrote' : 'Would write'} contact data for ${total} registry rows.`);

  const { data: listings } = await db.from('str_listings').select('property_id,matched_owner').eq('match_status', 'unique').not('matched_owner', 'is', null);
  let synced = 0;
  for (const l of listings ?? []) {
    const o = l.matched_owner as Record<string, any>; if (!o.jurisdiction || !o.permit) continue;
    const { data: reg } = await db.from('str_registry').select('contact').eq('jurisdiction', o.jurisdiction).eq('permit_id', o.permit).maybeSingle();
    const c = reg?.contact as Record<string, any> | null; if (!c || JSON.stringify(c) === JSON.stringify(o.contact)) continue;
    synced++; if (GO) await db.from('str_listings').update({ matched_owner: { ...o, contact: c, mailing: o.mailing ?? c.ownerMailing ?? null } }).eq('property_id', l.property_id);
  }
  console.log(`${GO ? 'Updated' : 'Would update'} ${synced} already-matched listings with registry contact data.`);
})().catch(e => { console.error(e); process.exit(1); });
