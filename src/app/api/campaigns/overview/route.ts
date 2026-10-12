import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildOverview } from '@/lib/services/campaignInsights';
import { listBatches } from '@/lib/services/smsCampaignHarvest';

export const maxDuration = 60;

/** GET /api/campaigns/overview?batch=<name>|all  (admin only). Lists campaigns and returns the report plus the latest saved insights. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  const batches = await listBatches(db);
  const key = req.nextUrl.searchParams.get('batch') || 'all';
  if (key !== 'all' && !batches.some(b => b.batch === key)) return NextResponse.json({ error: 'Unknown campaign' }, { status: 404 });
  const overview = await buildOverview(db, key === 'all' ? 'all' : [key]);
  const { data: snap } = await db.from('campaign_insight_snapshots').select('created_at, insights, model').eq('batch', key).not('insights', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ batches, selected: key, overview, insights: snap ? { ...snap.insights, _createdAt: snap.created_at, _model: snap.model } : null });
}
