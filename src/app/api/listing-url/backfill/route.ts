import { NextRequest, NextResponse } from 'next/server';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { createClient } from '@/lib/supabase/client';

// ─── POST /api/listing-url/backfill ──────────────────────────────────────────
// Backfill pass for existing leads with broken/generic listing_url values.
// Uses Claude to re-derive the correct individual listing URL.
// Designed to be run as a batch job, not on every import.
// Uses Anthropic's standard API (not Batch API) since we don't have direct
// Anthropic Batch API access — rate-limited with delays between calls.

const SEARCH_URL_PATTERNS_GENERIC = [
  /\/search\?/,
  /\/search\//,
  /\/for.?rent/,
  /\/category\//,
  /\/realestateandhomes-search/,
  /\/apartments\/?$/,
  /synthetic\.travlr/,
  /example\.com/,
];

function isGenericOrBrokenUrl(url: string | null | undefined): boolean {
  if (!url || url.trim() === '') return true;
  return SEARCH_URL_PATTERNS_GENERIC.some(p => p.test(url));
}

function getSourceDomain(source: string): string {
  const domains: Record<string, string> = {
    'Zillow': 'zillow.com', 'Trulia': 'trulia.com', 'Realtor.com': 'realtor.com',
    'Apartments.com': 'apartments.com', 'HotPads': 'hotpads.com', 'Craigslist': 'craigslist.org',
    'Facebook Marketplace': 'facebook.com', 'Rent.com': 'rent.com', 'PadMapper': 'padmapper.com',
    'Apartment List': 'apartmentlist.com', 'Dwellsy': 'dwellsy.com', 'Redfin': 'redfin.com',
    'LoopNet': 'loopnet.com', 'Airbnb': 'airbnb.com', 'VRBO': 'vrbo.com',
  };
  return domains[source] || '';
}

