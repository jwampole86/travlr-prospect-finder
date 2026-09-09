import { NextRequest, NextResponse } from 'next/server';

import { createSigningEnvelope, type SignerInfo, type PrefillData,  } from '@/lib/services/docusignService';
import { createClient as createServerClient } from '@supabase/supabase-js';

// POST /api/docusign/create-envelope
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      leadId: string;
      leadAddress?: string;
      leadState?: string;
      signers: SignerInfo[];
      prefill: PrefillData;
      agentNotes?: string;
    };

    const { leadId, leadAddress, leadState, signers, prefill, agentNotes } = body;

    if (!leadId || !signers?.length) {
      return NextResponse.json({ error: 'leadId and signers are required' }, { status: 400 });
    }

    // Validate that deal-specific terms are present (never silently default)
    const missingTerms: string[] = [];
    if (!prefill.managementFeePercent) missingTerms.push('Management Fee %');
    if (!prefill.termLengthMonths) missingTerms.push('Term Length (months)');
    if (!prefill.payoutSchedule) missingTerms.push('Payout Schedule');

    if (missingTerms.length > 0) {
      return NextResponse.json(
        { error: `Missing required deal terms: ${missingTerms.join(', ')}. These must be set from the Proposal stage before initiating signing.` },
        { status: 422 }
      );
    }

    // Create DocuSign envelope
    const { envelopeId, status } = await createSigningEnvelope(signers, prefill);

    // Persist session to Supabase (service role for server-side)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get current user from auth header
    const authHeader = req.headers.get('authorization');
    let userId: string | null = null;
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = data.user?.id ?? null;
    }

    const { data: session, error: sessionError } = await supabase
      .from('signing_sessions')
      .insert({
        user_id: userId,
        lead_id: leadId,
        lead_address: leadAddress,
        lead_state: leadState,
        envelope_id: envelopeId,
        session_status: 'sent',
        prefill_data: prefill,
        agent_notes: agentNotes ?? null,
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('[create-envelope] session insert error:', sessionError.message);
      return NextResponse.json({ error: 'Failed to persist signing session' }, { status: 500 });
    }

    // Persist signers
    const signerRows = signers.map((s) => ({
      session_id: session.id,
      signer_order: s.order,
      signer_name: s.name,
      signer_email: s.email,
      client_user_id: s.clientUserId,
      recipient_id: s.recipientId,
      signer_status: 'sent',
    }));

    await supabase.from('signing_signers').insert(signerRows);

    return NextResponse.json({ sessionId: session.id, envelopeId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-envelope] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
