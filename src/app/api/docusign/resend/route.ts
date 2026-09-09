import { NextRequest, NextResponse } from 'next/server';
import { createSigningEnvelope, type SignerInfo, type PrefillData } from '@/lib/services/docusignService';
import { createClient } from '@supabase/supabase-js';

// POST /api/docusign/resend
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sessionId: string;
      signers: SignerInfo[];
      prefill: PrefillData;
    };

    const { sessionId, signers, prefill } = body;

    if (!sessionId || !signers?.length) {
      return NextResponse.json({ error: 'sessionId and signers are required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Create a fresh envelope
    const { envelopeId, status } = await createSigningEnvelope(signers, prefill);

    // Update session with new envelope ID and reset status
    const { data: session } = await supabase
      .from('signing_sessions')
      .select('resend_count')
      .eq('id', sessionId)
      .single();

    await supabase
      .from('signing_sessions')
      .update({
        envelope_id: envelopeId,
        session_status: 'sent',
        voided_at: null,
        voided_reason: null,
        prefill_data: prefill,
        resend_count: ((session as { resend_count: number } | null)?.resend_count ?? 0) + 1,
      })
      .eq('id', sessionId);

    // Reset signer statuses
    await supabase
      .from('signing_signers')
      .update({ signer_status: 'sent', viewed_at: null, signed_at: null })
      .eq('session_id', sessionId);

    return NextResponse.json({ sessionId, envelopeId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[resend] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
