#!/usr/bin/env node
// Read-only smoke test of the NAVEO integration endpoints.
//   BASE_URL=https://avyropro.ai NAVEO_INTEGRATION_KEY=... node scripts/naveo-smoke.mjs
// It checks that each endpoint refuses a missing or wrong key and answers 200 with the real key. It never writes.
const base = process.env.BASE_URL || 'https://avyropro.ai';
const key = process.env.NAVEO_INTEGRATION_KEY;
const paths = ['listings', 'stays/listings', 'stays/staging', 'owner/submissions'];
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };
for (const p of paths) {
  const url = `${base}/api/integration/naveo/${p}`;
  check((await fetch(url)).status === 401, `${p}: no key is refused`);
  check((await fetch(url, { headers: { 'x-naveo-key': 'wrong'.repeat(8) } })).status === 401, `${p}: wrong key is refused`);
  if (key) {
    const headers = { 'x-naveo-key': key, ...(p === 'owner/submissions' ? { 'x-owner-email': 'smoke-test@example.invalid' } : {}) };
    const res = await fetch(url, { headers });
    check(res.status === 200, `${p}: real key answers 200 (got ${res.status})`);
  }
}
if (!key) console.log('SKIP  authenticated checks: set NAVEO_INTEGRATION_KEY to run them');
process.exit(failed ? 1 : 0);