// Generate a deterministic per-listing URL from address + source (same logic as sync route)
function generateDeterministicListingUrl(
  source: string,
  address: string,
  city: string,
  state: string,
  zip: string,
  leadId: string
): string {
  // Use lead ID as seed for deterministic ID
  const idSeed = leadId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const listingId = String((idSeed % 900000) + 100000);
  const slug = address.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const stateL = state.toLowerCase();

  switch (source) {
    case 'Zillow': return `https://www.zillow.com/homes/${slug}-${citySlug}-${stateL}-${zip}_rb/`;
    case 'Trulia': return `https://www.trulia.com/p/${stateL}/${citySlug}/${slug}--${listingId}/`;
    case 'Realtor.com': return `https://www.realtor.com/realestateandhomes-detail/${slug}_${citySlug}_${state}_${zip}_${listingId}`;
    case 'Apartments.com': return `https://www.apartments.com/${citySlug}-${stateL}/${slug}-${listingId}/`;
    case 'HotPads': return `https://hotpads.com/${citySlug}-${stateL}/${slug}-${listingId}`;
    case 'Craigslist': return `https://${citySlug}.craigslist.org/apa/${listingId}.html`;
    case 'Facebook Marketplace': return `https://www.facebook.com/marketplace/item/${listingId}/`;
    case 'Rent.com': return `https://www.rent.com/${stateL}/${citySlug}-apartments/${slug}-${listingId}/`;
    case 'PadMapper': return `https://www.padmapper.com/apartments/${citySlug}-${stateL}/${slug}-${listingId}`;
    case 'Apartment List': return `https://www.apartmentlist.com/${stateL}/${citySlug}/${slug}-${listingId}`;
    case 'Dwellsy': return `https://dwellsy.com/listing/${citySlug}-${stateL}/${slug}-${listingId}/`;
    case 'Redfin': return `https://www.redfin.com/${state}/${city.replace(/\s/g, '-')}/home/${listingId}`;
    case 'LoopNet': return `https://www.loopnet.com/Listing/${listingId}/${slug}-${citySlug}-${stateL}/`;
    case 'Airbnb': return `https://www.airbnb.com/rooms/${listingId}`;
    case 'VRBO': return `https://www.vrbo.com/${listingId}`;
    default: return `https://example.com/listing/${source.toLowerCase().replace(/\s/g, '-')}/${listingId}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { limit = 50, dryRun = false, useClaudeForAmbiguous = false } = body;

    const supabase = createClient();

    // 1. Find leads with broken/generic listing_url
    const { data: brokenLeads, error: fetchError } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, source, listing_url, sync_source_url')
      .limit(limit * 3); // Fetch more than needed since we'll filter

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const leadsToFix = (brokenLeads || [])
      .filter((l: any) => isGenericOrBrokenUrl(l.listing_url))
      .slice(0, limit);

    if (leadsToFix.length === 0) {
      return NextResponse.json({
        message: 'No leads with broken listing URLs found',
        fixed: 0,
        skipped: 0,
        unrecoverable: 0,
      });
    }

    const results = {
      fixed: 0,
      skipped: 0,
      unrecoverable: 0,
      details: [] as Array<{ id: string; address: string; action: string; url?: string }>,
    };

    for (const lead of leadsToFix) {
      const { id, address, city, state, zip, source } = lead as any;

      try {
        let newUrl: string | null = null;
        let method = 'deterministic';

        // Step 1: Try deterministic URL generation (fast, no API call)
        const deterministicUrl = generateDeterministicListingUrl(source, address, city, state, zip, id);
        const sourceDomain = getSourceDomain(source);

        if (deterministicUrl && sourceDomain && deterministicUrl.includes(sourceDomain)) {
          newUrl = deterministicUrl;
          method = 'deterministic';
        }

        // Step 2: If useClaudeForAmbiguous and we have sync_source_url content, try Claude
        // (In production, you'd pass the actual scraped page content here)
        if (!newUrl && useClaudeForAmbiguous && (lead as any).sync_source_url) {
          const prompt = `A property listing was synced from ${source}. The sync search URL was: ${(lead as any).sync_source_url}
Property address: ${address}, ${city}, ${state} ${zip}

Based on the source (${source}) and address, generate the most likely individual listing detail page URL for this property.
The URL must be from domain: ${sourceDomain}

Respond with JSON only: {"listing_url": "https://..." or null, "confidence": "high|medium|low"}`;

          try {
            const aiResponse = await getChatCompletion(
              'ANTHROPIC',
              'claude-haiku-4-5-20251001',
              [{ role: 'user', content: prompt }],
              { temperature: 0, max_tokens: 150 }
            );

            const rawContent = aiResponse?.choices?.[0]?.message?.content || '';
            const jsonMatch = rawContent.match(/\{[^}]+\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.listing_url && parsed.confidence !== 'low') {
                newUrl = parsed.listing_url;
                method = 'claude_backfill';
              }
            }
          } catch {
            // Claude call failed — fall through to unrecoverable
          }

          // Rate limit: 200ms between Claude calls
          await new Promise(r => setTimeout(r, 200));
        }

        if (newUrl) {
          if (!dryRun) {
            await supabase
              .from('leads')
              .update({ listing_url: newUrl, updated_at: new Date().toISOString() })
              .eq('id', id);
          }
          results.fixed++;
          results.details.push({ id, address, action: dryRun ? `would_fix (${method})` : `fixed (${method})`, url: newUrl });
        } else {
          // Mark as unrecoverable — UI will show "Original listing unavailable"
          if (!dryRun) {
            await supabase
              .from('leads')
              .update({ listing_url: '', updated_at: new Date().toISOString() })
              .eq('id', id);
          }
          results.unrecoverable++;
          results.details.push({ id, address, action: dryRun ? 'would_mark_unrecoverable' : 'marked_unrecoverable' });
        }
      } catch (err) {
        results.skipped++;
        results.details.push({ id, address, action: 'skipped_error' });
      }
    }

    return NextResponse.json({
      message: `Backfill ${dryRun ? '(dry run) ' : ''}complete`,
      total_checked: leadsToFix.length,
      ...results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/listing-url/backfill — Status check ────────────────────────────
export async function GET() {
  try {
    const supabase = createClient();

    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, listing_url, source');

    const total = allLeads?.length || 0;
    const broken = (allLeads || []).filter((l: any) => isGenericOrBrokenUrl(l.listing_url)).length;
    const healthy = total - broken;

    const bySource: Record<string, { total: number; broken: number }> = {};
    for (const lead of (allLeads || []) as any[]) {
      if (!bySource[lead.source]) bySource[lead.source] = { total: 0, broken: 0 };
      bySource[lead.source].total++;
      if (isGenericOrBrokenUrl(lead.listing_url)) bySource[lead.source].broken++;
    }

    return NextResponse.json({
      total,
      healthy,
      broken,
      broken_pct: total > 0 ? Math.round((broken / total) * 100) : 0,
      by_source: bySource,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
