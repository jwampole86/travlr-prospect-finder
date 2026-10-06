import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/enrichment/pdl
 * Single-lead People Data Labs Person Enrichment lookup — the ONLY path from
 * browser to PDL. Keeps PDL_API_KEY server-side only (never NEXT_PUBLIC_*),
 * matching the same pattern already used for Salesgenie/BatchData/PropertyReach.
 *
 * Body: { ownerName?, city?, state? }
 */

const PDL_API_KEY = process.env.PDL_API_KEY ?? '';

interface PDLContacts {
  emails: { email: string; confidence: number }[];
  phones: { number: string; type: string; confidence: number }[];
}

function simulatePDL(ownerName: string): PDLContacts {
  const hash = ownerName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    emails: [
      { email: `${(ownerName || 'owner').toLowerCase().replace(/\s+/g, '.')}@example.com`, confidence: 85 + (hash % 10) },
    ],
    phones: [
      { number: `720-555-${String(hash % 9000 + 1000)}`, type: 'mobile', confidence: 82 + (hash % 12) },
    ],
  };
}

export async function POST(req: NextRequest) {
  let body: { ownerName?: string; city?: string; state?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { ownerName = '', city = '', state = '' } = body;
  const isLive = Boolean(PDL_API_KEY) && PDL_API_KEY !== 'your-pdl-api-key-here';

  if (!isLive) {
    return NextResponse.json({ contacts: simulatePDL(ownerName), simulated: true });
  }

  try {
    // Real single-match lookup endpoint, verified against PDL's published docs
    // 2026-10-06: /v5/person/enrich (not /person/search, which expects an
    // Elasticsearch query DSL). Input params are `locality`/`region`.
    const params = new URLSearchParams({ api_key: PDL_API_KEY, pretty: 'false' });
    if (ownerName) params.append('name', ownerName);
    if (city) params.append('locality', city);
    if (state) params.append('region', state);

    const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, {
      method: 'GET',
      headers: { 'X-Api-Key': PDL_API_KEY },
    });

    if (!res.ok) {
      // 404 means PDL genuinely queried and found no matching person — that is
      // a real (empty) result, not a service failure. Returning fake simulated
      // contact data here would be misleading (looks real, isn't). Only fall
      // back to simulation for actual service failures (auth, rate limit, 5xx).
      if (res.status === 404) {
        return NextResponse.json({ contacts: { emails: [], phones: [] }, simulated: false });
      }
      return NextResponse.json({ contacts: simulatePDL(ownerName), simulated: true });
    }

    const result = await res.json();
    const person = result?.data;
    if (!person) {
      return NextResponse.json({ contacts: { emails: [], phones: [] }, simulated: false });
    }

    const likelihood = result.likelihood ?? 0;
    const conf = (l: number) => Math.min(Math.round(l * 10), 100);

    const contacts: PDLContacts = {
      emails: (Array.isArray(person.emails) ? person.emails : []).slice(0, 3).map((e: { address: string }) => ({
        email: e.address,
        confidence: conf(likelihood),
      })),
      phones: (Array.isArray(person.phone_numbers) ? person.phone_numbers : []).slice(0, 3).map((p: string) => ({
        number: p,
        type: 'mobile',
        confidence: conf(likelihood),
      })),
    };

    return NextResponse.json({ contacts, simulated: false });
  } catch (err) {
    console.error('[PDL API Route] Error:', err);
    return NextResponse.json({ contacts: simulatePDL(ownerName), simulated: true });
  }
}
