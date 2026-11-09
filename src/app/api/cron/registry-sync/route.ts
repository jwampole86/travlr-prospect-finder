import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { registerLead } from '@/lib/registry/registryService';

export const maxDuration = 120;
const KEY = 'avyro_leads';
const TIME_BUDGET_MS = 90_000;

/**
 * Works through the leads oldest first, a batch at a time, giving each its place in the property registry (see registryService.ts). It only adds
 * registry rows: no lead is changed, and how leads are found and matched in the app is unaffected. New leads are picked up as they arrive.
 */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) return NextResponse.json({ error: authorization.reason ?? 'Unauthorized' }, { status: 401 });
  const limit = Math.min(500, Math.max(10, Number(req.nextUrl.searchParams.get('limit')) || 250));
  const run = await startCronRun('registry-sync');
  const db = getSupabaseAdmin();
  const started = Date.now();
  const counts = { linked: 0, created: 0, exists: 0, unresolvable: 0, failed: 0, reviews: 0 };
  const errors: string[] = [];
  try {
    const { data: state } = await db.from('registry_sync_state').select('cursor_at, cursor_id').eq('key', KEY).maybeSingle();
    // created_at is stored as text on leads (a few rows are blank), so the cursor is text compared the same way, starting before everything.
    const at: string = state?.cursor_at ?? '';
    const id: string = state?.cursor_id ?? '';
    const { data: leads, error } = await db.from('leads')
      .select('id, address, city, state, zip, lat, lng, organization_id, created_at')
      .or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${id})`)
      .or('is_synthetic.is.null,is_synthetic.eq.false')
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);

    let last: { created_at: string; id: string } | null = null;
    for (const lead of leads ?? []) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try {
        const out = await registerLead(db, { ...lead, lat: lead.lat as number | null, lng: lead.lng as number | null });
        counts[out.status] += 1;
        counts.reviews += out.reviews ?? 0;
      } catch (e) {
        counts.failed += 1;
        if (errors.length < 5) errors.push(`${lead.id}: ${(e as Error).message}`);
      }
      last = { created_at: String(lead.created_at ?? ''), id: lead.id as string };
    }
    if (last) await db.from('registry_sync_state').upsert({ key: KEY, cursor_at: last.created_at, cursor_id: last.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    await finishCronRun(run, { status: counts.failed ? 'partial' : 'success', leadsScanned: (leads ?? []).length, errorCount: counts.failed, errors, metadata: counts });
    return NextResponse.json({ ok: true, scanned: (leads ?? []).length, ...counts });
  } catch (e) {
    await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [(e as Error).message] });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
