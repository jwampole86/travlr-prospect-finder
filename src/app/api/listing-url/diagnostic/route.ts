import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

// ─── GET /api/listing-url/diagnostic ─────────────────────────────────────────
// Step 1 of the diagnostic-first listing URL fix:
// For each source, sample up to 5 leads and report what's actually stored
// in listing_url — categorized as: correct_detail, search_page, wrong_property,
// empty_null, or fallback_search.
// This proves whether the bug is in the data or in the frontend reading the field.

const SOURCES = [
  'Zillow', 'Trulia', 'Realtor.com', 'Apartments.com', 'HotPads',
  'Craigslist', 'Rent.com', 'PadMapper', 'Apartment List', 'Dwellsy',
];

// Per-source: does the URL look like a detail page or a search/results page?
const DETAIL_PATTERNS: Record<string, RegExp> = {
  'Zillow': /zillow\.com\/homes\/[^/]+-[A-Z]{2}-\d+_rb\//,
  'Trulia': /trulia\.com\/p\/[a-z]{2}\/[a-z-]+\/[a-z0-9-]+--\d+\//,
  'Realtor.com': /realtor\.com\/realestateandhomes-detail\//,
  'Apartments.com': /apartments\.com\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+\//,
  'HotPads': /hotpads\.com\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+/,
  'Craigslist': /craigslist\.org\/[a-z]+\/\d+\.html/,
  'Rent.com': /rent\.com\/[a-z]+-[a-z-]+-apartments\/[a-z0-9-]+-\d+\//,
  'PadMapper': /padmapper\.com\/apartments\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+/,
  'Apartment List': /apartmentlist\.com\/[a-z]{2}\/[a-z-]+\/[a-z0-9-]+-\d+/,
  'Dwellsy': /dwellsy\.com\/listing\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+\//,
};

const SEARCH_PATTERNS: Record<string, RegExp[]> = {
  'Zillow': [/zillow\.com\/homes\/for_rent/, /zillow\.com\/search/, /zillow\.com\/homes\?/],
  'Trulia': [/trulia\.com\/for_rent/, /trulia\.com\/search/, /trulia\.com\/real_estate/],
  'Realtor.com': [/realtor\.com\/realestateandhomes-search/, /realtor\.com\/apartments/],
  'Apartments.com': [/apartments\.com\/[a-z-]+-[a-z]{2}\/$/, /apartments\.com\/search/],
  'HotPads': [/hotpads\.com\/search/, /hotpads\.com\/[a-z-]+-[a-z]{2}\/?$/],
  'Craigslist': [/craigslist\.org\/search\/apa/, /craigslist\.org\/search\?/],
  'Rent.com': [/rent\.com\/[a-z-]+-apartments\/?$/, /rent\.com\/search/],
  'PadMapper': [/padmapper\.com\/apartments\/[a-z-]+-[a-z]{2}\/?$/, /padmapper\.com\/search/],
  'Apartment List': [/apartmentlist\.com\/[a-z]{2}\/[a-z-]+\/?$/, /apartmentlist\.com\/search/],
  'Dwellsy': [/dwellsy\.com\/search/, /dwellsy\.com\/rentals/],
};

// Deep-linked fallback search URL per source (address-specific search, not broad zone)
function buildFallbackSearchUrl(source: string, address: string, city: string, state: string): string {
  const encodedAddress = encodeURIComponent(`${address}, ${city}, ${state}`);
  const encodedCity = encodeURIComponent(`${city}, ${state}`);

  switch (source) {
    case 'Zillow':
      return `https://www.zillow.com/homes/${encodeURIComponent(address + ' ' + city + ' ' + state)}_rb/`;
    case 'Trulia':
      return `https://www.trulia.com/real_estate/${encodeURIComponent(city + '-' + state)}/`;
    case 'Realtor.com':
      return `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(city + '_' + state)}/?keywords=${encodeURIComponent(address)}`;
    case 'Apartments.com':
      return `https://www.apartments.com/${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}/?bb=${encodedAddress}`;
    case 'HotPads':
      return `https://hotpads.com/${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}/?q=${encodedAddress}`;
    case 'Craigslist':
      return `https://${city.toLowerCase().replace(/\s+/g, '')}.craigslist.org/search/apa?query=${encodeURIComponent(address)}`;
    case 'Rent.com':
      return `https://www.rent.com/${state.toLowerCase()}/${city.toLowerCase().replace(/\s+/g, '-')}-apartments/?keywords=${encodeURIComponent(address)}`;
    case 'PadMapper':
      return `https://www.padmapper.com/apartments/${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}/?search=${encodedAddress}`;
    case 'Apartment List':
      return `https://www.apartmentlist.com/${state.toLowerCase()}/${city.toLowerCase().replace(/\s+/g, '-')}/?search=${encodedAddress}`;
    case 'Dwellsy':
      return `https://dwellsy.com/search/?q=${encodedAddress}`;
    default:
      return '';
  }
}

