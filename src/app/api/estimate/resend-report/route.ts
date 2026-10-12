import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildHomeownerReport, parseAddress } from '@/lib/homeownerEstimate';
import { deliverReportEmail } from '@/lib/homeownerReportDelivery';
import { normalizeLeadFingerprint } from '@/lib/masterHomeownerData';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { parseEquipment } from '@/lib/homeownerReportContent';

export const maxDuration = 30;

/**
 * POST /api/estimate/resend-report  (public)
 * { address, email } -> sends the report email again. Only works for an email address that already submitted for this
 * address, so it cannot be used to send mail to arbitrary people. Limited to 3 sends per address per hour.
 */
export async function POST(req: NextRequest) {
  if (!allowRequest(`resend:${clientIp(req.headers)}`, 5, 60 * 60 * 1000)) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const address = typeof body.address === 'string' ? body.address.trim().slice(0, 300) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  if (address.length < 5 || !email) return NextResponse.json({ error: 'Address and email are required' }, { status: 400 });

  let db;
  try { db = getSupabaseAdmin(); } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  const a = parseAddress(address);
  const fingerprint = normalizeLeadFingerprint(a.street || address, a.city, a.state);
  const { data: lead } = await db.from('leads').select('id, landing_page_submission').eq('address_fingerprint', fingerprint).limit(1).maybeSingle();
  const submitted = String((lead?.landing_page_submission as { contact_capture?: { email?: string; first_name?: string } } | null)?.contact_capture?.email ?? '').toLowerCase();
  if (!lead || submitted !== email) {
    // Same answer either way, so the endpoint cannot be used to discover who submitted.
    return NextResponse.json({ ok: true, emailed: false, message: 'If that address matches your request, your report has been sent.' });
  }

  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true })
    .eq('lead_id', lead.id).ilike('recipient_email', email).eq('metadata->>kind', 'homeowner_report').gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 3) return NextResponse.json({ error: 'We already sent this report a few times in the last hour. Please check your spam folder or contact us.' }, { status: 429 });

  const first = String((lead.landing_page_submission as { contact_capture?: { first_name?: string } }).contact_capture?.first_name ?? 'there');
  const report = await buildHomeownerReport(address);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const result = await deliverReportEmail(db, { base, address, leadId: lead.id, firstName: first, to: email, report, resend: true,
    equipment: Array.isArray(body.equipment) ? parseEquipment(body.equipment.join(',')) ?? undefined : undefined });
  return NextResponse.json({ ok: true, emailed: result.ok, messageId: result.messageId });
}
