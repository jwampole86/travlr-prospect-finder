import { NextRequest, NextResponse } from 'next/server';
import { voidEnvelope } from '@/lib/services/docusignService';
import { createClient } from '@supabase/supabase-js';

// POST /api/docusign/void
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sessionId: string;
      envelopeId: string;
      reason: string;
    };

    const { sessionId, envelopeId, reason } = body;

    if (!sessionId || !envelopeId || !reason) {
      return NextResponse.json({ error: 'sessionId, envelopeId, and reason are required' }, { status: 400 });
    }

    await voidEnvelope(envelopeId, reason);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase
      .from('signing_sessions')
      .update({
        session_status: 'voided',
        voided_at: new Date().toISOString(),
        voided_reason: reason,
      })
      .eq('id', sessionId);

    await supabase
      .from('signing_signers')
      .update({ signer_status: 'voided' })
      .eq('session_id', sessionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[void] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
