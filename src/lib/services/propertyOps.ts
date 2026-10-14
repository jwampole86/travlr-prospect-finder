import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const ONBOARDING_TEMPLATE: Array<{ key: string; title: string; detail: string; auto?: boolean }> = [
  { key: 'agreement_signed', title: 'Management agreement signed', detail: 'Completed automatically when DocuSign finishes.', auto: true },
  { key: 'owner_portal', title: 'Owner portal access created', detail: 'Created automatically after signing so the owner can see bookings and statements.', auto: true },
  { key: 'owner_details', title: 'Owner contact and mailing details confirmed', detail: 'Phone, email, preferred contact method, mailing address for tax forms.' },
  { key: 'payout_setup', title: 'Payout details confirmed', detail: 'The owner finishes bank details in their portal.', auto: true },
  { key: 'permits_insurance', title: 'Permits, licenses and insurance verified', detail: 'STR permit or lodging registration, and liability insurance that allows rental use.' },
  { key: 'access_setup', title: 'Access and lock codes received', detail: 'Smart-lock or key plan, alarm details, parking and trash instructions.' },
  { key: 'photos', title: 'Photography scheduled and delivered', detail: 'Listing photos approved for publishing.' },
  { key: 'house_rules_pricing', title: 'House rules and starting pricing approved', detail: 'Owner has signed off on rules, minimum stays and opening nightly rates.' },
  { key: 'listing_live', title: 'Listing live on booking platforms', detail: 'Completed automatically when the owner activates the listing.', auto: true },
  { key: 'calendar_sync', title: 'Booking calendars connected', detail: 'Platform calendars synced so turnovers can be planned.' },
  { key: 'welcome_call', title: 'Welcome call with the owner', detail: 'Walk through reporting, payouts and who to contact.' },
];

export const DEFAULT_CHECKLIST = ['Kitchen cleaned and dishes put away', 'Bathrooms cleaned, towels replaced', 'Bedrooms made with fresh linens', 'Living areas dusted and vacuumed', 'Trash removed and bins reset', 'Supplies restocked (soap, paper goods, coffee)', 'Checked for damage or missing items', 'Doors locked and thermostat set'];

type Db = SupabaseClient;
const today = () => new Date().toISOString().slice(0, 10);

