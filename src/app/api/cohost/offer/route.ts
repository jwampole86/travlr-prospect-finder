import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureOfferLink, getOfferData, offerDrafts, offerUrl } from '@/lib/services/cohostOffer';

export const maxDuration = 30;

/** POST /api/cohost/offer { propertyId }  (admin). Returns the prospect's landing-page link and ready-to-edit email and text drafts. Sends nothing. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({})) as { propertyId?: string };
  if (!body.propertyId || typeof body.propertyId !== 'string') return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
  const db = getSupabaseAdmin();
  const code = await ensureOfferLink(db, body.propertyId);
  if (!code) return NextResponse.json({ error: 'Unknown listing' }, { status: 404 });
  const data = await getOfferData(db, code);
  if (!data) return NextResponse.json({ error: 'Could not build the page' }, { status: 500 });
  const url = offerUrl(code);
  return NextResponse.json({ code, url, optedOut: data.optedOut, drafts: offerDrafts(data, url) });
}
