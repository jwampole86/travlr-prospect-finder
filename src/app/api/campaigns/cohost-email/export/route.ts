import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { campaignReport } from '@/lib/services/cohostEmail';

const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// Spreadsheet apps run text that starts with these characters as formulas.
const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** GET /api/campaigns/cohost-email/export?campaign=<id>|all  (admin). One row per email with its outcome, for a CRM or spreadsheet. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = req.nextUrl.searchParams.get('campaign') || 'all';
  const { rows } = await campaignReport(getSupabaseAdmin(), key);
  const cols = ['listing', 'market', 'owner', 'email', 'subject', 'status', 'outcome', 'pipeline_stage', 'sent_at', 'delivered_at', 'opened_at', 'offer_page_views', 'requested_audit', 'replied_at', 'reply', 'bounce', 'opted_out_at'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push([r.title, r.market, r.owner, r.toEmail, r.subject, r.status, r.temperature, r.stage, r.sentAt, r.deliveredAt, r.openedAt, r.offer.views, r.offer.requested ? 'yes' : '', r.repliedAt, r.replyText, r.failureReason, r.optedOutAt].map(v => esc(safe(v))).join(','));
  return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cohost-email-${key}.csv"`, 'Cache-Control': 'no-store' } });
}
