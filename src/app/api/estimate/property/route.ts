import { NextRequest, NextResponse } from 'next/server';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';
import type { HomeownerEstimate } from '@/lib/homeownerEstimateTypes';

/**
 * POST /api/estimate/property { address }
 * Public. Builds the homeowner's revenue report from the property's own record when we have one, local rent data otherwise,
 * plus the city's documented short-term rental requirements.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const address = typeof body.address === 'string' ? body.address.trim().slice(0, 300) : '';
    if (address.length < 5) return NextResponse.json({ error: 'Address required' }, { status: 400 });

    const report = await buildHomeownerReport(address);
    const expected = report.scenarios[1];
    const reg = report.regulation;
    const estimate: HomeownerEstimate = {
      estimatedADR: expected.adr,
      estimatedOccupancy: expected.occupancy,
      grossMonthly: expected.grossMonthly,
      netMonthly: expected.netMonthly,
      annualNet: expected.annualNet,
      regulationSummary: reg.summary,
      regulationStatus: reg.tone === 'good' ? 'permitted' : reg.tone === 'unknown' ? 'unknown' : 'restricted',
      report,
    };
    return NextResponse.json({ estimate });
  } catch (err) {
    console.error('[estimate/property]', err);
    return NextResponse.json({ error: 'Failed to generate estimate' }, { status: 500 });
  }
}
