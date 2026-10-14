import 'server-only';
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getEnvelopeStatus, type EnvelopeSignerStatus } from '@/lib/services/docusignService';
import { activityService } from '@/lib/services/activityService';
import { advancePipeline } from '@/lib/services/leadPipeline';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { BRAND } from '@/config/brand';

const SIGNER_STATUS: Record<string, string> = {
  completed: 'signed', signed: 'signed', delivered: 'viewed', viewed: 'viewed',
  declined: 'declined', voided: 'voided', sent: 'sent', created: 'pending',
};

const SESSION_STATUS: Record<string, string> = { completed: 'completed', voided: 'voided', declined: 'declined' };

type Session = { id: string; lead_id: string; lead_address: string | null; lead_state: string | null; session_status: string; completion_processed_at: string | null; contract_kind: string; prefill_data: { documentType?: string } | null };

export type SyncResult = { found: boolean; status?: string; completedNow?: boolean };

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || BRAND.appUrl).replace(/\/$/, '');
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * Brings one session in line with DocuSign. DocuSign is asked for the truth, so a forged callback can never
 * change anything, and repeated or concurrent calls are safe: completion side effects run exactly once.
 */
export async function syncEnvelope(envelopeId: string): Promise<SyncResult> {
  const db = getSupabaseAdmin();
  const { data: session } = await db
    .from('signing_sessions')
    .select('id, lead_id, lead_address, lead_state, session_status, completion_processed_at, contract_kind, prefill_data')
    .eq('envelope_id', envelopeId)
    .maybeSingle<Session>();
  if (!session) return { found: false };

  const remote = await getEnvelopeStatus(envelopeId);
  const envelopeStatus = remote.status.toLowerCase();
  const next = SESSION_STATUS[envelopeStatus];
  const now = new Date().toISOString();

  // A completed session never goes backwards.
  if (session.session_status !== 'completed') {
    const update: Record<string, unknown> = { last_synced_at: now };
    if (next) update.session_status = next;
    if (next === 'completed') update.docusign_completed_at = remote.completedDateTime ?? now;
    if (next === 'voided') { update.voided_at = remote.voidedDateTime ?? now; update.voided_reason = remote.voidedReason ?? 'Voided in DocuSign'; }
    await db.from('signing_sessions').update(update).eq('id', session.id);
  } else {
    await db.from('signing_sessions').update({ last_synced_at: now }).eq('id', session.id);
  }

  await updateSigners(db, session.id, remote.recipients.signers);

  // Offer letters, co-host, agent and vendor contracts share these tables but are not homeowner deals: track status only.
  if (session.prefill_data?.documentType === 'candidate_offer_letter' || session.contract_kind !== 'homeowner_management') {
    if (next === 'completed' && !session.completion_processed_at) await db.from('signing_sessions').update({ completion_processed_at: now }).eq('id', session.id);
    return { found: true, status: next ?? envelopeStatus };
  }

  if (next === 'voided' && session.session_status !== 'voided') {
    await log(session, 'stage_changed', 'Partnership Agreement signing voided', remote.voidedReason ?? 'Voided', { envelopeId });
  }
  if (next === 'declined' && session.session_status !== 'declined') {
    await advancePipeline(db, session.lead_id, 'rejected');
    const who = remote.recipients.signers.find((s) => s.status === 'declined');
    await log(session, 'stage_changed', 'Homeowner declined to sign the Partnership Agreement', who?.declinedReason ?? undefined, { envelopeId });
  }

  let completedNow = false;
  if (next === 'completed' && !session.completion_processed_at) {
    // One winner claims the completion work; retries and parallel calls find it already claimed.
    const { data: claimed } = await db
      .from('signing_sessions')
      .update({ completion_processed_at: now })
      .eq('id', session.id)
      .is('completion_processed_at', null)
      .select('id');
    if (claimed?.length) {
      completedNow = true;
      await onCompleted(db, session, envelopeId, remote.completedDateTime ?? now);
    }
  }

  return { found: true, status: next ?? envelopeStatus, completedNow };
}

