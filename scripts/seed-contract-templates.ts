// Upserts the drafted contract templates. A changed body becomes a new version; the newest version becomes the active one
// and starts as "pending legal review". Run: npx tsx scripts/seed-contract-templates.ts
import { loadEnvConfig } from '@next/env';
import { createHash } from 'crypto';
loadEnvConfig(process.cwd());

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { CONTRACT_TEMPLATES } = await import('../src/lib/contracts/templates');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  for (const t of CONTRACT_TEMPLATES) {
    const hash = createHash('sha256').update(JSON.stringify({ b: t.bodyHtml, f: t.fields, s: t.signerLabel, m: t.maxSigners, title: t.title })).digest('hex');
    const { data: rows } = await db.from('contract_templates').select('id, version, body_hash, status').eq('kind', t.kind).order('version', { ascending: false });
    const latest = rows?.[0];
    if (latest?.body_hash === hash) { console.log(`${t.kind}: v${latest.version} unchanged`); continue; }

    const version = (latest?.version ?? 0) + 1;
    await db.from('contract_templates').update({ status: 'retired' }).eq('kind', t.kind).eq('status', 'active');
    const { error } = await db.from('contract_templates').insert({
      kind: t.kind, version, title: t.title, description: t.description, signer_label: t.signerLabel, max_signers: t.maxSigners,
      fields: t.fields, body_html: t.bodyHtml, body_hash: hash, status: 'active', legal_review: 'pending',
    });
    console.log(error ? `${t.kind}: FAILED ${error.message}` : `${t.kind}: v${version} stored (active, pending legal review)`);
  }
})();
