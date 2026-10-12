/**
 * Points every campaign short link at the full address (including ZIP) so the estimate page shows the same range as the text.
 * The texts are untouched: they only contain the short code, and the code's destination lives in link_clicks.original_url.
 *
 *   npx tsx scripts/fix-link-destinations.ts            (dry run)
 *   npx tsx scripts/fix-link-destinations.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { LEAD_COLUMNS, longEstimateUrl, type OutreachLead } from '@/lib/services/estimateOutreachSms';
import { parse } from './lib/verifiedAddress';

const GO = process.argv.includes('--go');
const SITE = 'https://prospect.staytrvlr.com';

(async () => {
  const db = getSupabaseAdmin();
  const { data: hist, error } = await db.from('outreach_history').select('lead_id,metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').limit(5000);
  if (error) throw error;
  const ids = [...new Set((hist ?? []).map(h => h.lead_id as string))];
  const leads: Array<OutreachLead & { verified_address: string | null }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('leads').select(`${LEAD_COLUMNS},verified_address`).in('id', ids.slice(i, i + 100));
    leads.push(...((data ?? []) as typeof leads));
  }
  let same = 0, changed = 0, missing = 0; const samples: string[] = [];
  for (const base of leads) {
    // Same view of the lead the texts were written from: rows that still hold the placeholder city use the verified address.
    const fix = (base.address ?? '').includes(',') && base.verified_address ? parse(base.verified_address) : null;
    const lead = fix ? { ...base, address: fix.street, city: fix.city, state: fix.state, zip: fix.zip || base.zip } : base;
    const url = longEstimateUrl(lead, SITE);
    const { data: links } = await db.from('link_clicks').select('id,original_url').eq('lead_id', base.id).eq('sequence_name', 'estimate_outreach');
    if (!links?.length) { missing++; continue; }
    for (const l of links) {
      if (l.original_url === url) { same++; continue; }
      changed++; if (samples.length < 4) samples.push(`${l.original_url}\n   -> ${url}`);
      if (GO) await db.from('link_clicks').update({ original_url: url }).eq('id', l.id);
    }
  }
  console.log(`leads ${leads.length} | links already correct ${same} | to update ${changed} | no link ${missing}`);
  samples.forEach(s => console.log(s));
  if (!GO) console.log('\nDRY RUN: nothing changed. Re-run with --go.');
})().catch(e => { console.error(e); process.exit(1); });
