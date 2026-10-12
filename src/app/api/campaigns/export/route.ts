import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 60;

const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// Spreadsheet apps run text that starts with these characters as formulas.
const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** GET /api/campaigns/export?batch=<name>|all  (admin only). One row per lead with outcomes and contact details, for CRM or email tools. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  const key = req.nextUrl.searchParams.get('batch') || 'all';
  const eng: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from('sms_lead_engagement').select('*').range(from, from + 999);
    if (key !== 'all') q = q.eq('batch', key);
    const { data, error } = await q; if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    eng.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
  }
  const leads = new Map<string, Record<string, any>>();
  const ids = [...new Set(eng.map(e => e.lead_id as string))];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from('leads').select('id,address,city,state,zip,owner_name,contact_phone,contact_email,stage,source').in('id', ids.slice(i, i + 150));
    for (const l of data ?? []) leads.set(l.id, l);
  }
  const cols = ['batch', 'audience', 'lead_id', 'address', 'city', 'state', 'zip', 'owner_name', 'contact_phone', 'contact_email', 'source', 'stage', 'temperature', 'engagement_score', 'twilio_status', 'phone_quality', 'variant', 'generated_by', 'range_text', 'human_clicks', 'first_click_at', 'device', 'os', 'click_region', 'estimate_viewed', 'time_on_page_s', 'deepest_step', 'report_downloaded', 'chat_questions', 'estimate_submitted_at', 'contact_requested_at', 'reply_at', 'reply_intent', 'reply_text', 'opted_in', 'opted_out'];
  const lines = [cols.join(',')];
  for (const e of eng.sort((a, b) => b.engagement_score - a.engagement_score)) {
    const row = { ...(leads.get(e.lead_id) ?? {}), ...e };
    lines.push(cols.map(c => esc(safe(row[c]))).join(','));
  }
  return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campaign-${key}-engagement.csv"`, 'Cache-Control': 'no-store' } });
}
