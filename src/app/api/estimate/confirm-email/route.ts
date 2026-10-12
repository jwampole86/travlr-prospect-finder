import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { readEmailConfirmToken } from '@/lib/estimateTokens';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';

/**
 * POST /api/estimate/confirm-email  (public)
 * { token } from the signed link in the report email. Opening it proves the homeowner received the email, so the
 * lead's email is recorded as confirmed. Idempotent.
 */
export async function POST(req: NextRequest) {
  if (!allowRequest(`confirm:${clientIp(req.headers)}`, 30, 60 * 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const parsed = readEmailConfirmToken(String(body.token ?? ''));
  if (!parsed) return NextResponse.json({ ok: false }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: lead } = await db.from('leads').select('id, landing_page_submission').eq('id', parsed.leadId).maybeSingle();
  const sub = (lead?.landing_page_submission ?? null) as Record<string, any> | null;
  if (!lead || !sub) return NextResponse.json({ ok: false }, { status: 404 });
  if (String(sub.contact_capture?.email ?? '').toLowerCase() !== parsed.email) return NextResponse.json({ ok: false }, { status: 409 });

  if (sub.validation?.email_confirmed_at) return NextResponse.json({ ok: true, already: true });
  const now = new Date().toISOString();
  const validation = { ...(sub.validation ?? {}), email_confirmed_at: now, email_confirmed_via: 'report_link' };
  await db.from('leads').update({ landing_page_submission: { ...sub, validation }, email_opt_in: true }).eq('id', lead.id);

  await db.from('lead_activity_log').insert({
    lead_id: lead.id, activity_type: 'homeowner_email_confirmed',
    activity_data: { title: 'Homeowner opened their report email link', email: parsed.email }, performed_by_name: 'Homeowner (estimate page)',
  }).then(() => null, () => null);
  return NextResponse.json({ ok: true });
}
