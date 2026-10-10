import { NextRequest, NextResponse } from 'next/server';
import { getPropertyReport } from '@/lib/services/propertyReportProvider';

/**
 * POST /api/enrichment/property-report
 * On-demand single-property deed/assessment/mortgage/notice-of-default lookup
 * via the Property Report (MicroBilt) RapidAPI provider. NOD records (notice
 * of default) are a genuine financial-distress / pre-foreclosure signal not
 * available from any of this app's other property providers.
 *
 * Body: { addr1, city, stateProv, postalCode, ownerFirstName?, ownerLastName? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const addr1 = typeof body?.addr1 === 'string' ? body.addr1 : undefined;
  const city = typeof body?.city === 'string' ? body.city : undefined;
  const stateProv = typeof body?.stateProv === 'string' ? body.stateProv : undefined;
  const postalCode = typeof body?.postalCode === 'string' ? body.postalCode : undefined;

  if (!addr1 || !city || !stateProv || !postalCode) {
    return NextResponse.json({ error: 'addr1, city, stateProv, and postalCode are all required' }, { status: 400 });
  }

  const result = await getPropertyReport({
    addr1, city, stateProv, postalCode,
    ownerFirstName: typeof body?.ownerFirstName === 'string' ? body.ownerFirstName : undefined,
    ownerLastName: typeof body?.ownerLastName === 'string' ? body.ownerLastName : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Property Report request failed' }, { status: result.status || 503 });
  }

  return NextResponse.json({ report: result.report });
}
