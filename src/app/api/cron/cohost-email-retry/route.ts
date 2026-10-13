import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { retryNextAddress } from '@/lib/services/cohostEmail';

export const maxDuration = 60;

/**
 * GET /api/cron/cohost-email-retry  Resends held co-host emails (the earlier address bounced overnight) to the owner's next address on file
 * once it is 9am in the owner's time zone. Every check is run again at send time, so an owner who opted out in the meantime is skipped.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  const { data: due } = await db.from('cohost_email_messages').select('id').in('status', ['bounced', 'failed']).lte('retry_at', new Date().toISOString()).limit(20);
  const results: Array<{ id: string; sent: boolean; note?: string }> = [];
  for (const m of due ?? []) {
    const r = await retryNextAddress(db, m.id as string);
    results.push({ id: m.id as string, sent: r.ok, note: r.ok ? undefined : r.reason });
  }
  return NextResponse.json({ ok: true, due: results.length, results });
}
