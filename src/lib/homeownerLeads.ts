import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeLeadFingerprint } from '@/lib/masterHomeownerData';
import { parseAddress } from '@/lib/homeownerEstimate';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';
import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';

type Db = ReturnType<typeof getSupabaseAdmin>;

export interface HomeownerContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  smsConsent?: boolean;
}

export interface HomeownerLeadResult {
  leadId: string;
  merged: boolean;
  assignedTo: string | null;
  address: string;
  city: string;
  state: string;
}

const TAG = 'Inbound \u2014 Self-Qualified';

/** Creates the homeowner's lead, or attaches the submission to the lead we already have for that address. */
export async function upsertHomeownerLead(db: Db, input: {
  address: string;
  report: HomeownerReport;
  contact: HomeownerContact;
  origin: 'estimate_form' | 'call_request' | 'question';
  qualification?: Record<string, unknown>;
  summary?: string;
}): Promise<HomeownerLeadResult> {
  const { report, contact, origin } = input;
  const a = parseAddress(input.address);
  const street = a.street || input.address;
  const fingerprint = normalizeLeadFingerprint(street, a.city, a.state);
  const expected = report.scenarios[1];
  const now = new Date().toISOString();
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const sms = contact.smsConsent === true;

  const submission = {
    submitted_at: now,
    origin,
    estimate_shown: {
      adr: expected.adr, occupancy: expected.occupancy, gross_monthly: expected.grossMonthly,
      net_monthly: expected.netMonthly, annual_net: expected.annualNet, long_term_rent: report.longTermRent,
      regulation: report.regulation.status, basis: report.basis,
    },
    contact_capture: { first_name: contact.firstName, last_name: contact.lastName, phone: contact.phone, email: contact.email },
    optional_questionnaire: input.qualification ?? null,
    claude_summary: input.summary ?? null,
  };

  // Existing lead: exact address fingerprint first, then street + city + state.
  let existing: { id: string; contact_name: string | null; contact_phone: string | null; primary_agent_id: string | null; landing_page_submission: unknown } | null = null;
  const cols = 'id,contact_name,contact_phone,primary_agent_id,landing_page_submission';
  if (fingerprint) {
    const { data } = await db.from('leads').select(cols).eq('address_fingerprint', fingerprint).or('is_synthetic.is.null,is_synthetic.eq.false').limit(1).maybeSingle();
    existing = data ?? null;
  }
  if (!existing && a.state && /^\d+/.test(street)) {
    const safe = street.replace(/[%_\\,()]/g, ' ').replace(/\s+/g, ' ').trim();
    const { data } = await db.from('leads').select(`${cols},city`).eq('state', a.state).ilike('address', `${safe}%`).or('is_synthetic.is.null,is_synthetic.eq.false').limit(5);
    existing = (data ?? []).find(l => !a.city || String((l as { city?: string }).city || '').toLowerCase() === a.city.toLowerCase()) ?? null;
  }

  if (existing) {
    const prior = existing.landing_page_submission ? [existing.landing_page_submission] : [];
    const update: Record<string, unknown> = {
      lead_status_tag: TAG,
      landing_page_submission: { ...submission, previous: prior.slice(0, 3) },
      contact_info_requested: true,
      contact_info_requested_at: now,
      email_opt_in: true,
      email_opt_in_at: now,
      opt_in_source: 'estimate_landing_page',
      is_synthetic: false,
      priority_tier: 1,
    };
    if (!existing.contact_name && fullName) update.contact_name = fullName;
    if (!existing.contact_phone && contact.phone) { update.contact_phone = contact.phone; update.has_phone = true; }
    if (sms) { update.sms_opt_in = true; update.sms_opt_in_at = now; }
    const { error } = await db.from('leads').update(update).eq('id', existing.id);
    if (error) throw new Error(`Could not update lead: ${error.message}`);
    return { leadId: existing.id, merged: true, assignedTo: existing.primary_agent_id, address: street, city: a.city, state: a.state };
  }

  const id = `lead-estimate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const row: Record<string, unknown> = {
    id,
    address: street,
    city: a.city,
    state: a.state,
    zip: a.zip,
    source: 'Direct',
    lead_source_type: 'self_submitted',
    lead_status_tag: TAG,
    stage: 'New Lead',
    contact_name: fullName,
    contact_phone: contact.phone || null,
    has_phone: Boolean(contact.phone),
    email_opt_in: true,
    email_opt_in_at: now,
    sms_opt_in: sms,
    sms_opt_in_at: sms ? now : null,
    opt_in_source: 'estimate_landing_page',
    landing_page_submission: submission,
    notes: input.summary ?? `Homeowner requested a revenue estimate for ${input.address}.`,
    contact_info_requested: true,
    contact_info_requested_at: now,
    is_synthetic: false,
    priority_tier: 1,
    estimated_adr: expected.adr,
    estimated_occupancy: expected.occupancy,
    estimated_gross_monthly: expected.grossMonthly,
    estimated_net_monthly: expected.netMonthly,
    estimated_monthly_rent_ai: report.longTermRent,
    estimated_monthly_rent_ai_source: 'HOMEOWNER_ESTIMATE',
    estimated_monthly_rent_ai_confidence: report.basis === 'PROPERTY' ? 'MEDIUM' : 'LOW',
    estimated_monthly_rent_ai_at: now,
    calculation_version: 'homeowner-estimate',
    calculated_at: now,
  };
  if (report.property.beds) row.beds = report.property.beds;
  if (report.property.baths) row.baths = report.property.baths;

  const { error } = await db.from('leads').insert(row);
  if (error) throw new Error(`Could not create lead: ${error.message}`);
  await rescoreLeadsByIds(db as never, [id]).catch(() => 0);
  return { leadId: id, merged: false, assignedTo: null, address: street, city: a.city, state: a.state };
}

/** Records the interaction on the lead timeline and activity feed. Failures never block the homeowner. */
export async function logHomeownerActivity(db: Db, lead: HomeownerLeadResult, input: { title: string; body: string; kind: string; metadata?: Record<string, unknown> }) {
  const now = new Date().toISOString();
  // activity_events requires an owning account; inbound homeowner events belong to the first admin/owner.
  const { data: owner } = await db.from('user_profiles').select('id').in('app_role', ['owner', 'admin']).order('created_at', { ascending: true }).limit(1).maybeSingle();
  await Promise.allSettled([
    owner?.id ? db.from('activity_events').insert({
      user_id: owner.id,
      lead_id: lead.leadId, lead_address: lead.address, lead_state: lead.state,
      event_type: lead.merged ? 'note_added' : 'lead_created',
      description: input.title, detail: input.body, source: 'estimate_page',
      metadata: { kind: input.kind, ...(input.metadata ?? {}) }, event_timestamp: now,
    }) : Promise.resolve(null),
    db.from('lead_activity_log').insert({
      lead_id: lead.leadId, activity_type: input.kind,
      activity_data: { title: input.title, body: input.body, ...(input.metadata ?? {}) }, performed_by_name: 'Homeowner (estimate page)',
    }),
  ]);
}

export async function createFollowUpTask(db: Db, lead: HomeownerLeadResult, input: { title: string; description: string; type: 'call' | 'email'; due: Date }) {
  const { error } = await db.from('lead_tasks').insert({
    lead_id: lead.leadId, title: input.title, description: input.description, task_type: input.type,
    status: 'pending', priority: 'high', due_date: input.due.toISOString(), assigned_to: lead.assignedTo,
  });
  return !error;
}
