import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { auditDetail, auditList } from '@/lib/services/estimateAudit';

export const maxDuration = 120;

/** GET /api/campaigns/estimate-audit?batch=all&scope=engaged|all  (admin): the estimate each texted homeowner sees, checked against the text we sent and the engine.
 *  GET ...?leadId=<id>[&benchmark=1]: one homeowner in full, optionally compared with an independent AirDNA estimate (one provider call). */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sp = req.nextUrl.searchParams; const db = getSupabaseAdmin();
  try {
    const leadId = sp.get('leadId');
    if (leadId) {
      const out = await auditDetail(db, leadId, sp.get('benchmark') === '1');
      return 'error' in out ? NextResponse.json(out, { status: 404 }) : NextResponse.json(out);
    }
    return NextResponse.json(await auditList(db, sp.get('batch') || 'all', sp.get('scope') === 'all' ? 'all' : 'engaged'));
  } catch (e) {
    console.error('estimate audit failed', e);
    return NextResponse.json({ error: 'Could not build the estimate check.' }, { status: 500 });
  }
}
