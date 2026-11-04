import { crudHandlers } from '@/lib/seller/crud';

const h = crudHandlers('service_partners', [
  'name', 'contact_name', 'contact_email', 'contact_phone', 'services', 'license_type', 'license_number', 'license_state', 'license_status',
  'license_verified_at', 'states', 'territories', 'relationship_status', 'compensation_terms', 'legal_reviewed', 'agreement_on_file', 'notes',
], { required: ['name'], order: 'name' });
export const GET = h.GET, POST = h.POST, PATCH = h.PATCH;
