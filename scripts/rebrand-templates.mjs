// Renames TRAVLR to NAVEO Stays inside the saved email and message templates in the database (the code's own defaults were changed already).
//   node scripts/rebrand-templates.mjs            dry run: counts and a sample, changes nothing
//   node scripts/rebrand-templates.mjs --apply    saves a backup of every changed row to scripts/.template-backup-<time>.json, then updates
// Same rules as the code: staytravlr.com -> staynaveo.com, "TRAVLR Vacation Homes" and any other uppercase TRAVLR -> NAVEO Stays.
import { readFileSync, writeFileSync } from 'node:fs';
const APPLY = process.argv.includes('--apply');
const env = {}; for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const base = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/';
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' };
const rename = (s) => s.replaceAll('staytravlr.com', 'staynaveo.com').replaceAll('TRAVLR Vacation Homes', 'NAVEO Stays').replaceAll("TRAVLR's", "NAVEO Stays'").replace(/\bTRAVLR\b/g, 'NAVEO Stays');
const TARGETS = [['email_templates', ['name', 'subject', 'body']], ['message_templates', ['name', 'subject', 'body', 'content']]];
const backup = []; let changedRows = 0; const left = [];
for (const [table, cols] of TARGETS) {
  const r = await fetch(base + `${table}?select=*&limit=2000`, { headers: H });
  if (!r.ok) { console.log(table, 'unreadable', r.status); continue; }
  for (const row of await r.json()) {
    const patch = {};
    for (const c of cols) if (typeof row[c] === 'string') { const n = rename(row[c]); if (n !== row[c]) patch[c] = n; }
    for (const c of cols) if (typeof (patch[c] ?? row[c]) === 'string' && /travlr/i.test(patch[c] ?? row[c])) left.push(`${table}.${c}: ${((patch[c] ?? row[c]).match(/.{0,30}travlr.{0,30}/i) || [''])[0].replace(/\s+/g, ' ')}`);
    if (!Object.keys(patch).length) continue;
    changedRows++;
    if (changedRows <= 2) console.log(`sample ${table} "${row.name}":`, Object.entries(patch).map(([c, v]) => `${c}: ${(rename(row[c]).match(/.{0,40}NAVEO Stays.{0,40}/) || [''])[0].replace(/\s+/g, ' ')}`).join(' | '));
    backup.push({ table, id: row.id, original: Object.fromEntries(Object.keys(patch).map((c) => [c, row[c]])) });
    if (APPLY) { const u = await fetch(base + `${table}?id=eq.${row.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(patch) }); if (!u.ok) throw new Error(`${table} ${row.id}: ${u.status} ${await u.text()}`); }
  }
}
if (APPLY && backup.length) { const f = new URL(`./.template-backup-${Date.now()}.json`, import.meta.url); writeFileSync(f, JSON.stringify(backup), { mode: 0o600 }); console.log('backup written to', f.pathname); }
console.log(APPLY ? 'UPDATED' : 'DRY RUN', 'rows changed:', changedRows);
console.log('still mention travlr in some form (links, logos, lower-case ids):', left.length, [...new Set(left)].slice(0, 6));
