import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { publishableGallery } from '@/lib/media/propertyMedia';
import { validIntegrationKey } from '@/lib/media/integrationKey';

export const dynamic = 'force-dynamic';

/**
 * GET: the photos NAVEO Homes may show for a lead. Only photos a person has cleared for publishing are returned, hero first,
 * as links to our own copies where they exist. Called by NAVEO with the shared key in `x-naveo-key` (set NAVEO_INTEGRATION_KEY,
 * 24+ characters); with no key configured the endpoint is off.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  if (!process.env.NAVEO_INTEGRATION_KEY) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!validIntegrationKey(req.headers.get('x-naveo-key'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { leadId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const photos = await publishableGallery(getSupabaseAdmin(), leadId, null);
  return NextResponse.json({ leadId, photos }, { headers: { 'cache-control': 'no-store' } });
}
