import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { createOfferLetterEnvelope, type OfferLetterSigner } from '@/lib/services/docusignService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      candidateId?: string;
      candidateName: string;
      candidateEmail: string;
      roleTitle: string;
      startDate?: string;
      offerExpiryDate?: string;
      letterHtml: string;
      signer?: OfferLetterSigner;
    };

    if (!body.candidateName?.trim()) {
      return NextResponse.json({ error: 'Candidate name is required' }, { status: 400 });
    }
    if (!body.candidateEmail?.trim()) {
      return NextResponse.json({ error: 'Candidate email is required' }, { status: 400 });
    }
    if (!body.roleTitle?.trim()) {
      return NextResponse.json({ error: 'Role title is required' }, { status: 400 });
    }
    if (!body.letterHtml?.trim()) {
      return NextResponse.json({ error: 'Offer letter HTML is required' }, { status: 400 });
    }

    const signer: OfferLetterSigner = body.signer ?? {
      name: body.candidateName,
      email: body.candidateEmail,
      recipientId: '1',
      order: 1,
    };

    const { envelopeId, status } = await createOfferLetterEnvelope(
      [signer],
      body.letterHtml,
      `TRAVLR Offer Letter — ${body.roleTitle}`
    );

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
        lead_id: body.candidateId ? `candidate-offer-${body.candidateId}` : `candidate-offer-${Date.now()}`,
        lead_address: `Offer Letter — ${body.candidateName}`,
        envelope_id: envelopeId,
        session_status: 'sent',
        prefill_data: {
          documentType: 'candidate_offer_letter',
          candidateId: body.candidateId ?? null,
          candidateName: body.candidateName,
          candidateEmail: body.candidateEmail,
          roleTitle: body.roleTitle,
          startDate: body.startDate ?? null,
          offerExpiryDate: body.offerExpiryDate ?? null,
        },
        agent_notes: `Candidate offer letter for ${body.roleTitle}. Start: ${body.startDate || 'not set'}.`,
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('[create-offer-envelope] session insert error:', sessionError.message);
      return NextResponse.json({ error: 'Offer sent, but failed to persist signing session', envelopeId, status }, { status: 500 });
    }

    await supabase.from('signing_signers').insert({
      session_id: session.id,
      signer_order: signer.order,
      signer_name: signer.name,
      signer_email: signer.email,
      client_user_id: `candidate-offer-${body.candidateId ?? Date.now()}`,
      recipient_id: signer.recipientId,
      signer_status: 'sent',
    });

    if (body.candidateId) {
      await supabase
        .from('candidates')
        .update({
          pipeline_status: 'HIRED',
          candidate_status: 'HIRED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.candidateId);
    }

    return NextResponse.json({ sessionId: session.id, envelopeId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-offer-envelope] error:', message);
    const status = message.includes('DocuSign credentials not configured') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