async function updateSigners(db: SupabaseClient, sessionId: string, remoteSigners: EnvelopeSignerStatus[]) {
  const { data: rows } = await db.from('signing_signers').select('id, recipient_id, signer_email').eq('session_id', sessionId);
  for (const row of rows ?? []) {
    const remote = remoteSigners.find((s) => s.recipientId === row.recipient_id)
      ?? remoteSigners.find((s) => s.email?.toLowerCase() === String(row.signer_email).toLowerCase());
    if (!remote) continue;
    const update: Record<string, unknown> = { signer_status: SIGNER_STATUS[remote.status?.toLowerCase()] ?? 'sent' };
    if (remote.signedDateTime) update.signed_at = remote.signedDateTime;
    if (remote.viewedDateTime) update.viewed_at = remote.viewedDateTime;
    if (remote.declinedDateTime) update.declined_at = remote.declinedDateTime;
    if (remote.declinedReason) update.decline_reason = remote.declinedReason;
    await db.from('signing_signers').update(update).eq('id', row.id);
  }
}

function log(session: Session, eventType: 'stage_changed' | 'note_added', description: string, detail: string | undefined, metadata: Record<string, unknown>, newValue?: string) {
  return activityService.record({
    leadId: session.lead_id,
    leadAddress: session.lead_address ?? undefined,
    leadState: session.lead_state ?? undefined,
    eventType,
    description,
    detail,
    newValue,
    source: 'docusign_webhook',
    metadata: { sessionId: session.id, ...metadata },
  }).then(undefined, () => {});
}

