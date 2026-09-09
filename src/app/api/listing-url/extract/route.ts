import { NextRequest, NextResponse } from 'next/server';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { createClient } from '@/lib/supabase/client';

// ─── Known search-URL patterns per source ────────────────────────────────────
// If a listing_url matches these patterns, it's a search page, not a detail page.
const SEARCH_URL_PATTERNS: Record<string, RegExp[]> = {
  'Zillow': [/zillow\.com\/homes\/for_rent/, /zillow\.com\/search/, /zillow\.com\/homes\?/],
  'Trulia': [/trulia\.com\/for_rent/, /trulia\.com\/search/, /trulia\.com\/real_estate/],
  'Realtor.com': [/realtor\.com\/realestateandhomes-search/, /realtor\.com\/apartments/],
  'Apartments.com': [/apartments\.com\/[a-z-]+-[a-z]{2}\/$/, /apartments\.com\/search/],
  'HotPads': [/hotpads\.com\/search/, /hotpads\.com\/[a-z-]+-[a-z]{2}\/?$/],
  'Craigslist': [/craigslist\.org\/search\/apa/, /craigslist\.org\/search\?/],
  'Facebook Marketplace': [/facebook\.com\/marketplace\/category/, /facebook\.com\/marketplace\/search/],
  'Rent.com': [/rent\.com\/[a-z-]+-apartments\/?$/, /rent\.com\/search/],
  'PadMapper': [/padmapper\.com\/apartments\/[a-z-]+-[a-z]{2}\/?$/, /padmapper\.com\/search/],
  'Apartment List': [/apartmentlist\.com\/[a-z]{2}\/[a-z-]+\/?$/, /apartmentlist\.com\/search/],
  'Dwellsy': [/dwellsy\.com\/search/, /dwellsy\.com\/rentals/],
};

// ─── Known listing-detail URL patterns per source ─────────────────────────────
const LISTING_DETAIL_PATTERNS: Record<string, RegExp> = {
  'Zillow': /zillow\.com\/homes\/[^/]+-[A-Z]{2}-\d+_rb\//,
  'Trulia': /trulia\.com\/p\/[a-z]{2}\/[a-z-]+\/[a-z0-9-]+--\d+\//,
  'Realtor.com': /realtor\.com\/realestateandhomes-detail\//,
  'Apartments.com': /apartments\.com\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+\//,
  'HotPads': /hotpads\.com\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+/,
  'Craigslist': /craigslist\.org\/[a-z]+\/\d+\.html/,
  'Facebook Marketplace': /facebook\.com\/marketplace\/item\/\d+/,
  'Rent.com': /rent\.com\/[a-z]+-[a-z-]+-apartments\/[a-z0-9-]+-\d+\//,
  'PadMapper': /padmapper\.com\/apartments\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+/,
  'Apartment List': /apartmentlist\.com\/[a-z]{2}\/[a-z-]+\/[a-z0-9-]+-\d+/,
  'Dwellsy': /dwellsy\.com\/listing\/[a-z-]+-[a-z]{2}\/[a-z0-9-]+-\d+\//,
};

function isSearchUrl(url: string, source: string): boolean {
  const patterns = SEARCH_URL_PATTERNS[source] || [];
  return patterns.some(p => p.test(url));
}

function isDetailUrl(url: string, source: string): boolean {
  const pattern = LISTING_DETAIL_PATTERNS[source];
  if (!pattern) return false;
  return pattern.test(url);
}

function getSourceDomain(source: string): string {
  const domains: Record<string, string> = {
    'Zillow': 'zillow.com',
    'Trulia': 'trulia.com',
    'Realtor.com': 'realtor.com',
    'Apartments.com': 'apartments.com',
    'HotPads': 'hotpads.com',
    'Craigslist': 'craigslist.org',
    'Facebook Marketplace': 'facebook.com',
    'Rent.com': 'rent.com',
    'PadMapper': 'padmapper.com',
    'Apartment List': 'apartmentlist.com',
    'Dwellsy': 'dwellsy.com',
    'Redfin': 'redfin.com',
    'LoopNet': 'loopnet.com',
    'Airbnb': 'airbnb.com',
    'VRBO': 'vrbo.com',
  };
  return domains[source] || '';
}