/** Creates (or refreshes) the managed-property record for a lead and seeds its onboarding tasks. */
export async function ensureManagedProperty(db: Db, leadId: string, opts: { sessionId?: string | null; createdBy?: string | null } = {}) {
  const { data: lead } = await db.from('leads').select('id, address, city, state, owner_name, contact_name, contact_phone').eq('id', leadId).maybeSingle();
  if (!lead) throw new Error('Lead not found');

  const sessionQuery = db.from('signing_sessions').select('id, prefill_data, docusign_completed_at, session_status, signing_signers(signer_name, signer_email, signer_order, signer_role)').eq('lead_id', leadId).eq('contract_kind', 'homeowner_management');
  const { data: sessions } = opts.sessionId ? await sessionQuery.eq('id', opts.sessionId) : await sessionQuery.order('created_at', { ascending: false }).limit(1);
  const session = sessions?.[0];
  const prefill = (session?.prefill_data ?? {}) as Record<string, string>;
  const signer = (session?.signing_signers as Array<{ signer_name: string; signer_email: string; signer_order: number; signer_role: string }> | undefined)?.filter((s) => s.signer_role === 'homeowner').sort((a, b) => a.signer_order - b.signer_order)[0];

  const row = {
    lead_id: leadId,
    address: lead.address,
    city: lead.city ?? null,
    state: lead.state ?? null,
    owner_name: prefill.homeownerName || signer?.signer_name || lead.owner_name || lead.contact_name || null,
    owner_email: prefill.homeownerEmail || signer?.signer_email || null,
    owner_phone: prefill.homeownerPhone || lead.contact_phone || null,
    management_fee_percent: prefill.managementFeePercent ? Number(prefill.managementFeePercent) : null,
    payout_schedule: prefill.payoutSchedule || null,
    signing_session_id: session?.id ?? null,
    agreement_signed_at: session?.session_status === 'completed' ? session.docusign_completed_at : null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db.from('managed_properties').select('id').eq('lead_id', leadId).maybeSingle();
  let id = existing?.id as string | undefined;
  if (id) {
    await db.from('managed_properties').update(row).eq('id', id);
  } else {
    const { data, error } = await db.from('managed_properties').insert({ ...row, created_by: opts.createdBy ?? null }).select('id').single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }

  await db.from('onboarding_tasks').upsert(
    ONBOARDING_TEMPLATE.map((t, i) => ({ property_id: id, key: t.key, title: t.title, detail: t.detail, sort_order: i, auto: Boolean(t.auto) })),
    { onConflict: 'property_id,key', ignoreDuplicates: true }
  );
  await syncOnboardingSignals(db, id);
  return id;
}

/** Ticks off the onboarding steps the system can see for itself, then moves a finished onboarding to active. */
export async function syncOnboardingSignals(db: Db, propertyId: string) {
  const { data: property } = await db.from('managed_properties').select('id, lead_id, status, listing_urls').eq('id', propertyId).maybeSingle();
  if (!property) return;

  const [{ data: signed }, { count: owners }, { data: onboarding }] = await Promise.all([
    db.from('signing_sessions').select('id').eq('lead_id', property.lead_id).eq('contract_kind', 'homeowner_management').eq('session_status', 'completed').limit(1),
    db.from('property_homeowners').select('id', { count: 'exact', head: true }).eq('lead_id', property.lead_id),
    db.from('homeowner_onboarding').select('step_bank_confirmed, step_listing_activated').eq('lead_id', property.lead_id).maybeSingle(),
  ]);
  const hasListing = Boolean(onboarding?.step_listing_activated) || (Array.isArray(property.listing_urls) && property.listing_urls.length > 0);
  const signals: Record<string, boolean> = {
    agreement_signed: Boolean(signed?.length),
    owner_portal: (owners ?? 0) > 0,
    payout_setup: Boolean(onboarding?.step_bank_confirmed),
    listing_live: hasListing,
  };
  const now = new Date().toISOString();
  for (const [key, done] of Object.entries(signals)) {
    if (done) await db.from('onboarding_tasks').update({ status: 'done', completed_at: now }).eq('property_id', propertyId).eq('key', key).neq('status', 'done').neq('status', 'skipped');
  }
  await recomputeStatus(db, propertyId);
}

export async function recomputeStatus(db: Db, propertyId: string) {
  const { data: tasks } = await db.from('onboarding_tasks').select('status').eq('property_id', propertyId);
  const { data: property } = await db.from('managed_properties').select('status').eq('id', propertyId).maybeSingle();
  if (!tasks?.length || !property || property.status !== 'onboarding') return;
  if (tasks.every((t) => t.status === 'done' || t.status === 'skipped')) {
    await db.from('managed_properties').update({ status: 'active', activated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', propertyId);
  }
}

/** Plans a turnover clean after every upcoming checkout that does not have one yet. */
export async function generateTurnovers(db: Db, opts: { propertyId?: string; days?: number } = {}): Promise<{ created: number; sameDay: number }> {
  let q = db.from('managed_properties').select('id, lead_id').neq('status', 'offboarded');
  if (opts.propertyId) q = q.eq('id', opts.propertyId);
  const { data: properties } = await q;
  if (!properties?.length) return { created: 0, sameDay: 0 };

  const end = new Date(Date.now() + (opts.days ?? 60) * 86_400_000).toISOString().slice(0, 10);
  const leadToProperty = new Map(properties.map((p) => [p.lead_id as string, p.id as string]));
  const { data: bookings } = await db.from('bookings').select('id, lead_id, check_in, check_out, guest_name, status').in('lead_id', [...leadToProperty.keys()]).in('status', ['confirmed', 'pending']).gte('check_out', today()).lte('check_out', end);
  if (!bookings?.length) return { created: 0, sameDay: 0 };

  const { data: existing } = await db.from('cleaning_jobs').select('booking_id').in('booking_id', bookings.map((b) => b.id));
  const have = new Set((existing ?? []).map((j) => j.booking_id));
  const { data: allForLeads } = await db.from('bookings').select('lead_id, check_in').in('lead_id', [...leadToProperty.keys()]).in('status', ['confirmed', 'pending']);
  const checkIns = new Set((allForLeads ?? []).map((b) => `${b.lead_id}|${b.check_in}`));

  const rows = bookings.filter((b) => !have.has(b.id)).map((b) => {
    const sameDay = checkIns.has(`${b.lead_id}|${b.check_out}`);
    return {
      lead_id: b.lead_id, property_id: leadToProperty.get(b.lead_id), booking_id: b.id, cleaning_type: 'Turnover', status: 'Scheduled',
      scheduled_date: b.check_out, time_window: sameDay ? '11:00 AM – 2:00 PM' : '11:00 AM – 3:00 PM', same_day: sameDay,
      special_instructions: sameDay ? 'Same-day turnover: the next guest checks in today.' : null,
      checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: false })),
    };
  });
  if (!rows.length) return { created: 0, sameDay: 0 };
  const { error } = await db.from('cleaning_jobs').insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length, sameDay: rows.filter((r) => r.same_day).length };
}

export interface StatementTotals {
  gross: number; fee: number; expenses: number; net: number; feePercent: number;
  bookings: Array<{ id: string; guest: string; checkIn: string; checkOut: string; nights: number; gross: number; platform: string | null }>;
  expenseLines: Array<{ id: string; date: string; category: string; description: string | null; amount: number }>;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** Revenue from stays that ended in the period, less the management fee and approved expenses. */
export async function computeStatement(db: Db, propertyId: string, start: string, end: string): Promise<StatementTotals> {
  const { data: property } = await db.from('managed_properties').select('lead_id, management_fee_percent').eq('id', propertyId).single();
  if (!property) throw new Error('Property not found');
  const { data: bookings } = await db.from('bookings').select('id, guest_name, check_in, check_out, nights, gross_revenue, platform').eq('lead_id', property.lead_id).in('status', ['completed', 'confirmed']).gte('check_out', start).lte('check_out', end).lte('check_out', today()).order('check_out');
  const { data: expenses } = await db.from('property_expenses').select('id, expense_date, category, description, amount').eq('property_id', propertyId).gte('expense_date', start).lte('expense_date', end).order('expense_date');

  const feePercent = Number(property.management_fee_percent ?? 0);
  const gross = money((bookings ?? []).reduce((s, b) => s + Number(b.gross_revenue ?? 0), 0));
  const expensesTotal = money((expenses ?? []).reduce((s, e) => s + Number(e.amount), 0));
  const fee = money((gross * feePercent) / 100);
  return {
    gross, fee, expenses: expensesTotal, net: money(gross - fee - expensesTotal), feePercent,
    bookings: (bookings ?? []).map((b) => ({ id: b.id, guest: b.guest_name ?? 'Guest', checkIn: b.check_in, checkOut: b.check_out, nights: b.nights ?? 0, gross: Number(b.gross_revenue ?? 0), platform: b.platform ?? null })),
    expenseLines: (expenses ?? []).map((e) => ({ id: e.id, date: e.expense_date, category: e.category, description: e.description, amount: Number(e.amount) })),
  };
}
