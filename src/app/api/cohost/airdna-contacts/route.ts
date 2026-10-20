import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { importAirdnaContacts } from '@/lib/services/airdnaContactImport';

export const maxDuration = 60;

/** POST /api/cohost/airdna-contacts { text, apply }  (admin only). Without apply it only reports what would be imported. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({})) as { text?: string; apply?: boolean };
  const text = String(body.text ?? '');
  if (text.length < 10 || text.length > 2_000_000) return NextResponse.json({ error: 'Paste the contacts table (with its header row).' }, { status: 400 });
  return NextResponse.json(await importAirdnaContacts(getSupabaseAdmin(), text, body.apply === true));
}
