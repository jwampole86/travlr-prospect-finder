import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cancelQueuedForDeadListings } from '@/lib/services/listingStatus';

export const maxDuration = 300;

/**
 * GET /api/cron/listing-recheck  (CRON_SECRET, hourly)
 * Cancels queued campaign texts due within the hour when Zillow now shows the home as sold, pending or off the market.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await cancelQueuedForDeadListings(getSupabaseAdmin())) });
}
