import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { voidEnvelope } from '@/lib/services/docusignService';
import { syncEnvelope } from '@/lib/services/signingSync';
import { activityService } from '@/lib/services/activityService';

// POST /api/docusign/void  { sessionId, reason } — admins and the assigned agent.
export async function POST(req: NextRequest) {
  try {
    const { sessionId, reason } = await req.json() as { sessionId?: string; reason?: string };
    if (!sessionId || !reason?.trim()) return NextResponse.json({ error: 'sessionId and reason are required' }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: session } = await db.from('signing_sessions').select('id, lead_id, lead_address, lead_state, envelope_id, session_status').eq('id', sessionId).maybeSingle();
    if (!session) return NextResponse.json({ error: 'Signing session not found' }, { status: 404 });

    const auth = await requireLeadAccess(req, session.lead_id);
    if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (session.session_status !== 'sent' && session.session_status !== 'draft') return NextResponse.json({ error: `A ${session.session_status} agreement cannot be voided` }, { status: 409 });

    if (session.envelope_id) {
      try { await voidEnvelope(session.envelope_id, reason.trim()); }
      catch (err) {
        // The envelope may have finished in DocuSign moments ago; trust DocuSign's state over ours.
        await syncEnvelope(session.envelope_id).catch(() => {});
        return NextResponse.json({ error: err instanceof Error ? err.message : 'DocuSign could not void the agreement' }, { status: 409 });
      }
    }

    await db.from('signing_sessions').update({ session_status: 'voided', voided_at: new Date().toISOString(), voided_reason: reason.trim() }).eq('id', sessionId);
    await db.from('signing_signers').update({ signer_status: 'voided' }).eq('session_id', sessionId);
    await activityService.record({
      leadId: session.lead_id, leadAddress: session.lead_address ?? undefined, leadState: session.lead_state ?? undefined,
      eventType: 'note_added', description: 'Partnership Agreement voided', detail: reason.trim(), source: 'docusign', metadata: { sessionId },
    }).then(undefined, () => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[void] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not void the agreement' }, { status: 500 });
  }
}
