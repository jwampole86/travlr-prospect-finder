import { crudHandlers } from '@/lib/seller/crud';

const h = crudHandlers('service_agreements', [
  'opportunity_id', 'partner_id', 'service_line', 'contract_type', 'status', 'signed_at', 'start_date', 'end_date', 'monthly_fee', 'fee_percent',
  'cancellation_terms', 'docusign_envelope_id', 'notes',
], { required: ['opportunity_id', 'service_line'], filterBy: 'opportunity_id' });
export const GET = h.GET, POST = h.POST, PATCH = h.PATCH;
