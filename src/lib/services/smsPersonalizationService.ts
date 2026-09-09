/**
 * TRAVLR SMS Personalization Service
 * Server-side template variable resolver for bulk SMS campaigns.
 *
 * Resolves verified first name + verified property address for each recipient.
 * Renders template individually per recipient.
 * Blocks any message with unresolved/null/undefined variables.
 * Returns full provenance for audit trail.
 */

export type PersonalizationStatus =
  | 'READY' |'MISSING_FIRST_NAME' |'MISSING_ADDRESS' |'UNVERIFIED_FIRST_NAME' |'UNVERIFIED_ADDRESS' |'AMBIGUOUS_OWNER' |'AMBIGUOUS_PROPERTY' |'DUPLICATE_PHONE' |'ERROR';

export interface SmsRecipient {
  leadId: string;
  contactId?: string;
  propertyId?: string;
  phone: string;
  // Raw lead fields
  contactName?: string;
  ownerName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  verifiedOwner?: boolean;
  verifiedNumber?: boolean;
  verifiedAddress?: string | null;
  hasPhone?: boolean;
  doNotContact?: boolean;
}

export interface ResolvedPersonalization {
  leadId: string;
  contactId?: string;
  propertyId?: string;
  phone: string;
  // Resolved values
  firstName: string;
  propertyAddress: string;
  outreachAddress: string; // street-only, SMS-friendly
  // Provenance
  firstNameSource: 'firstName_field' | 'contactName_parsed' | 'ownerName_parsed' | 'fallback';
  addressSource: 'verified_address' | 'address_field' | 'fallback';
  firstNameVerified: boolean;
  addressVerified: boolean;
  // Rendered
  renderedMessage: string;
  // Status
  status: PersonalizationStatus;
  exclusionReason?: string;
}

export interface PersonalizationReconciliation {
  totalSelected: number;
  personalizationReady: number;
  missingFirstName: number;
  missingAddress: number;
  unverifiedFirstName: number;
  unverifiedAddress: number;
  ambiguousOwner: number;
  ambiguousProperty: number;
  duplicatePhone: number;
  excluded: number;
  finalQueued: number;
  recipients: ResolvedPersonalization[];
  readyRecipients: ResolvedPersonalization[];
  excludedRecipients: ResolvedPersonalization[];
  hasUnresolvedVariables: boolean;
}

// ─── Honorific stripping ──────────────────────────────────────────────────────
const HONORIFICS = /^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Rev\.|Sir|Lady|Lord)\s+/i;

/**
 * Extract first name from a full name string.
 * Strips honorifics, uses structured firstName field if available.
 */
export function extractFirstName(fullName: string): string {
  if (!fullName?.trim()) return '';
  // Strip honorifics
  const stripped = fullName.trim().replace(HONORIFICS, '');
  // Handle "Last, First" format
  if (stripped.includes(',')) {
    const parts = stripped.split(',').map(p => p.trim());
    // "Smith, John" → "John"
    if (parts.length >= 2 && parts[1]) return parts[1].split(/\s+/)[0];
  }
  // Handle "First Last" — take first token
  const tokens = stripped.split(/\s+/);
  return tokens[0] || '';
}

/**
 * Resolve verified first name for a recipient.
 * Priority: verified owner firstName > contactName parsed > ownerName parsed
 */
export function resolveFirstName(recipient: SmsRecipient): {
  firstName: string;
  source: ResolvedPersonalization['firstNameSource'];
  verified: boolean;
} {
  // 1. Try contactName (primary verified contact field)
  if (recipient.contactName?.trim()) {
    const name = extractFirstName(recipient.contactName.trim());
    if (name && name.length > 0) {
      return {
        firstName: name,
        source: 'contactName_parsed',
        verified: recipient.verifiedOwner === true,
      };
    }
  }

  // 2. Try ownerName
  if (recipient.ownerName?.trim()) {
    const name = extractFirstName(recipient.ownerName.trim());
    if (name && name.length > 0) {
      return {
        firstName: name,
        source: 'ownerName_parsed',
        verified: recipient.verifiedOwner === true,
      };
    }
  }

  return { firstName: '', source: 'fallback', verified: false };
}

/**
 * Build outreach-friendly address (street only, no city/state/zip for SMS brevity).
 * Includes unit if present. Strips city/state/zip from verified_address.
 */
export function buildOutreachAddress(
  verifiedAddress: string | null | undefined,
  streetAddress: string | undefined,
  city?: string,
  state?: string,
  zip?: string
): string {
  const source = verifiedAddress || streetAddress || '';
  if (!source.trim()) return '';

  // If verified_address contains "Street City, ST Zip" format, extract street only
  // Pattern: everything before the city name
  if (city && source.includes(city)) {
    const cityIdx = source.indexOf(city);
    const street = source.substring(0, cityIdx).trim().replace(/,\s*$/, '');
    if (street.length > 3) return street;
  }

  // Fallback: use the raw address field (already street-only in most cases)
  return (streetAddress || source).trim();
}

