import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { campaignReport, createCampaign, listCampaigns, logReply, sendOne, testSend, type NewEmail } from '@/lib/services/cohostEmail';

export const maxDuration = 60;

/** GET /api/campaigns/cohost-email?campaign=<id>|all  (admin). The co-host email campaigns and the report for one of them. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  const campaigns = await listCampaigns(db);
  const key = req.nextUrl.searchParams.get('campaign') || 'all';
  if (key !== 'all' && !campaigns.some(c => c.id === key)) return NextResponse.json({ error: 'Unknown campaign' }, { status: 404 });
  return NextResponse.json({ campaigns, selected: key, report: await campaignReport(db, key) });
}

/**
 * POST /api/campaigns/cohost-email  (admin). action: create | edit | test | send | cancel | reply.
 * Sending is always one email per call, by a person: co-host owners are never emailed in bulk.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({})) as Record<string, any>;
  const db = getSupabaseAdmin();
  const actorId = auth.actor.user.id;
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
  const id = typeof b.id === 'string' ? b.id : '';

  if (b.action === 'create') {
    const r = await createCampaign(db, { name: String(b.name ?? ''), createdBy: actorId, items: (Array.isArray(b.items) ? b.items : []) as NewEmail[] });
    return r.ok ? NextResponse.json({ ok: true, id: r.id }) : fail(r.error);
  }
  if (!id) return fail('id is required');

  if (b.action === 'edit') {
    const subject = String(b.subject ?? '').trim().slice(0, 200); const body = String(b.body ?? '').trim().slice(0, 8000);
    if (!subject || !body) return fail('Subject and body are required.');
    const { data, error } = await db.from('cohost_email_messages').update({ subject, body, tested_at: null, updated_at: new Date().toISOString() }).eq('id', id).in('status', ['draft', 'failed']).select('id');
    if (error) return fail(error.message, 500);
    return data?.length ? NextResponse.json({ ok: true }) : fail('Only an unsent email can be edited.');
  }
  if (b.action === 'test') {
    const r = await testSend(db, id, auth.actor.user.email ?? '');
    return r.ok ? NextResponse.json({ ok: true, to: auth.actor.user.email }) : fail(r.error);
  }
  if (b.action === 'send') {
    const { data: m } = await db.from('cohost_email_messages').select('tested_at').eq('id', id).maybeSingle();
    if (m && !m.tested_at) return fail('Send a test to yourself first and read it, then send.');
    const r = await sendOne(db, id, actorId);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.error);
  }
  if (b.action === 'cancel') {
    const { data } = await db.from('cohost_email_messages').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', id).in('status', ['draft', 'failed']).select('id');
    return data?.length ? NextResponse.json({ ok: true }) : fail('Only an unsent email can be canceled.');
  }
  if (b.action === 'reply') {
    const text = String(b.text ?? '').trim();
    if (!text) return fail('Paste what they wrote.');
    return (await logReply(db, id, text)) ? NextResponse.json({ ok: true }) : fail('Unknown email.', 404);
  }
  return fail('Unknown action');
}
