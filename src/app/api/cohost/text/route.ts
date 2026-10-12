import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendCohostText, threadFor } from '@/lib/services/cohostText';

export const maxDuration = 30;

/** POST /api/cohost/text { propertyId, to, body, confirmed }  (admin). Sends ONE text to a co-host prospect. A person must confirm the number belongs to the owner. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({})) as { propertyId?: string; to?: string; body?: string; confirmed?: boolean };
  if (!b.propertyId || !b.to || !b.body?.trim()) return NextResponse.json({ error: 'propertyId, to and body are required' }, { status: 400 });
  if (b.confirmed !== true) return NextResponse.json({ error: 'Confirm that this number belongs to the owner before sending.' }, { status: 400 });
  const db = getSupabaseAdmin();
  const res = await sendCohostText(db, { propertyId: b.propertyId, to: b.to, body: b.body.slice(0, 600), actorId: auth.actor.user.id });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });
  return NextResponse.json({ ok: true, thread: await threadFor(db, b.propertyId) });
}
