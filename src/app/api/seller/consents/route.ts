import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { authorizationFor, currentConsents, recordConsent } from '@/lib/seller/consentLedger';
import { CONSENT_PURPOSES, type ConsentPurpose } from '@/lib/seller/types';

/** GET ?leadId= returns the current permission for each purpose plus the full history. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const leadId = req.nextUrl.searchParams.get('leadId');
  if (!leadId) return fail('leadId is required');
  const [current, history] = await Promise.all([
    currentConsents(ctx.db, leadId),
    ctx.db.from('consent_records').select('purpose, granted, source, evidence, channels, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(100),
  ]);
  return NextResponse.json({ current, history: history.data ?? [] });
}

/** POST { leadId, purpose, granted, source, evidence?, channels? } records a permission, or withdraws it when granted is false. */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = await req.json().catch(() => ({})) as { leadId?: string; purpose?: string; granted?: boolean; source?: string; evidence?: string; channels?: string[] };
  if (!body.leadId || !body.purpose || typeof body.granted !== 'boolean') return fail('leadId, purpose and granted are required');
  if (!(CONSENT_PURPOSES as readonly string[]).includes(body.purpose)) return fail('Unknown purpose');
  const purpose = body.purpose as ConsentPurpose;
  if (body.granted) {
    const blocked = await authorizationFor(ctx.db, body.leadId, purpose);
    if (blocked.status === 'blocked' && blocked.reasons.some((r) => r.includes('do-not-text'))) {
      return fail('This number is on the do-not-text list. Permission cannot be recorded until the owner opts back in.', 409);
    }
  }
  try {
    await recordConsent(ctx.db, {
      leadId: body.leadId, purpose, granted: body.granted, source: body.source || 'manual', evidence: body.evidence,
      channels: body.channels, recordedBy: ctx.actor.user.id, organizationId: ctx.orgId,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not record permission', 422);
  }
  return NextResponse.json({ ok: true, current: await currentConsents(ctx.db, body.leadId) });
}
