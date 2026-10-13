import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { futureStrReport, previewIssue } from '@/lib/services/futureStr';
import { CONCERNS, COMFORT, PAY, ROLES, SIZES, labelOf } from '@/lib/futureStrOptions';

const csv = (v: unknown) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * GET /api/campaigns/future-str  (admin only)
 *   (no params)                          results and readiness
 *   ?preview=homeowner|operator[&issue=] the newsletter exactly as it would be sent
 *   ?format=csv                          every survey answer with contact details
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const p = req.nextUrl.searchParams;
  const preview = p.get('preview');
  if (preview) {
    if (preview !== 'homeowner' && preview !== 'operator') return NextResponse.json({ error: 'Unknown audience' }, { status: 400 });
    const mail = await previewIssue(Number(p.get('issue') ?? 1) || 1, preview);
    return new NextResponse(mail.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const report = await futureStrReport(getSupabaseAdmin());
  if (p.get('format') === 'csv') {
    const head = ['Date', 'Audience', 'Comfort', 'Concerns', 'Interests', 'Role', 'Size', 'Would pay', 'Comment', 'Name', 'Email', 'List status'];
    const rows = report.responses.map(r => [r.at, r.audience, labelOf(COMFORT, r.comfort), (r.concerns ?? []).map((c: string) => labelOf(CONCERNS, c)), r.interests, labelOf(ROLES, r.role), labelOf(SIZES, r.size), labelOf(PAY, r.pay), r.comment, r.name, r.email, r.status]);
    return new NextResponse([head, ...rows].map(l => l.map(csv).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="future-of-str-responses.csv"' } });
  }
  return NextResponse.json(report);
}
