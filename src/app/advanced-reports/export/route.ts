import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { loadAdvancedReportData, parseReportFilters, type LeadPreviewRow } from '../reporting';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const EXPORT_COLUMNS: Array<{ key: keyof LeadPreviewRow; label: string }> = [
  { key: 'id', label: 'Lead ID' },
  { key: 'createdAt', label: 'Created At' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'prospectScore', label: 'Prospect Score' },
  { key: 'enrichmentStatus', label: 'Enrichment Status' },
  { key: 'outreachStatus', label: 'Outreach Status' },
  { key: 'primaryAgentName', label: 'Primary Agent' },
  { key: 'touchpoints', label: 'Touchpoints' },
  { key: 'lastTouchAt', label: 'Last Touch At' },
  { key: 'smsStatus', label: 'Latest SMS Status' },
  { key: 'engagementScore', label: 'Engagement Score' },
  { key: 'replyIntent', label: 'Reply Intent' },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'estimatedNetMonthly', label: 'Estimated Net Monthly' },
  { key: 'dealRevenue', label: 'Deal Revenue' },
];

function safeCell(value: unknown) {
  const text = value == null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export async function GET(req: NextRequest) {
  const authorization = await requireApiActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const filters = parseReportFilters(req.nextUrl.searchParams);
    const { exportRows } = await loadAdvancedReportData(authorization.actor.client, filters, false);

    const lines = [EXPORT_COLUMNS.map((column) => column.label).join(',')];
    for (const row of exportRows) {
      lines.push(EXPORT_COLUMNS.map((column) => safeCell(row[column.key])).join(','));
    }

    const filename = `advanced-report-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export report' },
      { status: 500 }
    );
  }
}
