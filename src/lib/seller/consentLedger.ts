import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { toE164 } from '@/lib/services/smsConsent';
import { CONSENT_PURPOSES, type Authorization, type ConsentPurpose } from './types';

type Db = ReturnType<typeof getSupabaseAdmin>;

export type ConsentInput = {
  leadId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  source: string;
  channels?: string[];
  evidence?: string | null;
  phone?: string | null;
  email?: string | null;
  recordedBy?: string | null;
  organizationId?: string | null;
};

/** Adds a row to the append-only ledger. A revocation is a row with granted = false, so the history is never overwritten. */
export async function recordConsent(db: Db, input: ConsentInput) {
  const row: Record<string, unknown> = {
    lead_id: input.leadId,
    purpose: input.purpose,
    granted: input.granted,
    source: input.source,
    channels: input.channels ?? [],
    evidence: input.evidence?.slice(0, 500) ?? null,
    phone_e164: toE164(input.phone) ?? null,
    email: input.email ?? null,
    recorded_by: input.recordedBy ?? null,
  };
  if (input.organizationId) row.organization_id = input.organizationId;
  const { error } = await db.from('consent_records').insert(row);
  if (error) throw new Error(error.message);
}

/** An opt-out or STOP withdraws every purpose at once. */
export async function revokeAllConsent(db: Db, input: { leadId: string; source: string; evidence?: string | null; phone?: string | null }) {
  const rows = CONSENT_PURPOSES.map((purpose) => ({
    lead_id: input.leadId, purpose, granted: false, source: input.source,
    evidence: input.evidence?.slice(0, 500) ?? null, phone_e164: toE164(input.phone) ?? null, channels: [] as string[],
  }));
  await db.from('consent_records').insert(rows);
}

export type ConsentState = { purpose: ConsentPurpose; granted: boolean; source: string; at: string; channels: string[] };

/** The newest ledger row for each purpose. */
export async function currentConsents(db: Db, leadId: string): Promise<ConsentState[]> {
  const { data } = await db.from('consent_records').select('purpose, granted, source, created_at, channels')
    .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200);
  const seen = new Map<string, ConsentState>();
  for (const r of data ?? []) {
    if (!seen.has(r.purpose)) seen.set(r.purpose, { purpose: r.purpose, granted: r.granted, source: r.source, at: r.created_at, channels: r.channels ?? [] });
  }
  return [...seen.values()];
}

/**
 * The hard gate for what may happen next. No score overrides it: an opt-out, a withdrawn permission or a missing
 * permission for this purpose stops the step.
 */
export async function authorizationFor(db: Db, leadId: string, purpose: ConsentPurpose): Promise<{ status: Authorization; reasons: string[] }> {
  const { data: lead } = await db.from('leads').select('contact_phone, sms_opted_out_at').eq('id', leadId).maybeSingle();
  const reasons: string[] = [];
  const e164 = toE164(lead?.contact_phone);
  if (e164) {
    const { data: suppressed } = await db.from('sms_suppressions').select('phone_e164').eq('phone_e164', e164).maybeSingle();
    if (suppressed) reasons.push('The phone number is on the do-not-text list.');
  }
  const consents = await currentConsents(db, leadId);
  const mine = consents.find((c) => c.purpose === purpose);
  if (mine && !mine.granted) reasons.push('Permission for this purpose was withdrawn.');
  if (lead?.sms_opted_out_at && !mine?.granted) reasons.push('The owner opted out of texts.');
  if (reasons.length) return { status: 'blocked', reasons };
  if (!mine?.granted) return { status: 'needs_permission', reasons: [`No recorded permission for: ${purpose.replace(/_/g, ' ')}.`] };
  return { status: 'authorized', reasons: [] };
}
