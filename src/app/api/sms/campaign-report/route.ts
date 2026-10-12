import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildCampaignReport } from '@/lib/services/smsCampaignReport';

export const maxDuration = 60;

/** GET /api/sms/campaign-report?batch=2026-10-12-verified  (admin only) */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const batch = req.nextUrl.searchParams.get('batch');
  if (!batch) return NextResponse.json({ error: 'batch is required' }, { status: 400 });
  return NextResponse.json(await buildCampaignReport(getSupabaseAdmin(), batch));
}