/**
 * Resolve verified property address for a recipient.
 */
export function resolvePropertyAddress(recipient: SmsRecipient): {
  propertyAddress: string;
  outreachAddress: string;
  source: ResolvedPersonalization['addressSource'];
  verified: boolean;
} {
  // 1. Use verified_address (canonical)
  if (recipient.verifiedAddress?.trim()) {
    const outreach = buildOutreachAddress(
      recipient.verifiedAddress,
      recipient.address,
      recipient.city,
      recipient.state,
      recipient.zip
    );
    return {
      propertyAddress: recipient.verifiedAddress.trim(),
      outreachAddress: outreach || recipient.verifiedAddress.trim(),
      source: 'verified_address',
      verified: true,
    };
  }

  // 2. Use address field (unverified)
  if (recipient.address?.trim()) {
    const outreach = buildOutreachAddress(
      null,
      recipient.address,
      recipient.city,
      recipient.state,
      recipient.zip
    );
    return {
      propertyAddress: recipient.address.trim(),
      outreachAddress: outreach || recipient.address.trim(),
      source: 'address_field',
      verified: false,
    };
  }

  return { propertyAddress: '', outreachAddress: '', source: 'fallback', verified: false };
}

// ─── Template rendering ───────────────────────────────────────────────────────

const UNRESOLVED_PATTERN = /\{[a-z_]+\}|\{\{[a-z_]+\}\}/gi;
const NULL_PATTERNS = /\b(null|undefined)\b/gi;

/**
 * Render SMS template with resolved variables.
 * Replaces {first_name} and {address} (and {{variants}}).
 */
export function renderSmsTemplate(
  template: string,
  firstName: string,
  address: string
): string {
  return template
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{address\}/g, address)
    .replace(/\{\{address\}\}/g, address);
}

/**
 * Validate rendered message has no unresolved variables or null/undefined values.
 */
export function validateRenderedMessage(rendered: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  const unresolved = rendered.match(UNRESOLVED_PATTERN);
  if (unresolved) {
    issues.push(`Unresolved variables: ${[...new Set(unresolved)].join(', ')}`);
  }

  const nullMatches = rendered.match(NULL_PATTERNS);
  if (nullMatches) {
    issues.push(`Null/undefined values detected: ${[...new Set(nullMatches)].join(', ')}`);
  }

  // Block "Hi !" or "Hi null!" patterns
  if (/Hi\s*[!,]/.test(rendered)) {
    issues.push('Empty greeting detected (first name missing)');
  }

  if (/came across\s+(null|undefined|\s*and)/i.test(rendered)) {
    issues.push('Empty address reference detected');
  }

  return { valid: issues.length === 0, issues };
}

// ─── Main reconciliation engine ───────────────────────────────────────────────

/**
 * Resolve personalization for a single recipient.
 * Returns full provenance + rendered message + status.
 */
export function resolveRecipientPersonalization(
  recipient: SmsRecipient,
  template: string
): ResolvedPersonalization {
  const base: Omit<ResolvedPersonalization, 'status' | 'exclusionReason'> = {
    leadId: recipient.leadId,
    contactId: recipient.contactId,
    propertyId: recipient.propertyId,
    phone: recipient.phone,
    firstName: '',
    propertyAddress: '',
    outreachAddress: '',
    firstNameSource: 'fallback',
    addressSource: 'fallback',
    firstNameVerified: false,
    addressVerified: false,
    renderedMessage: '',
  };

  // Resolve first name
  const nameResult = resolveFirstName(recipient);
  base.firstName = nameResult.firstName;
  base.firstNameSource = nameResult.source;
  base.firstNameVerified = nameResult.verified;

  // Resolve address
  const addrResult = resolvePropertyAddress(recipient);
  base.propertyAddress = addrResult.propertyAddress;
  base.outreachAddress = addrResult.outreachAddress;
  base.addressSource = addrResult.source;
  base.addressVerified = addrResult.verified;

  // Check for missing verified first name
  if (!base.firstName || base.firstName.trim().length === 0) {
    return {
      ...base,
      status: 'MISSING_FIRST_NAME',
      exclusionReason: 'MISSING_VERIFIED_FIRST_NAME: No verified first name could be resolved for this contact.',
    };
  }

  // Check for unverified first name (warn but don't block — verified flag check)
  if (!base.firstNameVerified) {
    return {
      ...base,
      status: 'UNVERIFIED_FIRST_NAME',
      exclusionReason: 'UNVERIFIED_FIRST_NAME: Contact record is not marked as verified owner.',
    };
  }

  // Check for missing address
  if (!base.propertyAddress || base.propertyAddress.trim().length === 0) {
    return {
      ...base,
      status: 'MISSING_ADDRESS',
      exclusionReason: 'MISSING_VERIFIED_ADDRESS: No verified property address could be resolved.',
    };
  }

  // Check for unverified address
  if (!base.addressVerified) {
    return {
      ...base,
      status: 'UNVERIFIED_ADDRESS',
      exclusionReason: 'UNVERIFIED_ADDRESS: Property address is not marked as verified.',
    };
  }

  // Render template using outreach-friendly address
  const rendered = renderSmsTemplate(template, base.firstName, base.outreachAddress);

  // Validate rendered message
  const validation = validateRenderedMessage(rendered);
  if (!validation.valid) {
    return {
      ...base,
      renderedMessage: rendered,
      status: 'ERROR',
      exclusionReason: `PERSONALIZATION_ERROR: ${validation.issues.join('; ')}`,
    };
  }

  return {
    ...base,
    renderedMessage: rendered,
    status: 'READY',
  };
}

