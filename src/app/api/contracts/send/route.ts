import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { isValidEmail } from '@/lib/auth/signingAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createSigningEnvelope, voidEnvelope, getDocuSignConfigStatus, DS_ENV, type SignerInfo } from '@/lib/services/docusignService';
import { prepareContract } from '@/lib/services/contractService';
import type { ContractKind } from '@/lib/contracts/types';

// POST /api/contracts/send — admins send a non-homeowner contract (co-host, agent, vendor) for signature by email.
// Homeowner agreements go through /api/docusign/create-envelope so they stay tied to a lead.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminActor(req);
    if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json() as { kind?: ContractKind; signers?: Array<{ name?: string; email?: string }>; values?: Record<string, string>; contextId?: string; contextLabel?: string };
    if (!body.kind || body.kind === 'homeowner_management' || !body.signers?.length || !body.values) return NextResponse.json({ error: 'kind (cohost_partner, agent_contractor or vendor_service), signers and values are required' }, { status: 400 });

    const config = getDocuSignConfigStatus();
    if (!config.configured) return NextResponse.json({ error: `DocuSign is not configured (${config.missing.join(', ')}).` }, { status: 503 });

    const people = body.signers.map((s) => ({ name: String(s.name ?? '').trim(), email: String(s.email ?? '').trim().toLowerCase() }));
    if (people.some((p) => !p.name || !isValidEmail(p.email))) return NextResponse.json({ error: 'Every signer needs a name and a valid email address' }, { status: 400 });
    if (new Set(people.map((p) => p.email)).size !== people.length) return NextResponse.json({ error: 'Each signer needs a different email address' }, { status: 400 });

    const signers: SignerInfo[] = people.map((p, i) => ({ ...p, recipientId: String(i + 1), order: i + 1 }));
    const contract = await prepareContract({ kind: body.kind, values: body.values, signers });
    if (!contract.ok) return NextResponse.json({ error: contract.error }, { status: contract.status });

    const { envelopeId, counterSigner } = await createSigningEnvelope(signers, { html: contract.html, name: contract.template.title }, {
      delivery: 'email', emailSubject: contract.subject,
      counterSigner: contract.company.signer_name && contract.company.signer_email ? { name: contract.company.signer_name, email: contract.company.signer_email } : undefined,
    });

    const db = getSupabaseAdmin();
    const { data: session, error } = await db.from('signing_sessions').insert({
      user_id: auth.actor.user.id,
      lead_id: body.contextId?.trim() || `${body.kind}:${randomUUID()}`,
      lead_address: body.contextLabel?.trim() || `${contract.template.title} — ${people[0].name}`,
      envelope_id: envelopeId, session_status: 'sent', delivery_mode: 'email', docusign_env: DS_ENV,
      contract_kind: body.kind, template_id: contract.template.id, template_version: contract.template.version,
      document_html: contract.html, prefill_data: body.values,
    }).select('id').single();
    if (error || !session) {
      await voidEnvelope(envelopeId, 'Could not record the signing session').catch(() => {});
      return NextResponse.json({ error: 'Failed to record the signing session. The contract was not sent.' }, { status: 500 });
    }
    await db.from('signing_signers').insert([
      ...signers.map((s) => ({ session_id: session.id, signer_order: s.order, signer_name: s.name, signer_email: s.email, client_user_id: null, recipient_id: s.recipientId, signer_status: 'sent', signer_role: 'homeowner' })),
      { session_id: session.id, signer_order: signers.length + 1, signer_name: counterSigner.name, signer_email: counterSigner.email, client_user_id: null, recipient_id: String(signers.length + 1), signer_status: 'pending', signer_role: 'counter_signer' },
    ]);
    return NextResponse.json({ sessionId: session.id, envelopeId, sandbox: DS_ENV === 'demo' });
  } catch (err) {
    console.error('[contracts/send]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the contract' }, { status: 500 });
  }
}
