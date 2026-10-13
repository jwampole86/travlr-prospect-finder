/** What the profile can confirm about a lead from the data on file. Separate from the formal provider check, which no lead has passed. */
export interface VerificationCheck { label: string; pass: boolean; /** Evidence points to it but a person should confirm. */ confirm?: boolean; detail: string; points: number }
export interface OwnerMatch { name: string; percent: number }
export interface DataAssessment { checks: VerificationCheck[]; score: number; level: 'strong' | 'partial' | 'weak'; label: string }

interface Facts {
  address: string; city: string; state: string; zip: string; lat: number; lng: number; beds: number; baths: number; price: number;
  isSynthetic?: boolean; listingUrl?: string | null; ownerName?: string; skipTraceFound?: boolean; contactPhone?: string; skipTracePhones?: string[];
  extra?: Record<string, any>;
}

export function assessLeadData(l: Facts, realListingUrl: string | null, ownerMatch?: OwnerMatch | null): DataAssessment {
  const x = l.extra ?? {};
  const street = /^\d+[A-Za-z]?\s+\S+/.test(l.address.trim());
  const place = !!l.city && /^[A-Za-z]{2}$/.test(l.state) && /^\d{5}(-\d{4})?$/.test(l.zip) || (!!l.city && /^[A-Za-z]{2}$/.test(l.state) && /\b\d{5}\b/.test(l.address));
  const located = Math.abs(l.lat) > 0.01 && Math.abs(l.lng) > 0.01;
  const facts = l.beds > 0 && l.baths > 0 && l.price > 0;
  const hasId = [x.apn, x.parcel_id, x.provider_property_id, x.property_provider].some(Boolean);
  const nameMatch = !!ownerMatch && ownerMatch.percent >= 85;
  const nameConfirm = !hasId && !nameMatch && !!ownerMatch && ownerMatch.percent >= 60;
  const record = hasId || nameMatch;
  const owner = !!l.ownerName || !!x.verified_owner || !!x.ownership_record_verified || !!l.skipTraceFound;
  const phone = !!x.verified_number || !!l.contactPhone || (l.skipTracePhones?.length ?? 0) > 0;
  const linkOff = x.link_status === 'Unavailable';

  const checks: VerificationCheck[] = [
    { label: 'Street address', pass: street, detail: street ? l.address : 'No street number and name', points: 20 },
    { label: 'City, state and ZIP', pass: place, detail: place ? [l.city, l.state, l.zip].filter(Boolean).join(', ') : 'Incomplete', points: 15 },
    { label: 'Mapped location', pass: located, detail: located ? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : 'Not geocoded', points: 10 },
    { label: 'Real listing link', pass: !!realListingUrl && !linkOff, detail: realListingUrl ? (linkOff ? 'Listing reported unavailable' : 'Stored and reachable') : 'None on file', points: 15 },
    { label: 'Beds, baths and price', pass: facts, detail: facts ? `${l.beds} bd / ${l.baths} ba` : 'Missing', points: 10 },
    { label: 'Property record', pass: record, confirm: nameConfirm, detail: hasId ? [x.property_provider, x.apn && `APN ${x.apn}`].filter(Boolean).join(' · ') : nameMatch ? `Name matches ownership records: ${ownerMatch!.name} (${ownerMatch!.percent}%)` : nameConfirm ? `Possible match to ownership records: ${ownerMatch!.name} (${ownerMatch!.percent}%), confirm` : 'No APN, provider ID or ownership record match', points: 10 },
    { label: 'Owner identified', pass: owner, detail: l.ownerName || (l.skipTraceFound ? 'Skip trace match' : 'Not identified'), points: 10 },
    { label: 'Phone on file', pass: phone, detail: x.verified_number ? 'Verified number' : phone ? 'Contact or skip-trace number' : 'None', points: 10 },
  ];
  const score = l.isSynthetic ? 0 : checks.reduce((s, c) => s + (c.pass ? c.points : c.confirm ? c.points / 2 : 0), 0);
  const level = score >= 75 ? 'strong' : score >= 50 ? 'partial' : 'weak';
  return { checks, score, level, label: level === 'strong' ? 'Strong data match' : level === 'partial' ? 'Partial data match' : 'Weak data match' };
}

const REAL_URL = /^https?:\/\/[^/]+\/.+/;

/** The lead's own data assessment, using any stored listing link. */
export function assessLead(l: Facts, ownerMatch?: OwnerMatch | null): DataAssessment {
  const x = l.extra ?? {};
  const url = [l.listingUrl, x.listing_source_url, x.sync_source_url].find(u => typeof u === 'string' && REAL_URL.test(u)) ?? null;
  return assessLeadData(l, url, ownerMatch);
}

/** Outreach is cleared by the formal provider check, or by a strong match on the data on file. */
export function outreachCleared(l: Facts & { verificationStatus?: string; verificationScore?: number }, ownerMatch?: OwnerMatch | null): boolean {
  return (l.verificationStatus === 'VERIFIED' && (l.verificationScore ?? 0) >= 75) || assessLead(l, ownerMatch).level === 'strong';
}
