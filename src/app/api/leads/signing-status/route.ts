import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** GET /api/leads/signing-status?leadId=  Where the homeowner's DocuSign agreements stand: signed, or the furthest they have got. */
export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get('leadId') ?? '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: sessions } = await db.from('signing_sessions').select('id,session_status,docusign_completed_at,created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10);
  const done = (sessions ?? []).find(s => s.session_status === 'completed');
  if (done) return NextResponse.json({ state: 'signed', completedAt: done.docusign_completed_at });
  const latest = sessions?.[0];
  if (!latest) return NextResponse.json({ state: 'none' });
  const status = String(latest.session_status ?? '');
  return NextResponse.json({ state: ['declined', 'voided', 'viewed', 'sent'].includes(status) ? status : 'sent', sentAt: latest.created_at });
}
