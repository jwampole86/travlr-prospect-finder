export const MASTER_FIELDS = ['address', 'city', 'state', 'zip', 'county', 'residence_type', 'home_age', 'estimated_home_value', 'ownership_status', 'owner_name', 'phone', 'email', 'apn'] as const;
export type MasterField = (typeof MASTER_FIELDS)[number];
export type MasterFieldMapping = Partial<Record<MasterField, string>>;

const ALIASES: Record<MasterField, string[]> = {
  address: ['address', 'property_address', 'property address', 'street', 'street_address', 'site_address', 'situs_address'],
  city: ['city', 'property_city', 'site_city', 'situs_city'],
  state: ['state', 'state_code', 'property_state', 'site_state'],
  zip: ['zip', 'zipcode', 'zip_code', 'postal_code', 'property_zip'],
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

export function inferMasterFieldMapping(headers: string[]): MasterFieldMapping {
  const normalized = new Map(headers.map(header => [normalizedHeader(header), header]));
  const mapping: MasterFieldMapping = {};
  for (const field of MASTER_FIELDS) {
    for (const alias of ALIASES[field]) {
      const original = normalized.get(normalizedHeader(alias));
      if (original) {
        mapping[field] = original;
        break;
      }
    }
  }
  return mapping;
}

export function normalizeMasterAddress(address: string, city: string, state: string, zip: string) {
  return [address, city, state, zip]
    .map((part, index) => {
      const normalized = String(part || '').trim().toLowerCase();
      return index === 3 ? normalized.replace(/\D/g, '').slice(0, 5) : normalized.replace(/[^a-z0-9]/g, '');
    })
    .join('|');
}

export function normalizeLeadFingerprint(address: string, city: string, state: string) {
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