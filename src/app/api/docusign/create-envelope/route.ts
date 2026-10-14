import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { isValidEmail } from '@/lib/auth/signingAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createSigningEnvelope, voidEnvelope, getDocuSignConfigStatus, DS_ENV, type DeliveryMode, type PrefillData, type SignerInfo } from '@/lib/services/docusignService';
import { prepareContract } from '@/lib/services/contractService';
import { activityService } from '@/lib/services/activityService';
import { advancePipeline } from '@/lib/services/leadPipeline';

// POST /api/docusign/create-envelope — admins and the agent assigned to the lead.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      leadId?: string;
      signers?: Array<{ name?: string; email?: string }>;
      prefill?: PrefillData;
      agentNotes?: string;
      delivery?: DeliveryMode;
    };
    const { leadId, prefill, agentNotes } = body;
    if (!leadId || !body.signers?.length || !prefill) return NextResponse.json({ error: 'leadId, signers and prefill are required' }, { status: 400 });

    const auth = await requireLeadAccess(req, leadId);
    if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const config = getDocuSignConfigStatus();
    if (!config.configured) return NextResponse.json({ error: `DocuSign is not configured (${config.missing.join(', ')}).` }, { status: 503 });

    const delivery: DeliveryMode = body.delivery === 'embedded' ? 'embedded' : 'email';
    const people = body.signers.map((s) => ({ name: String(s.name ?? '').trim(), email: String(s.email ?? '').trim().toLowerCase() }));
    if (people.length > 4) return NextResponse.json({ error: 'An agreement supports up to 4 homeowner signers' }, { status: 400 });
    if (people.some((p) => !p.name || !isValidEmail(p.email))) return NextResponse.json({ error: 'Every signer needs a name and a valid email address' }, { status: 400 });
    if (new Set(people.map((p) => p.email)).size !== people.length) return NextResponse.json({ error: 'Each signer needs a different email address' }, { status: 400 });

    const missingTerms: string[] = [];
    if (!prefill.managementFeePercent) missingTerms.push('Management Fee %');
    if (!prefill.termLengthMonths) missingTerms.push('Term Length (months)');
    if (!prefill.payoutSchedule) missingTerms.push('Payout Schedule');
    if (missingTerms.length) {
      return NextResponse.json({ error: `Missing required deal terms: ${missingTerms.join(', ')}. These must be set from the Proposal stage before initiating signing.` }, { status: 422 });
    }

    const db = getSupabaseAdmin();
    const { data: lead } = await db.from('leads').select('id, address, state').eq('id', leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { data: open } = await db.from('signing_sessions').select('id').eq('lead_id', leadId).eq('session_status', 'sent').limit(1);
    if (open?.length) return NextResponse.json({ error: 'An agreement is already out for signature on this lead. Send a reminder, resend, or void it first.' }, { status: 409 });

    const signers: SignerInfo[] = people.map((p, i) => ({
      ...p,
      recipientId: String(i + 1),
      order: i + 1,
      ...(delivery === 'embedded' ? { clientUserId: `${leadId}_signer_${i + 1}_${randomUUID()}` } : {}),
    }));

    const contract = await prepareContract({ kind: 'homeowner_management', values: prefill as Record<string, string>, signers });
    if (!contract.ok) return NextResponse.json({ error: contract.error }, { status: contract.status });

    const { envelopeId, status, counterSigner } = await createSigningEnvelope(signers, { html: contract.html, name: contract.template.title }, {
      delivery, emailSubject: contract.subject, counterSigner: contract.company.signer_name && contract.company.signer_email ? { name: contract.company.signer_name, email: contract.company.signer_email } : undefined,
    });

    const { data: session, error: sessionError } = await db
      .from('signing_sessions')
      .insert({
        user_id: auth.actor.user.id,
        lead_id: leadId,
        lead_address: lead.address,
        lead_state: lead.state,
        envelope_id: envelopeId,
        session_status: 'sent',
        delivery_mode: delivery,
        docusign_env: DS_ENV,
        contract_kind: 'homeowner_management',
        template_id: contract.template.id,
        template_version: contract.template.version,
        document_html: contract.html,
        prefill_data: prefill,
        agent_notes: agentNotes ?? null,
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      // Never leave an envelope out for signature that we cannot track.
      await voidEnvelope(envelopeId, 'Could not record the signing session').catch(() => {});
      console.error('[create-envelope] session insert error:', sessionError?.message);
      return NextResponse.json({ error: 'Failed to record the signing session. The agreement was not sent.' }, { status: 500 });
    }

    const rows = [
      ...signers.map((s) => ({ session_id: session.id, signer_order: s.order, signer_name: s.name, signer_email: s.email, client_user_id: s.clientUserId ?? null, recipient_id: s.recipientId, signer_status: 'sent', signer_role: 'homeowner' })),
      { session_id: session.id, signer_order: signers.length + 1, signer_name: counterSigner.name, signer_email: counterSigner.email, client_user_id: null, recipient_id: String(signers.length + 1), signer_status: 'pending', signer_role: 'counter_signer' },
    ];
    await db.from('signing_signers').insert(rows);
    await advancePipeline(db, leadId, 'offer_sent');
    await activityService.record({
      leadId, leadAddress: lead.address ?? undefined, leadState: lead.state ?? undefined,
      eventType: 'note_added',
      description: delivery === 'email' ? 'Partnership Agreement emailed to the homeowner for signature' : 'Partnership Agreement prepared for in-person signing',
      detail: `Sent to ${people.map((p) => p.email).join(', ')}`,
      source: 'docusign', metadata: { envelopeId, sessionId: session.id, delivery },
    }).then(undefined, () => {});

    return NextResponse.json({ sessionId: session.id, envelopeId, status, delivery });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-envelope] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
