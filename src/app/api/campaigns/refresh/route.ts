import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { harvestBatch, listBatches } from '@/lib/services/smsCampaignHarvest';

export const maxDuration = 120;

/** POST /api/campaigns/refresh { batch?: string }  (admin only). Re-collects delivery, clicks, journey, replies and consent now. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({})) as { batch?: string };
  const db = getSupabaseAdmin();
  const all = await listBatches(db);
  const targets = body.batch && body.batch !== 'all' ? all.filter(b => b.batch === body.batch) : all;
  const results = [];
  for (const b of targets) results.push(await harvestBatch(db, b.batch, { writeCrm: Date.parse(b.firstSend) < Date.now() }));
  return NextResponse.json({ ok: true, results });
}
