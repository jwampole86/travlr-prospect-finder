import { NextRequest, NextResponse } from 'next/server';
import { authorizeSigning } from '@/lib/auth/signingAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { syncEnvelope } from '@/lib/services/signingSync';

// GET /api/docusign/sessions?leadId=xxx[&sync=1]
// sync=1 asks DocuSign for the latest state of open agreements first, so the screen never waits on a callback.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');
    if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });

    const access = await authorizeSigning(req, leadId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const db = getSupabaseAdmin();
    const columns = 'id, lead_id, envelope_id, session_status, delivery_mode, docusign_env, prefill_data, docusign_completed_at, voided_at, voided_reason, resend_count, agent_notes, created_at, signing_signers(id, session_id, signer_order, signer_name, signer_email, recipient_id, signer_status, signer_role, viewed_at, signed_at, declined_at, decline_reason, client_user_id)';

    if (searchParams.get('sync') === '1') {
      const { data: open } = await db.from('signing_sessions').select('envelope_id').eq('lead_id', leadId).eq('session_status', 'sent').not('envelope_id', 'is', null);
      await Promise.all((open ?? []).map((s) => syncEnvelope(s.envelope_id as string).catch(() => null)));
    }

    const { data, error } = await db.from('signing_sessions').select(columns).eq('lead_id', leadId).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The embedded-signing id is a server detail; the screen only needs to know whether signing on this device is possible.
    const sessions = (data ?? []).map((s) => {
      const signers = (s.signing_signers as Array<Record<string, unknown>>).map(({ client_user_id, ...rest }) => ({ ...rest, can_sign_now: Boolean(client_user_id) }));
      return { ...s, signing_signers: signers };
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[sessions] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load signing sessions' }, { status: 500 });
  }
}