/**
 * Run full personalization reconciliation for a bulk SMS campaign.
 * Deduplicates by phone number, resolves all variables, returns reconciliation summary.
 */
export function runPersonalizationReconciliation(
  recipients: SmsRecipient[],
  template: string
): PersonalizationReconciliation {
  // Deduplicate by phone — keep first occurrence per phone
  const seenPhones = new Map<string, string>(); // phone → leadId
  const dedupedRecipients: SmsRecipient[] = [];
  const duplicateLeadIds = new Set<string>();

  for (const r of recipients) {
    const normalizedPhone = r.phone?.replace(/\D/g, '') || '';
    if (!normalizedPhone) continue;
    if (seenPhones.has(normalizedPhone)) {
      duplicateLeadIds.add(r.leadId);
    } else {
      seenPhones.set(normalizedPhone, r.leadId);
      dedupedRecipients.push(r);
    }
  }

  // Resolve personalization for each deduped recipient
  const resolved = dedupedRecipients.map(r => resolveRecipientPersonalization(r, template));

  // Mark duplicates that were removed
  const duplicateResults: ResolvedPersonalization[] = [...duplicateLeadIds].map(leadId => {
    const orig = recipients.find(r => r.leadId === leadId)!;
    return {
      leadId,
      phone: orig.phone,
      firstName: '',
      propertyAddress: '',
      outreachAddress: '',
      firstNameSource: 'fallback' as const,
      addressSource: 'fallback' as const,
      firstNameVerified: false,
      addressVerified: false,
      renderedMessage: '',
      status: 'DUPLICATE_PHONE' as PersonalizationStatus,
      exclusionReason: `DUPLICATE_PHONE: Phone ${orig.phone} already assigned to another recipient in this campaign.`,
    };
  });

  const allResults = [...resolved, ...duplicateResults];
  const readyRecipients = resolved.filter(r => r.status === 'READY');
  const excludedRecipients = allResults.filter(r => r.status !== 'READY');

  // Count by status
  const counts = {
    missingFirstName: allResults.filter(r => r.status === 'MISSING_FIRST_NAME').length,
    missingAddress: allResults.filter(r => r.status === 'MISSING_ADDRESS').length,
    unverifiedFirstName: allResults.filter(r => r.status === 'UNVERIFIED_FIRST_NAME').length,
    unverifiedAddress: allResults.filter(r => r.status === 'UNVERIFIED_ADDRESS').length,
    ambiguousOwner: allResults.filter(r => r.status === 'AMBIGUOUS_OWNER').length,
    ambiguousProperty: allResults.filter(r => r.status === 'AMBIGUOUS_PROPERTY').length,
    duplicatePhone: duplicateResults.length,
  };

  // Final safety check: ensure zero queued messages contain unresolved variables
  const hasUnresolvedVariables = readyRecipients.some(r => {
    const check = validateRenderedMessage(r.renderedMessage);
    return !check.valid;
  });

  return {
    totalSelected: recipients.length,
    personalizationReady: readyRecipients.length,
    ...counts,
    excluded: excludedRecipients.length,
    finalQueued: hasUnresolvedVariables ? 0 : readyRecipients.length,
    recipients: allResults,
    readyRecipients,
    excludedRecipients,
    hasUnresolvedVariables,
  };
}

/**
 * The canonical TRAVLR outreach template.
 */
export const TRAVLR_OUTREACH_TEMPLATE = `Hi {first_name}! I came across {address} and wanted to reach out. I'm Jennifer with TRAVLR Vacation Homes — a boutique property management company.

Curious what your property could earn as a professionally managed STR?

Free estimate: staytrvlr.com/estimate

More about us: staytrvlr.com

Happy to answer any questions!

Reply STOP to opt out`;
