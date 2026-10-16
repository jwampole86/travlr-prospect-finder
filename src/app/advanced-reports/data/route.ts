import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { loadAdvancedReportData, parseReportFilters } from '../reporting';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authorization = await requireApiActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const filters = parseReportFilters(req.nextUrl.searchParams);
    const includeOptions = req.nextUrl.searchParams.get('includeOptions') === '1';
    const { report } = await loadAdvancedReportData(authorization.actor.client, filters, includeOptions);
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build report' },
      { status: 500 }
    );
  }
}
