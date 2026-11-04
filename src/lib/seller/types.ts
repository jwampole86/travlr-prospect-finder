export const SERVICE_LINES = ['sale_partner', 'long_term_management', 'str_management', 'interim_rental', 'readiness_services'] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

export const SERVICE_LINE_LABEL: Record<ServiceLine, string> = {
  sale_partner: 'Licensed sale partner',
  long_term_management: 'Long-term management',
  str_management: 'Short-term rental management',
  interim_rental: 'Interim rental before sale',
  readiness_services: 'Property readiness services',
};

export const STAGES = ['signal', 'permission', 'qualified', 'routed', 'consultation', 'agreement', 'outcome'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  signal: 'Seller signal',
  permission: 'Permission and verification',
  qualified: 'Qualified',
  routed: 'Routed to a service',
  consultation: 'Human consultation',
  agreement: 'Agreement',
  outcome: 'Outcome',
};

export const CONSENT_PURPOSES = ['estimate_followup', 'seller_consultation', 'long_term_management', 'str_management', 'readiness_services', 'partner_sharing'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_PURPOSE_LABEL: Record<ConsentPurpose, string> = {
  estimate_followup: 'Estimate follow-up',
  seller_consultation: 'Sale consultation',
  long_term_management: 'Long-term management',
  str_management: 'Short-term rental management',
  readiness_services: 'Readiness services',
  partner_sharing: 'Share details with a partner',
};

/** The permission each service needs before an owner can be routed to it. */
export const ROUTE_PURPOSE: Record<ServiceLine, ConsentPurpose> = {
  sale_partner: 'partner_sharing',
  long_term_management: 'long_term_management',
  str_management: 'str_management',
  interim_rental: 'str_management',
  readiness_services: 'readiness_services',
};

export type Authorization = 'authorized' | 'needs_permission' | 'blocked';