function classifyUrl(url: string | null | undefined, source: string): 'correct_detail' | 'search_page' | 'empty_null' | 'synthetic_placeholder' | 'unknown_pattern' {
  if (!url || url.trim() === '') return 'empty_null';
  if (url.includes('synthetic.travlr') || url.includes('example.com')) return 'synthetic_placeholder';

  const detailPattern = DETAIL_PATTERNS[source];
  if (detailPattern && detailPattern.test(url)) return 'correct_detail';

  const searchPatterns = SEARCH_PATTERNS[source] || [];
  if (searchPatterns.some(p => p.test(url))) return 'search_page';

  return 'unknown_pattern';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const report: Record<string, any> = {};
    let totalSampled = 0;
    let totalCorrect = 0;
    let totalBroken = 0;

    for (const source of SOURCES) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, listing_url, source')
        .eq('source', source)
        .limit(5);

      const samples = (leads ?? []).map((lead: any) => {
        const classification = classifyUrl(lead.listing_url, source);
        const isCorrect = classification === 'correct_detail';
        if (isCorrect) totalCorrect++; else totalBroken++;
        totalSampled++;

        return {
          lead_id: lead.id,
          address: lead.address,
          stored_url: lead.listing_url ?? null,
          classification,
          is_correct: isCorrect,
          // If broken, provide the fallback deep-linked search URL
          fallback_url: !isCorrect
            ? buildFallbackSearchUrl(source, lead.address, lead.city ?? '', lead.state ?? '')
            : null,
        };
      });

      // Per-source determination
      const correctCount = samples.filter(s => s.is_correct).length;
      const brokenCount = samples.length - correctCount;
      let scraper_determination: string;

      if (samples.length === 0) {
        scraper_determination = 'no_leads_found';
      } else if (correctCount === samples.length) {
        scraper_determination = 'raw_html_extractable_working';
      } else if (brokenCount === samples.length) {
        // All broken — likely JS-rendered or scraper issue
        const allSynthetic = samples.every(s => s.classification === 'synthetic_placeholder');
        const allSearch = samples.every(s => s.classification === 'search_page');
        if (allSynthetic) {
          scraper_determination = 'synthetic_urls_stored_never_scraped';
        } else if (allSearch) {
          scraper_determination = 'search_page_urls_stored_likely_js_rendered';
        } else {
          scraper_determination = 'mixed_broken_investigate_scraper';
        }
      } else {
        scraper_determination = 'partial_working_investigate_extraction_logic';
      }

      // Special note for Craigslist (known anti-scraping)
      const note = source === 'Craigslist' ?'Craigslist has aggressive anti-scraping. Use fallback deep-linked search for all Craigslist leads.' : scraper_determination.includes('js_rendered')
        ? 'Site likely renders listing URLs via client-side JS. Headless browser (Playwright/Puppeteer) or official API required for true permalinks.' :'';

      report[source] = {
        samples_checked: samples.length,
        correct: correctCount,
        broken: brokenCount,
        scraper_determination,
        note,
        samples,
      };
    }

    // Overall summary
    const summary = {
      total_sampled: totalSampled,
      total_correct: totalCorrect,
      total_broken: totalBroken,
      correct_pct: totalSampled > 0 ? Math.round((totalCorrect / totalSampled) * 100) : 0,
      diagnosis: totalCorrect === totalSampled
        ? 'All sampled URLs appear correct — bug may be frontend reading wrong field'
        : totalBroken === totalSampled
        ? 'All sampled URLs are broken — scraper/extraction issue confirmed' :'Mixed results — per-source investigation required',
      recommendation: totalCorrect === totalSampled
        ? 'Check frontend: confirm listing_url field is being read (not a different field) in the lead detail view button'
        : 'Apply per-source fix: raw-HTML-extractable sources → fix extraction logic; JS-rendered sources → use headless browser or fallback deep-linked search',
    };

    return NextResponse.json({ summary, by_source: report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/listing-url/diagnostic — Apply fallback deep-linked search URLs ──
// For sources where a true permalink isn't achievable, apply the fallback
// address-specific search URL and label it clearly in the UI.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sources, dryRun = true } = body;

    const supabase = createClient();
    const results: any[] = [];

    const targetSources = sources ?? SOURCES;

    for (const source of targetSources) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, listing_url, source')
        .eq('source', source);

      for (const lead of (leads ?? []) as any[]) {
        const classification = classifyUrl(lead.listing_url, source);
        if (classification === 'correct_detail') continue; // Already correct

        const fallbackUrl = buildFallbackSearchUrl(source, lead.address, lead.city ?? '', lead.state ?? '');
        if (!fallbackUrl) continue;

        if (!dryRun) {
          await supabase
            .from('leads')
            .update({
              listing_url: fallbackUrl,
              listing_url_type: 'fallback_address_search', // label for UI
              updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id);
        }

        results.push({
          lead_id: lead.id,
          address: lead.address,
          source,
          original_url: lead.listing_url,
          fallback_url: fallbackUrl,
          action: dryRun ? 'would_apply_fallback' : 'applied_fallback',
        });
      }
    }

    return NextResponse.json({
      message: `Fallback URL application ${dryRun ? '(dry run) ' : ''}complete`,
      total_updated: results.length,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
