import { crudHandlers } from '@/lib/seller/crud';

const h = crudHandlers('service_revenue', [
  'opportunity_id', 'agreement_id', 'service_line', 'kind', 'description', 'invoiced', 'collected', 'cost', 'status', 'invoice_date', 'paid_date',
], { required: ['opportunity_id', 'service_line'], filterBy: 'opportunity_id' });
export const GET = h.GET, POST = h.POST, PATCH = h.PATCH;
