export const MASTER_FIELDS = ['address', 'city', 'state', 'zip', 'county', 'residence_type', 'home_age', 'estimated_home_value', 'ownership_status', 'owner_name', 'phone', 'email', 'apn'] as const;
export type MasterField = (typeof MASTER_FIELDS)[number];
export type MasterFieldMapping = Partial<Record<MasterField, string>>;

const ALIASES: Record<MasterField, string[]> = {
  address: ['address', 'property_address', 'property address', 'property_address_1', 'address_1', 'address1', 'street', 'street_address', 'site_address', 'situs_address', 'property_street'],
  city: ['city', 'property_city', 'site_city', 'situs_city', 'city_name'],
  state: ['state', 'state_code', 'property_state', 'site_state', 'state_name', 'state_abbreviation', 'st'],
  zip: ['zip', 'zipcode', 'zip_code', 'zip5', 'postal_code', 'property_zip', 'postal'],
  county: ['county', 'property_county'],
  residence_type: ['residence_type', 'residence type', 'property_type', 'dwelling_type'],
  home_age: ['home_age', 'home age', 'property_age'],
  estimated_home_value: ['est_home_value', 'estimated_home_value', 'estimated home value', 'home_value'],
  ownership_status: ['own_rent', 'own/rent', 'ownership_status', 'tenure'],
  owner_name: ['owner', 'owner_name', 'homeowner', 'homeowner_name', 'contact', 'contact_name', 'mail_owner'],
  phone: ['phone', 'phone_number', 'contact_phone', 'mobile', 'mobile_phone', 'telephone'],
  email: ['email', 'email_address', 'contact_email', 'owner_email'],
  apn: ['apn', 'parcel', 'parcel_id', 'parcel_number', 'assessor_parcel_number'],
};

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function isPostOfficeBoxAddress(value: string) {
  const address = String(value || '').trim();
  return /(?:^|\b)(?:p\s*\.?\s*o\s*\.?|post\s+office|postal)\s*(?:box|bx)\s*#?\s*\d+/i.test(address)
    || /(?:^|\b)pob\s*#?\s*\d+/i.test(address);
}

export function inferMasterFieldMapping(headers: string[]): MasterFieldMapping {
  const normalized = new Map(headers.map(header => [normalizedHeader(header.replace(/^\uFEFF/, '')), header]));
  const mapping: MasterFieldMapping = {};
  for (const field of MASTER_FIELDS) {
    for (const alias of ALIASES[field]) {
      const original = normalized.get(normalizedHeader(alias));
      if (original) {
        mapping[field] = original;
        break;
      }
    }
    if (!mapping[field] && ['address', 'city', 'state', 'zip'].includes(field)) {
      const fuzzy = [...normalized.entries()].find(([header]) =>
        field === 'address' ? /(^|_)(address|street|situs)(_|$)/.test(header) :
        field === 'city' ? /(^|_)city(_|$)/.test(header) :
        field === 'state' ? /(^|_)(state|st)(_|$)/.test(header) :
        /(^|_)(zip|postal)(_|$)/.test(header)
      );
      if (fuzzy) mapping[field] = fuzzy[1];
    }
  }
  return mapping;
}

export function normalizeMasterAddress(address: string, city: string, state: string, zip: string) {
  if (isPostOfficeBoxAddress(address)) return '';
  return [address, city, state, zip]
    .map((part, index) => {
      const normalized = String(part || '').trim().toLowerCase();
      return index === 3 ? normalized.replace(/\D/g, '').slice(0, 5) : normalized.replace(/[^a-z0-9]/g, '');
    })
    .join('|');
}

export function normalizeLeadFingerprint(address: string, city: string, state: string) {
  if (isPostOfficeBoxAddress(address)) return '';
  return [address, city, state]
    .map(part => String(part || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

export function normalizeMasterPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

export function parseEstimatedHomeValue(value: string) {
  const amounts = String(value || '').match(/[\d,]+/g)?.map(amount => Number(amount.replace(/,/g, ''))).filter(Number.isFinite) || [];
  return amounts[0] || 0;
}

export function qualityScore(record: { address: string; city: string; state: string; zip: string; ownerName: string; phone: string; email: string; apn: string }) {
  let score = 0;
  if (record.address) score += 35;
  if (record.city && record.state) score += 15;
  if (record.zip) score += 10;
  if (record.ownerName) score += 15;
  if (record.phone) score += 15;
  if (record.email) score += 5;
  if (record.apn) score += 5;
  return score;
}