async function onCompleted(db: SupabaseClient, session: Session, envelopeId: string, completedAt: string) {
  const step = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[signing] ${name} failed:`, message);
      await log(session, 'note_added', `Signed agreement follow-up needs attention: ${name}`, message, { envelopeId });
    }
  };

  await step('move lead to Under Contract', async () => {
    await db.from('leads').update({ stage: 'Under Contract' }).eq('id', session.lead_id);
    await advancePipeline(db, session.lead_id, 'signed');
    await log(session, 'stage_changed', 'Partnership Agreement signed — lead moved to Under Contract', `DocuSign envelope ${envelopeId} completed`, { envelopeId }, 'Under Contract');
  });

  await step('start homeowner onboarding', async () => {
    const { data: existing } = await db.from('homeowner_onboarding').select('id').eq('lead_id', session.lead_id).maybeSingle();
    if (existing) return;
    await db.from('homeowner_onboarding').insert({ lead_id: session.lead_id, signing_session_id: session.id, stripe_connect_status: 'not_started', listing_activated: false });
    await db.from('leads').update({ onboarding_status: 'in_progress' }).eq('id', session.lead_id);
  });

  await step('create homeowner portal access', async () => {
    const { data: signer } = await db
      .from('signing_signers')
      .select('signer_name, signer_email')
      .eq('session_id', session.id)
      .eq('signer_role', 'homeowner')
      .order('signer_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (signer?.signer_email) await provisionHomeowner(db, session, signer.signer_email, signer.signer_name ?? 'Homeowner', envelopeId);
  });

  await step('create agent commission', async () => {
    const { data: lead } = await db.from('leads').select('assigned_agent_id, estimated_net_monthly').eq('id', session.lead_id).single();
    if (!lead?.assigned_agent_id) return;
    const { data: rule } = await db
      .from('commission_rules')
      .select('rate_percent, flat_amount, rule_type, agent_classification')
      .eq('agent_id', lead.assigned_agent_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const monthly = lead.estimated_net_monthly ?? 0;
    let amount = Math.round(monthly * 0.1);
    if (rule?.rule_type === 'percentage' && rule.rate_percent) amount = Math.round((monthly * rule.rate_percent) / 100);
    else if (rule?.rule_type === 'flat' && rule.flat_amount) amount = rule.flat_amount;

    const { error } = await db.from('agent_commission_payouts').upsert({
      agent_id: lead.assigned_agent_id,
      lead_id: session.lead_id,
      envelope_id: envelopeId,
      commission_amount: amount,
      commission_basis: monthly,
      rate_percent: rule?.rate_percent ?? 10,
      agent_classification: rule?.agent_classification ?? 'unknown',
      status: 'pending',
      trigger_event: 'docusign_completed',
      docusign_completed_at: completedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,agent_id' });
    if (error) throw new Error(error.message);

    await db.rpc('increment_agent_commission', { p_agent_id: lead.assigned_agent_id, p_amount: amount }).then(undefined, () => {});
    await log(session, 'note_added', `Commission record created: $${amount.toLocaleString()} pending for agent`, `DocuSign envelope ${envelopeId} completed. Commission basis: $${monthly}/mo net`, { envelopeId, commissionAmount: amount });
  });
}

/** Creates the homeowner's portal login (never emailing a password) and sends a link to set their own. */
async function provisionHomeowner(db: SupabaseClient, session: Session, email: string, name: string, envelopeId: string) {
  const redirectTo = `${siteUrl()}/homeowner`;
  const created = await db.auth.admin.createUser({
    email,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: name, role: 'homeowner', lead_id: session.lead_id, lead_address: session.lead_address, onboarding_redirect: '/homeowner/onboarding' },
  });

  let isNew = Boolean(created.data?.user);
  if (created.error && !/already|registered|exists/i.test(created.error.message)) throw new Error(created.error.message);

  const link = await db.auth.admin.generateLink({ type: isNew ? 'recovery' : 'magiclink', email, options: { redirectTo } });
  if (link.error || !link.data?.properties?.action_link) throw new Error(link.error?.message ?? 'Could not create a sign-in link');
  const userId = created.data?.user?.id ?? link.data.user?.id;

  if (isNew && userId) {
    await db.from('user_profiles').upsert({ id: userId, email, full_name: name, role: 'homeowner', lead_id: session.lead_id }, { onConflict: 'id' });
  } else if (userId) {
    // An existing login that is not a homeowner (e.g. a team member's own email) must never get a homeowner link.
    const { data: profile } = await db.from('user_profiles').select('role').eq('id', userId).maybeSingle();
    if (profile?.role && profile.role !== 'homeowner') return;
  }

  const address = escapeHtml(session.lead_address ?? 'your property');
  const { error } = await getResendClient().emails.send({
    from: getResendFrom(),
    to: [email],
    subject: `Your homeowner portal is ready — ${session.lead_address ?? 'your property'}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#2563eb">Welcome, ${escapeHtml(name)}</h2>
      <p>Your Partnership Agreement for <strong>${address}</strong> is signed. Your homeowner portal is ready: track your property, documents and bookings in one place.</p>
      <p style="margin:24px 0"><a href="${link.data.properties.action_link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">${isNew ? 'Set your password and sign in' : 'Sign in to your portal'}</a></p>
      <p style="color:#6b7280;font-size:13px">This link works once and expires soon. If it has expired, use "Forgot password" on the sign-in page.</p>
    </div>`,
  });
  if (error) throw new Error(`Resend homeowner welcome email failed: ${error.message}`);

  await log(session, 'note_added', `Homeowner portal access created for ${email}`, `Auto-provisioned on DocuSign completion${userId ? `. User ID: ${userId}` : ''}`, { envelopeId, homeownerUserId: userId });
}

/** Re-checks every open envelope (cron safety net for callbacks that never arrived). */
export async function reconcileOpenSessions(limit = 25): Promise<{ checked: number; changed: number; errors: number }> {
  const db = getSupabaseAdmin();
  const { data } = await db.from('signing_sessions').select('envelope_id, session_status')
    .eq('session_status', 'sent').not('envelope_id', 'is', null)
    .order('last_synced_at', { ascending: true, nullsFirst: true }).limit(limit);
  let changed = 0; let errors = 0;
  for (const row of data ?? []) {
    try {
      const r = await syncEnvelope(row.envelope_id as string);
      if (r.found && r.status && r.status !== 'sent' && r.status !== 'delivered') changed += 1;
    } catch { errors += 1; }
  }
  return { checked: data?.length ?? 0, changed, errors };
}
