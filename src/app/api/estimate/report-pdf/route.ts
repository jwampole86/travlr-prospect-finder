import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';
import { HomeownerReportPdf } from '@/lib/homeownerReportPdf';
import { parseEquipment } from '@/lib/homeownerReportContent';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/estimate/report-pdf?address=...&eq=smoke,lock  (public)
 * Returns the homeowner report as a downloadable PDF. Same data as the web report; no personal data is included.
 */
export async function GET(req: NextRequest) {
  if (!allowRequest(`pdf:${clientIp(req.headers)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  const address = (req.nextUrl.searchParams.get('address') ?? '').trim().slice(0, 300);
  if (address.length < 5) return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  const equipment = parseEquipment(req.nextUrl.searchParams.get('eq'));

  try {
    const report = await buildHomeownerReport(address);
    const buffer = await renderToBuffer(React.createElement(HomeownerReportPdf, { report, equipment }) as React.ReactElement<any>);
    const place = [report.street, report.city, report.state].filter(Boolean).join(', ') || 'Your Home';
    const fileName = `TRAVLR - Property Revenue Report ${place}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) + '.pdf';
    const asciiName = fileName.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[estimate/report-pdf]', err);
    // Stack traces go only to callers holding the cron secret.
    const operator = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    return NextResponse.json({ error: 'We could not generate the PDF. Please try again.', ...(operator ? { detail: String((err as Error)?.stack ?? err).slice(0, 1800) } : {}) }, { status: 500 });
  }
}
