import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { drilldown, textDetail } from '@/lib/services/campaignDrilldown';
import { listBatches } from '@/lib/services/smsCampaignHarvest';

export const maxDuration = 60;

/**
 * GET /api/campaigns/drilldown  (admin only)
 *   ?batch=<name>|all&metric=<metric>[&group=<breakdown>&value=<segment>]  -> the texts behind one number
 *   ?lead=<id>&batch=<name>                                                  -> one text in full
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const p = req.nextUrl.searchParams;
  const db = getSupabaseAdmin();
  const batch = p.get('batch') || 'all';
  if (batch !== 'all' && !(await listBatches(db)).some(b => b.batch === batch)) return NextResponse.json({ error: 'Unknown campaign' }, { status: 404 });

  const lead = p.get('lead');
  if (lead) {
    if (batch === 'all') return NextResponse.json({ error: 'batch is required' }, { status: 400 });
    const d = await textDetail(db, lead, batch);
    return d ? NextResponse.json(d) : NextResponse.json({ error: 'Text not found' }, { status: 404 });
  }
  const metric = p.get('metric') ?? '';
  if (!/^[a-z_]+(:[\w.-]{1,40})?$/.test(metric)) return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
  const group = p.get('group') ?? undefined;
  if (group && !/^[A-Za-z]{2,20}$/.test(group)) return NextResponse.json({ error: 'Unknown breakdown' }, { status: 400 });
  return NextResponse.json(await drilldown(db, { batch, metric, group, value: p.get('value') ?? undefined }));
}
