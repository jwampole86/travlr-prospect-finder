import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { isValidEmail } from '@/lib/auth/signingAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createSigningEnvelope, resendEnvelopeNotification, voidEnvelope, DS_ENV, type DeliveryMode, type PrefillData, type SignerInfo } from '@/lib/services/docusignService';
import { syncEnvelope } from '@/lib/services/signingSync';
import { prepareContract } from '@/lib/services/contractService';
import type { ContractKind } from '@/lib/contracts/types';

// POST /api/docusign/resend  { sessionId, action: 'remind' | 'reissue', delivery?, signers?, prefill? }
//  remind  - email the signing link again on the same envelope.
//  reissue - void the current envelope and send a fresh one (use after fixing terms or an email address).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { sessionId?: string; action?: 'remind' | 'reissue'; delivery?: DeliveryMode; signers?: Array<{ name?: string; email?: string }>; prefill?: PrefillData };
    if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: session } = await db.from('signing_sessions')
      .select('id, lead_id, envelope_id, session_status, delivery_mode, prefill_data, resend_count, contract_kind, template_id, signing_signers(signer_name, signer_email, signer_order, signer_role)')
      .eq('id', body.sessionId).maybeSingle();
    if (!session) return NextResponse.json({ error: 'Signing session not found' }, { status: 404 });

    const auth = await requireLeadAccess(req, session.lead_id);
    if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (session.session_status === 'completed') return NextResponse.json({ error: 'This agreement is already signed' }, { status: 409 });

    if (body.action === 'remind') {
      if (session.session_status !== 'sent' || !session.envelope_id) return NextResponse.json({ error: 'Only an open agreement can be reminded' }, { status: 409 });
      const count = await resendEnvelopeNotification(session.envelope_id);
      if (!count) return NextResponse.json({ error: 'No emailed signer is waiting to sign. Use Resend to start a new signing link.' }, { status: 409 });
      return NextResponse.json({ reminded: count });
    }

    const existing = (session.signing_signers as Array<{ signer_name: string; signer_email: string; signer_order: number; signer_role: string }>)
      .filter((s) => s.signer_role === 'homeowner').sort((a, b) => a.signer_order - b.signer_order);
    const people = (body.signers?.length ? body.signers.map((s) => ({ name: String(s.name ?? '').trim(), email: String(s.email ?? '').trim().toLowerCase() })) : existing.map((s) => ({ name: s.signer_name, email: s.signer_email.toLowerCase() })));
    if (!people.length || people.some((p) => !p.name || !isValidEmail(p.email))) return NextResponse.json({ error: 'Every signer needs a name and a valid email address' }, { status: 400 });

    const delivery: DeliveryMode = body.delivery ?? (session.delivery_mode as DeliveryMode) ?? 'email';
    const prefill = (body.prefill ?? session.prefill_data) as PrefillData;
    const signers: SignerInfo[] = people.map((p, i) => ({ ...p, recipientId: String(i + 1), order: i + 1, ...(delivery === 'embedded' ? { clientUserId: `${session.lead_id}_signer_${i + 1}_${randomUUID()}` } : {}) }));

    // The old envelope must be dead before a new one is live, so a homeowner never holds two valid links.
    if (session.session_status === 'sent' && session.envelope_id) {
      try { await voidEnvelope(session.envelope_id, 'Replaced by a new signing link'); }
      catch (err) {
        await syncEnvelope(session.envelope_id).catch(() => {});
        return NextResponse.json({ error: err instanceof Error ? err.message : 'The current agreement could not be voided' }, { status: 409 });
      }
    }

    // Re-issue the same template version the agreement started from, so wording never changes under the signer.
    const contract = await prepareContract({ kind: session.contract_kind as ContractKind, templateId: session.template_id, values: prefill as Record<string, string>, signers });
    if (!contract.ok) return NextResponse.json({ error: contract.error }, { status: contract.status });
    const { envelopeId, status, counterSigner } = await createSigningEnvelope(signers, { html: contract.html, name: contract.template.title }, {
      delivery, emailSubject: contract.subject, counterSigner: contract.company.signer_name && contract.company.signer_email ? { name: contract.company.signer_name, email: contract.company.signer_email } : undefined,
    });
    await db.from('signing_sessions').update({
      document_html: contract.html,
      envelope_id: envelopeId, session_status: 'sent', delivery_mode: delivery, docusign_env: DS_ENV, prefill_data: prefill,
      voided_at: null, voided_reason: null, completion_processed_at: null, resend_count: (session.resend_count ?? 0) + 1,
    }).eq('id', session.id);
    await db.from('signing_signers').delete().eq('session_id', session.id);
    await db.from('signing_signers').insert([
      ...signers.map((s) => ({ session_id: session.id, signer_order: s.order, signer_name: s.name, signer_email: s.email, client_user_id: s.clientUserId ?? null, recipient_id: s.recipientId, signer_status: 'sent', signer_role: 'homeowner' })),
      { session_id: session.id, signer_order: signers.length + 1, signer_name: counterSigner.name, signer_email: counterSigner.email, client_user_id: null, recipient_id: String(signers.length + 1), signer_status: 'pending', signer_role: 'counter_signer' },
    ]);
    return NextResponse.json({ sessionId: session.id, envelopeId, status, delivery });
  } catch (err) {
    console.error('[resend] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not resend the agreement' }, { status: 500 });
  }
}
