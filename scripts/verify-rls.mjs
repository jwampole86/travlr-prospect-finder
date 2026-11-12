#!/usr/bin/env node
// Fails (exit 1) when a signed-out caller or a signed-in account with no role can read rows from any public table other than the allowed reference data.
// Read-only: the SQL runs inside a transaction that is rolled back. Needs the Supabase CLI linked to the project.
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set(['regulation_rules', 'state_compliance_rules']);
const out = execFileSync('node_modules/.bin/supabase', ['db', 'query', '--linked', '-o', 'json', '-f', 'scripts/verify-rls.sql'], { encoding: 'utf8' });
const rows = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).rows ?? [];
const leaks = rows.filter((r) => !ALLOWED.has(r.tbl));
if (leaks.length) {
  console.error('Rows visible without a granted role:');
  for (const r of leaks) console.error(`  ${r.tbl} (${r.caller}): ${r.visible}`);
  process.exit(1);
}
console.log('OK: no public table is readable by a signed-out caller or an account with no role (except reference data).');