// ─── POST /api/listing-url/extract ───────────────────────────────────────────
// Claude fallback: extract individual listing URL from scraped page content.
// Only called when standard extraction fails or returns a search URL.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, source, currentUrl, pageContent, leadId } = body;

    if (!address || !source) {
      return NextResponse.json({ error: 'address and source are required' }, { status: 400 });
    }

    // ── Step 1: Check if current URL is already a valid detail URL ────────────
    if (currentUrl && !isSearchUrl(currentUrl, source) && isDetailUrl(currentUrl, source)) {
      return NextResponse.json({
        listing_url: currentUrl,
        method: 'standard_valid',
        confidence: 'high',
        message: 'Existing URL is already a valid listing detail URL',
      });
    }

    // ── Step 2: Determine trigger reason ─────────────────────────────────────
    let triggerReason = 'unknown';
    if (!currentUrl || currentUrl === '') {
      triggerReason = 'no_url';
    } else if (isSearchUrl(currentUrl, source)) {
      triggerReason = 'search_url_detected';
    } else {
      triggerReason = 'low_confidence';
    }

    // ── Step 3: Claude fallback extraction ───────────────────────────────────
    if (!pageContent) {
      return NextResponse.json({
        listing_url: null,
        method: 'claude_fallback',
        confidence: 'none',
        trigger_reason: triggerReason,
        message: 'No page content provided for Claude fallback extraction',
      });
    }

    const sourceDomain = getSourceDomain(source);
    const prompt = `Here is scraped content from a property listing search results page on ${source}. 
Identify and return ONLY the individual listing's own detail-page URL for the property at: ${address}

Rules:
- Return ONLY the individual listing detail URL, NOT the search/results page URL
- The URL must be from the domain: ${sourceDomain}
- The URL must point to a single property detail page, not a search results page
- If no individual listing URL can be confidently identified, return null
- Do not guess or fabricate URLs

Scraped content:
${pageContent.substring(0, 8000)}

Respond with JSON only: {"listing_url": "https://..." or null, "confidence": "high|medium|low"}`;

    const aiResponse = await getChatCompletion(
      'ANTHROPIC',
      'claude-haiku-4-5-20251001',
      [{ role: 'user', content: prompt }],
      { temperature: 0, max_tokens: 200 }
    );

    const rawContent = aiResponse?.choices?.[0]?.message?.content || '';
    let extractedUrl: string | null = null;
    let confidence = 'low';

    try {
      const jsonMatch = rawContent.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        extractedUrl = parsed.listing_url || null;
        confidence = parsed.confidence || 'low';
      }
    } catch {
      // Claude returned non-JSON — treat as null
      extractedUrl = null;
    }

    // ── Step 4: Validate Claude's returned URL ────────────────────────────────
    if (extractedUrl) {
      // Must be different from the known search URL
      if (currentUrl && extractedUrl === currentUrl) {
        extractedUrl = null;
        confidence = 'none';
      }
      // Must belong to the expected source domain
      else if (sourceDomain && !extractedUrl.includes(sourceDomain)) {
        extractedUrl = null;
        confidence = 'none';
      }
      // Must match a listing-detail URL pattern
      else if (!isDetailUrl(extractedUrl, source)) {
        confidence = 'low'; // Don't null it — Claude may know patterns we don't
      }
    }

    // ── Step 5: Log the Claude-assisted extraction ────────────────────────────
    if (leadId) {
      try {
        const supabase = createClient();
        await supabase.from('listing_url_extraction_log').insert({
          lead_id: leadId,
          address,
          source,
          trigger_reason: triggerReason,
          original_url: currentUrl || null,
          extracted_url: extractedUrl,
          confidence,
          method: 'claude_fallback',
          created_at: new Date().toISOString(),
        }).select();
      } catch {
        // Log failure is non-fatal
      }
    }

    return NextResponse.json({
      listing_url: extractedUrl,
      method: 'claude_fallback',
      confidence,
      trigger_reason: triggerReason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[listing-url/extract] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/listing-url/extract — Verification step ────────────────────────
// Before saving a listing_url, verify it actually matches the lead's address.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, listing_url, source, leadId } = body;

    if (!address || !listing_url) {
      return NextResponse.json({ error: 'address and listing_url are required' }, { status: 400 });
    }

    // Quick sanity check before calling Claude
    const sourceDomain = getSourceDomain(source);
    if (sourceDomain && !listing_url.includes(sourceDomain)) {
      return NextResponse.json({
        verified: false,
        reason: `URL domain does not match expected source domain (${sourceDomain})`,
        action: 'flag_for_review',
      });
    }

    // Ask Claude to verify the URL matches the address
    const prompt = `Does this listing URL correspond to the property at: ${address}?

URL: ${listing_url}
Source: ${source}

Based on the URL structure and any address information embedded in it, answer:
- yes: the URL appears to be for this specific property
- no: the URL appears to be for a different property or is a search page
- uncertain: cannot determine from URL alone

Respond with JSON only: {"match": "yes|no|uncertain", "reason": "brief explanation"}`;

    const aiResponse = await getChatCompletion(
      'ANTHROPIC',
      'claude-haiku-4-5-20251001',
      [{ role: 'user', content: prompt }],
      { temperature: 0, max_tokens: 150 }
    );

    const rawContent = aiResponse?.choices?.[0]?.message?.content || '';
    let match = 'uncertain';
    let reason = 'Could not parse verification response';

    try {
      const jsonMatch = rawContent.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        match = parsed.match || 'uncertain';
        reason = parsed.reason || reason;
      }
    } catch { /* silent */ }

    const verified = match === 'yes';
    const action = match === 'no' ? 'flag_for_review' : match === 'uncertain' ? 'save_with_low_confidence' : 'save';

    // Log verification
    if (leadId) {
      try {
        const supabase = createClient();
        await supabase.from('listing_url_extraction_log').insert({
          lead_id: leadId,
          address,
          source,
          trigger_reason: 'verification',
          original_url: listing_url,
          extracted_url: verified ? listing_url : null,
          confidence: match === 'yes' ? 'high' : match === 'uncertain' ? 'medium' : 'none',
          method: 'claude_verification',
          created_at: new Date().toISOString(),
        }).select();
      } catch { /* silent */ }
    }

    return NextResponse.json({ verified, match, reason, action });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
