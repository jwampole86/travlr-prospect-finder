import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enrichPriorityLeads } from '@/lib/services/airdnaEnrich';

export const maxDuration = 300;

/** GET /api/cron/airdna-enrich  (CRON_SECRET)  Spends part of the AirDNA allowance on the leads where real figures matter most. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await enrichPriorityLeads(getSupabaseAdmin(), { max: Number(process.env.AIRDNA_ENRICH_PER_RUN ?? 40), reserve: Number(process.env.AIRDNA_ENRICH_MIN_REMAINING ?? 800) });
  return NextResponse.json(result);
}
