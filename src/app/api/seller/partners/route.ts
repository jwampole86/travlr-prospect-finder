import { crudHandlers } from '@/lib/seller/crud';

const h = crudHandlers('service_partners', [
  'name', 'contact_name', 'contact_email', 'contact_phone', 'services', 'license_type', 'license_number', 'license_state', 'license_status',
  'license_verified_at', 'states', 'territories', 'relationship_status', 'compensation_terms', 'legal_reviewed', 'agreement_on_file', 'notes',
  'partner_role', 'brokerage', 'niche', 'accepts_referrals', 'will_report', 'referral_fee_range', 'update_method', 'excluded_areas', 'recruit_status',
  'license_lookup_url', 'last_contacted_at',
  'markets', 'property_types', 'price_min', 'price_max', 'max_open_leads', 'do_not_assign', 'match_boost',
  'payment_method', 'payment_method_other', 'payee_name', 'payee_type', 'preferred_invoice_email', 'payment_instructions', 'check_mailing_address', 'wire_instructions_ref',
  'w9_on_file', 'w9_received_at', 'fee_notes', 'fee_effective_at', 'referral_fee_percent_buyer',
  'outreach_started_at', 'outreach_step',
  'responsible_broker', 'referral_fee_percent', 'protection_days', 'payment_due_days', 'exclusive_territory', 'agreement_signed_on',
], { required: ['name'], order: 'name' });
export const GET = h.GET, POST = h.POST, PATCH = h.PATCH;
