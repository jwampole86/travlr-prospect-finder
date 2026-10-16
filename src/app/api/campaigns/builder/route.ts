import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { audienceSummaries, cancelCampaign, CHUNK_SIZE, finishCampaign, parseParams, planCampaign, previewCampaign, scheduleChunk } from '@/lib/services/campaignBuilder';

export const maxDuration = 300;

/** POST /api/campaigns/builder  (admin only). action: audiences | preview | plan | schedule | finish | cancel. Only "schedule" creates texts. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  // Everything below is limited to the signed-in user's organization.
  const orgId = auth.actor.organizationId;
  if (!orgId) return NextResponse.json({ error: 'Your account is not part of an organization.' }, { status: 403 });
  const reply = (out: object) => ('error' in out ? NextResponse.json(out, { status: 422 }) : NextResponse.json(out));
  try {
    switch (body?.action) {
      case 'audiences': return NextResponse.json({ audiences: await audienceSummaries(db, orgId), chunkSize: CHUNK_SIZE });
      case 'cancel': {
        const batch = String(body.batch ?? '');
        if (!batch) return NextResponse.json({ error: 'Choose a campaign' }, { status: 400 });
        return reply(await cancelCampaign(db, batch, orgId));
      }
    }
    const parsed = parseParams(body?.params);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    switch (body.action) {
      case 'preview': return reply(await previewCampaign(db, parsed.p, orgId));
      case 'plan': return reply(await planCampaign(db, parsed.p, orgId));
      case 'schedule': {
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (!ids.length || ids.length > CHUNK_SIZE) return NextResponse.json({ error: `Send between 1 and ${CHUNK_SIZE} leads at a time` }, { status: 400 });
        return reply(await scheduleChunk(db, parsed.p, ids, Math.max(0, Math.round(Number(body.budget) || 0)), orgId));
      }
      case 'finish': return reply(await finishCampaign(db, parsed.p, { screened: Number(body.screened) || 0, landline: Number(body.landline) || 0, invalid: Number(body.invalid) || 0 }));
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    console.error('campaign builder failed', e);
    return NextResponse.json({ error: 'Something went wrong. Nothing further was scheduled; check the campaign list before retrying.' }, { status: 500 });
  }
}
