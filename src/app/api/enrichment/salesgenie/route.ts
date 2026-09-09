import { NextRequest, NextResponse } from 'next/server';

/**
 * Salesgenie (Data Axle) Contact Enrichment — Server-Side API Route
 *
 * ⚠️  COMPLIANCE NOTICE — LEGAL REVIEW REQUIRED before production use.
 *
 * Salesgenie / Data Axle data is subject to:
 * - Data Axle Terms of Service: https://www.data-axle.com/terms-of-service/
 * - TCPA — written/prior express consent required before calling/texting
 * - California Consumer Privacy Act (CCPA) — if enriching CA residents
 * - Other applicable state privacy laws (VCDPA, CPA, etc.)
 *
 * Required before going live:
 * 1. Confirm your use case is permitted under Data Axle / Salesgenie ToS
 *    (B2B prospecting, automated lookups, storage of returned contact data).
 * 2. Implement TCPA-compliant consent tracking before using phone numbers.
 * 3. Implement a CCPA "Do Not Sell" flow for CA residents.
 * 4. Obtain written legal sign-off and update SALESGENIE_COMPLIANCE_STATUS.
 *
 * Credentials are read from environment variables — never hardcoded.
 * Set SALESGENIE_API_USER and SALESGENIE_API_SECRET in your .env file.
 */

export const SALESGENIE_COMPLIANCE_STATUS = {
  liveEnrichmentEnabled: false,
  legalReviewCompleted: false,
  tcpaConsentTrackingImplemented: false,
  ccpaFlowImplemented: false,
  note: 'Salesgenie enrichment requires legal sign-off before production activation.',
};

interface SalesgenieSearchResult {
  emails: { email: string; confidence: number }[];
  phones: { number: string; type: string; confidence: number }[];
  matchScore: number;
  source: string;
}

export async function POST(req: NextRequest) {
  const apiUser = process.env.SALESGENIE_API_USER;
  const apiSecret = process.env.SALESGENIE_API_SECRET;

  // Return simulation mode if credentials are not configured
  const isLive =
    apiUser &&
    apiSecret &&
    apiUser !== 'your-salesgenie-api-user-here' &&
    apiSecret !== 'your-salesgenie-api-secret-here';

  let body: { ownerName?: string; city?: string; state?: string; zip?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { ownerName, city, state, zip, address } = body;

  if (!ownerName && !address) {
    return NextResponse.json({ error: 'ownerName or address is required' }, { status: 400 });
  }

  if (!isLive) {
    // Simulation mode — no real API call
    const simResult: SalesgenieSearchResult = {
      emails: [
        { email: 'owner.salesgenie@example.com', confidence: 85 },
      ],
      phones: [
        { number: '720-555-0300', type: 'mobile', confidence: 82 },
        { number: '303-555-0400', type: 'home', confidence: 60 },
      ],
      matchScore: 85,
      source: 'Salesgenie (simulated)',
    };
    return NextResponse.json({ success: true, data: simResult, simulated: true });
  }

  // ─── Live Salesgenie API call ─────────────────────────────────────────────
  // Salesgenie uses HTTP Basic Auth with API user + secret.
  // Endpoint: https://api.salesgenie.com/api/v3/people/search (verify with Data Axle docs)
  try {
    const credentials = Buffer.from(`${apiUser}:${apiSecret}`).toString('base64');

    const searchPayload: Record<string, string> = {};
    if (ownerName) searchPayload['name'] = ownerName;
    if (city) searchPayload['city'] = city;
    if (state) searchPayload['state'] = state;
    if (zip) searchPayload['zip'] = zip;
    if (address) searchPayload['address'] = address;

    const sgRes = await fetch('https://api.salesgenie.com/api/v3/people/search', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        ...searchPayload,
        maxResults: 1,
      }),
    });

    if (!sgRes.ok) {
      const errText = await sgRes.text();
      return NextResponse.json(
        { error: `Salesgenie API error: ${sgRes.status} — ${errText}` },
        { status: sgRes.status }
      );
    }

    const sgData = await sgRes.json();

    // Map Salesgenie response to our standard schema
    // Salesgenie returns results in sgData.results or sgData.data — adjust per actual API docs
    const person = sgData?.results?.[0] || sgData?.data?.[0] || null;

    if (!person) {
      return NextResponse.json({
        success: true,
        data: { emails: [], phones: [], matchScore: 0, source: 'Salesgenie' },
        simulated: false,
      });
    }

    // Salesgenie match score is typically 0–100
    const matchScore: number = person.matchScore ?? person.match_score ?? 70;

    const emails: { email: string; confidence: number }[] = (
      person.emails || person.emailAddresses || []
    )
      .slice(0, 3)
      .map((e: string | { email?: string; address?: string }) => ({
        email: typeof e === 'string' ? e : (e.email || e.address || ''),
        confidence: matchScore,
      }))
      .filter((e: { email: string }) => !!e.email);

    const phones: { number: string; type: string; confidence: number }[] = (
      person.phones || person.phoneNumbers || []
    )
      .slice(0, 3)
      .map((p: string | { number?: string; phone?: string; type?: string; phoneType?: string }) => ({
        number: typeof p === 'string' ? p : (p.number || p.phone || ''),
        type: typeof p === 'string' ? 'unknown' : (p.type || p.phoneType || 'unknown'),
        confidence: matchScore,
      }))
      .filter((p: { number: string }) => !!p.number);

    const result: SalesgenieSearchResult = {
      emails,
      phones,
      matchScore,
      source: 'Salesgenie',
    };

    return NextResponse.json({ success: true, data: result, simulated: false });
  } catch (err) {
    console.error('[Salesgenie API Route] Error:', err);
    return NextResponse.json(
      { error: `Salesgenie request failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
