import { NextRequest, NextResponse } from 'next/server';
import { authorizeSigning } from '@/lib/auth/signingAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getEmbeddedSigningUrl } from '@/lib/services/docusignService';

const originOf = (value: string | null | undefined) => { try { return value ? new URL(value).origin : null; } catch { return null; } };

// POST /api/docusign/signing-url  { sessionId, recipientId, returnUrl? }
// A fresh single-use signing link for someone signing on this device. The signer comes from our record,
// never from the request, and the caller must have access to the lead.
export async function POST(req: NextRequest) {
  try {
    const { sessionId, recipientId, returnUrl } = await req.json() as { sessionId?: string; recipientId?: string; returnUrl?: string };
    if (!sessionId || !recipientId) return NextResponse.json({ error: 'sessionId and recipientId are required' }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: session } = await db.from('signing_sessions')
      .select('id, lead_id, envelope_id, session_status, signing_signers(recipient_id, signer_name, signer_email, signer_order, client_user_id, signer_status, signer_role)')
      .eq('id', sessionId).maybeSingle();
    if (!session) return NextResponse.json({ error: 'Signing session not found' }, { status: 404 });

    const access = await authorizeSigning(req, session.lead_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const signer = (session.signing_signers as Array<{ recipient_id: string; signer_name: string; signer_email: string; signer_order: number; client_user_id: string | null; signer_status: string; signer_role: string }>)
      .find((s) => s.recipient_id === recipientId && s.signer_role === 'homeowner');
    if (!signer) return NextResponse.json({ error: 'Signer not found' }, { status: 404 });
    if (access.kind === 'homeowner' && signer.signer_email.toLowerCase() !== (access.actor.user.email ?? '').toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (session.session_status !== 'sent' || !session.envelope_id) return NextResponse.json({ error: 'This agreement is no longer open for signing' }, { status: 409 });
    if (!['sent', 'viewed'].includes(signer.signer_status)) return NextResponse.json({ error: 'This signer has already finished' }, { status: 409 });
    if (!signer.client_user_id) return NextResponse.json({ error: 'This agreement was emailed to the homeowner. Resend it for in-person signing, or ask them to use the email link.' }, { status: 409 });

    const allowed = new Set([originOf(process.env.NEXT_PUBLIC_SITE_URL), originOf(req.headers.get('origin')), req.nextUrl.origin].filter(Boolean) as string[]);
    const appOrigin = originOf(req.headers.get('origin')) ?? req.nextUrl.origin;
    const target = returnUrl && allowed.has(originOf(returnUrl) ?? '') ? returnUrl : `${appOrigin}/homeowner/documents?signing=complete`;

    const { url } = await getEmbeddedSigningUrl(session.envelope_id, {
      name: signer.signer_name, email: signer.signer_email, clientUserId: signer.client_user_id, recipientId: signer.recipient_id, order: signer.signer_order,
    }, target, appOrigin);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[signing-url] error:', message);
    return NextResponse.json({ error: 'Could not open the signing session' }, { status: 500 });
  }
}
