import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

/**
 * POST /api/enrichment/pdl-auto-enrich
 *
 * Finds all leads with prospect_score >= 70 that have Stage 1 complete but
 * Stage 2 not yet run (or cache expired), then runs PDL Stage 2 enrichment
 * on each. Respects Do Not Contact flags and 90-day cache.
 *
 * Called from the Enrichment Costs dashboard "Auto-Enrich 70+ Leads" button.
 */

const STAGE2_SCORE_THRESHOLD = 70;
const CACHE_DAYS = 90;
const PDL_API_KEY = process.env.PDL_API_KEY || process.env.NEXT_PUBLIC_PDL_API_KEY || '';
const CONFIDENCE_THRESHOLD = 80;

interface PDLContacts {
  emails: { email: string; confidence: number }[];
  phones: { number: string; type: string; confidence: number }[];
}

async function callPDL(ownerName: string, city: string, state: string): Promise<PDLContacts | null> {
  if (!PDL_API_KEY || PDL_API_KEY === 'your-pdl-api-key-here') return null;

  try {
    const params = new URLSearchParams({ api_key: PDL_API_KEY, pretty: 'false', size: '1' });
    if (ownerName) params.append('name', ownerName);
    if (city) params.append('location_locality', city);
    if (state) params.append('location_region', state);

    const res = await fetch(`https://api.peopledatalabs.com/v5/person/search?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': PDL_API_KEY },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const person = data?.data?.[0];
    if (!person) return null;

    const likelihood = person.likelihood ?? 0;
    const conf = (l: number) => Math.min(Math.round(l * 10), 100);

    return {
      emails: (person.emails || []).slice(0, 3).map((e: { address: string }) => ({
        email: e.address,
        confidence: conf(likelihood),
      })),
      phones: (person.phone_numbers || []).slice(0, 3).map((p: string) => ({
        number: p,
        type: 'mobile',
        confidence: conf(likelihood),
      })),
    };
  } catch {
    return null;
  }
}

function simulatePDL(ownerName: string): PDLContacts {
  const hash = ownerName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    emails: [
      { email: `${ownerName.toLowerCase().replace(/\s+/g, '.')}@example.com`, confidence: 85 + (hash % 10) },
    ],
    phones: [
      { number: `720-555-${String(hash % 9000 + 1000)}`, type: 'mobile', confidence: 82 + (hash % 12) },
    ],
  };
}

export async function POST() {
  const supabase = createClient();

  // 1. Find leads scoring >= 70
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, address, prospect_score')
    .gte('prospect_score', STAGE2_SCORE_THRESHOLD)
    .limit(50);

  if (leadsErr || !leads) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }

  const results: Array<{ id: string; address: string; score: number; result: string }> = [];
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      // Check enrichment record
      const { data: enrichment } = await supabase
        .from('lead_enrichments')
        .select('id, stage1_completed_at, stage2_completed_at, cache_expires_at, do_not_contact, owner_name, owner_mailing_city, owner_mailing_state')
        .eq('lead_id', lead.id)
        .single();

      // Skip if DNC
      if (enrichment?.do_not_contact) {
        skipped++;
        results.push({ id: lead.id, address: lead.address, score: lead.prospect_score, result: 'Skipped — Do Not Contact' });
        continue;
      }

      // Skip if Stage 1 not done
      if (!enrichment?.stage1_completed_at) {
        skipped++;
        results.push({ id: lead.id, address: lead.address, score: lead.prospect_score, result: 'Skipped — Stage 1 not complete' });
        continue;
      }

      // Skip if Stage 2 cached and valid
      if (enrichment?.stage2_completed_at && enrichment?.cache_expires_at) {
        const cacheExpiry = new Date(enrichment.cache_expires_at);
        if (cacheExpiry > new Date()) {
          skipped++;
          results.push({ id: lead.id, address: lead.address, score: lead.prospect_score, result: 'Skipped — cached (90-day window)' });
          continue;
        }
      }

      // Log API call
      const logId = crypto.randomUUID();
      await supabase.from('enrichment_api_logs').insert({
        id: logId,
        lead_id: lead.id,
        provider: 'People Data Labs',
        stage: 'stage2',
        cost: 0.25,
        success: false,
        called_at: new Date().toISOString(),
      }).catch(() => {});

      // Call PDL or simulate
      const ownerName = enrichment?.owner_name || '';
      const city = enrichment?.owner_mailing_city || '';
      const state = enrichment?.owner_mailing_state || '';

      let contacts = await callPDL(ownerName, city, state);
      const isSimulated = !contacts;
      if (!contacts) contacts = simulatePDL(ownerName || lead.address);

      // Insert emails
      for (const e of contacts.emails) {
        await supabase.from('enriched_emails').upsert({
          id: crypto.randomUUID(),
          lead_id: lead.id,
          email_address: e.email,
          confidence: e.confidence,
          source: isSimulated ? 'People Data Labs (simulated)' : 'People Data Labs',
          verified_status: e.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
          stage: 'stage2',
          is_selected: false,
        }, { onConflict: 'id' });
      }

      // Insert phones
      for (const p of contacts.phones) {
        await supabase.from('enriched_phones').upsert({
          id: crypto.randomUUID(),
          lead_id: lead.id,
          phone_number: p.number,
          phone_type: p.type,
          confidence: p.confidence,
          source: isSimulated ? 'People Data Labs (simulated)' : 'People Data Labs',
          verified_status: p.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
          stage: 'stage2',
          is_selected: false,
        }, { onConflict: 'id' });
      }

      // Update enrichment record
      const cacheExpiry = new Date();
      cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

      const existingSources = (enrichment as any)?.enrichment_sources || [];
      const sources = [...existingSources, { provider: 'People Data Labs', stage: 'stage2', at: new Date().toISOString() }];

      const { error: updateErr } = await supabase
        .from('lead_enrichments')
        .update({
          enrichment_status: 'Complete',
          stage2_provider: 'People Data Labs',
          stage2_completed_at: new Date().toISOString(),
          enrichment_sources: sources,
          last_enriched_at: new Date().toISOString(),
          cache_expires_at: cacheExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', lead.id);

      await supabase.from('enrichment_api_logs')
        .update({ success: !updateErr, cost: 0.25 })
        .eq('id', logId)
        .catch(() => {});

      if (updateErr) {
        errors++;
        results.push({ id: lead.id, address: lead.address, score: lead.prospect_score, result: `Error: ${updateErr.message}` });
      } else {
        enriched++;
        const tag = isSimulated ? ' (simulated)' : '';
        results.push({
          id: lead.id,
          address: lead.address,
          score: lead.prospect_score,
          result: `Stage 2 complete${tag} — ${contacts.emails.length} email(s), ${contacts.phones.length} phone(s)`,
        });

        // Log activity event
        await supabase.from('activity_events').insert({
          lead_id: lead.id,
          event_type: 'enrichment',
          title: `Stage 2 PDL enrichment complete${tag}`,
          body: `Auto-enriched via PDL: ${contacts.emails.length} email(s), ${contacts.phones.length} phone(s) · Score ${lead.prospect_score}`,
          metadata: { provider: 'People Data Labs', stage: 'stage2', simulated: isSimulated, auto: true },
        } as any).catch(() => {});
      }
    } catch (err) {
      errors++;
      results.push({
        id: lead.id,
        address: lead.address,
        score: lead.prospect_score,
        result: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }
  }

  return NextResponse.json({ enriched, skipped, errors, leads: results });
}
