import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { notifyUser } from '@/lib/services/userNotify';

/** POST /api/agent/profile/test  ->  sends the signed-in user a test alert through the channels they switched on and reports what happened. */
export async function POST(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const delivery = await notifyUser(getSupabaseAdmin(), auth.actor.user.id, { title: 'Test notification', message: 'This is a test from My Profile & Prefs. Your alerts are set up correctly.', kind: 'escalation', severity: 'info', metadata: { reason: 'test' } }, { force: true });
  return NextResponse.json({ delivery });
}
