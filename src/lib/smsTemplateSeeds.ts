/**
 * TRAVLR Vacation Homes — Master SMS Templates
 * 5 outreach stages with exact body text from the SMS template spec.
 *
 * Variables:
 *   {{senderName}}        — auto-resolved from logged-in user profile
 *   {{contactName}}       — from lead record; falls back to "there"
 *   {{address}}           — from lead record; REQUIRED (blocks send if missing)
 *   {{localBlurb}}        — city→state→neutral fallback via resolveLocalBlurb()
 *   {{proposedRent}}      — manual entry; REQUIRED for proposal (blocks send)
 *   {{leaseTerm}}         — manual entry; REQUIRED for proposal (blocks send)
 *   {{proposedStartDate}} — manual entry; REQUIRED for proposal (blocks send)
 */

export interface SMSTemplateSeed {
  name: string;
  body: string;
  category: string;
  tag: 'outreach' | 'follow up' | 'proposal' | 'closing';
  /** Variables that must be resolved before sending */
  requiredVars: string[];
  /** Variables that block send if missing (subset of requiredVars) */
  blockingVars: string[];
}

export const SMS_TEMPLATE_SEEDS: SMSTemplateSeed[] = [
  // ── 1. Initial Outreach ────────────────────────────────────────────────────
  {
    name: 'SMS — Initial Outreach',
    tag: 'outreach',
    category: 'Initial Outreach',
    body: `Hi {{contactName}}, this is {{senderName}} with TRAVLR Vacation Homes. I came across {{address}} and wanted to reach out. We're a luxury vacation rental and property management company, and {{localBlurb}}. We handle guests, cleaning, maintenance, and pricing so owners don't have to. Would you be open to a quick call?`,
    requiredVars: ['{{senderName}}', '{{contactName}}', '{{address}}', '{{localBlurb}}'],
    blockingVars: ['{{senderName}}', '{{address}}'],
  },

  // ── 2. Follow-Up #1 ────────────────────────────────────────────────────────
  {
    name: 'SMS — Follow-Up #1',
    tag: 'follow up',
    category: 'Follow-Up',
    body: `Hi {{contactName}}, just following up on my message about {{address}}. We're still very interested and would love to connect. {{localBlurb}}. Would you be open to a quick call this week?`,
    requiredVars: ['{{senderName}}', '{{contactName}}', '{{address}}', '{{localBlurb}}'],
    blockingVars: ['{{senderName}}', '{{address}}'],
  },

  // ── 3. Check-In / Re-Engage ────────────────────────────────────────────────
  {
    name: 'SMS — Check-In / Re-Engage',
    tag: 'follow up',
    category: 'Follow-Up',
    body: `Hi {{contactName}}, wanted to check back in regarding {{address}}. Is the property still available? We remain interested and would be happy to reconnect whenever the timing makes sense.`,
    requiredVars: ['{{senderName}}', '{{contactName}}', '{{address}}'],
    blockingVars: ['{{senderName}}', '{{address}}'],
  },

  // ── 4. Proposal Introduction ───────────────────────────────────────────────
  {
    name: 'SMS — Proposal Introduction',
    tag: 'proposal',
    category: 'Proposal',
    body: `Hi {{contactName}}, thanks again for speaking with me about {{address}}. I'd like to formally propose {{proposedRent}}/month for {{leaseTerm}}, starting {{proposedStartDate}}. TRAVLR would handle the full guest and property experience, including cleaning, maintenance, guest services, concierge, and pricing. Happy to talk through any questions.`,
    requiredVars: [
      '{{senderName}}',
      '{{contactName}}',
      '{{address}}',
      '{{proposedRent}}',
      '{{leaseTerm}}',
      '{{proposedStartDate}}',
    ],
    blockingVars: [
      '{{senderName}}',
      '{{address}}',
      '{{proposedRent}}',
      '{{leaseTerm}}',
      '{{proposedStartDate}}',
    ],
  },

  // ── 5. Closing / Contract ──────────────────────────────────────────────────
  {
    name: 'SMS — Closing / Contract',
    tag: 'closing',
    category: 'Closing',
    body: `Hi {{contactName}}, great news — we're ready to move forward with {{address}}! I'll send over the agreement for your review. Once everything looks good, we'll coordinate the walkthrough and get the start date locked in. Excited to work together!`,
    requiredVars: ['{{senderName}}', '{{contactName}}', '{{address}}'],
    blockingVars: ['{{senderName}}', '{{address}}'],
  },
];

// ─── Variable Resolution ──────────────────────────────────────────────────────

export interface SMSResolutionInput {
  /** From logged-in user profile — never prompt, never persist across sessions */
  senderName?: string | null;
  /** From lead CRM record */
  contactName?: string | null;
  /** From lead record property address field */
  address?: string | null;
  /** Resolved via resolveLocalBlurb() from lead city/state */
  localBlurb?: string | null;
  /** Manual entry per deal */
  proposedRent?: string | null;
  /** Manual entry per deal */
  leaseTerm?: string | null;
  /** Manual entry per deal */
  proposedStartDate?: string | null;
}

export interface SMSResolutionResult {
  /** Fully resolved message body, or null if blocked */
  resolvedBody: string | null;
  /** True if the message is safe to send */
  canSend: boolean;
  /** Human-readable blocking reasons shown to the sender */
  blockingErrors: string[];
  /** Warnings (non-blocking, e.g. neutral blurb used) */
  warnings: string[];
  /** contactName was missing — fell back to "there" */
  usedContactFallback: boolean;
  /** localBlurb fell back to neutral — record should be flagged */
  usedNeutralBlurb: boolean;
}

/**
 * Resolve all variables in an SMS template body.
 * Applies all blocking rules and fallbacks from the spec.
 */
export function resolveSMSTemplate(
  template: SMSTemplateSeed,
  input: SMSResolutionInput
): SMSResolutionResult {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  let usedContactFallback = false;
  let usedNeutralBlurb = false;

  // ── Sender name ────────────────────────────────────────────────────────────
  const senderName = input.senderName?.trim() || null;
  if (!senderName && template.blockingVars.includes('{{senderName}}')) {
    blockingErrors.push(
      'Sender name is missing from the account profile. Please add a first name or display name before sending.'
    );
  }

  // ── Property address ───────────────────────────────────────────────────────
  const address = input.address?.trim() || null;
  if (!address && template.blockingVars.includes('{{address}}')) {
    blockingErrors.push(
      'Property address is required before this SMS can be sent. Please add the address to the lead record.'
    );
  }

  // ── Contact name ───────────────────────────────────────────────────────────
  const contactName = input.contactName?.trim() || null;
  let resolvedContactName = contactName;
  if (!contactName) {
    resolvedContactName = 'there';
    usedContactFallback = true;
  }

  // ── Local blurb ────────────────────────────────────────────────────────────
  const localBlurb = input.localBlurb?.trim() || null;
  let resolvedLocalBlurb = localBlurb;
  if (!localBlurb) {
    resolvedLocalBlurb = "we're actively growing our footprint across the western and eastern US";
    usedNeutralBlurb = true;
    warnings.push(
      'No local market entry found for this lead. Using neutral expansion language. Flag this record to add a proper local blurb.'
    );
  }

  // ── Proposal-specific variables ────────────────────────────────────────────
  const proposedRent = input.proposedRent?.trim() || null;
  if (!proposedRent && template.blockingVars.includes('{{proposedRent}}')) {
    blockingErrors.push('Proposed monthly rent is required before sending this proposal SMS.');
  }

  const leaseTerm = input.leaseTerm?.trim() || null;
  if (!leaseTerm && template.blockingVars.includes('{{leaseTerm}}')) {
    blockingErrors.push('Agreement term is required before sending this proposal SMS.');
  }

  const proposedStartDate = input.proposedStartDate?.trim() || null;
  if (!proposedStartDate && template.blockingVars.includes('{{proposedStartDate}}')) {
    blockingErrors.push('Proposed start date is required before sending this proposal SMS.');
  }

  // ── If any blocking error, return early ────────────────────────────────────
  if (blockingErrors.length > 0) {
    return { resolvedBody: null, canSend: false, blockingErrors, warnings, usedContactFallback, usedNeutralBlurb };
  }

  // ── Substitute all variables ───────────────────────────────────────────────
  let body = template.body;
  body = body.replaceAll('{{senderName}}', senderName ?? '');
  body = body.replaceAll('{{contactName}}', resolvedContactName ?? 'there');
  body = body.replaceAll('{{address}}', address ?? '');
  body = body.replaceAll('{{localBlurb}}', resolvedLocalBlurb ?? '');
  body = body.replaceAll('{{proposedRent}}', proposedRent ?? '');
  body = body.replaceAll('{{leaseTerm}}', leaseTerm ?? '');
  body = body.replaceAll('{{proposedStartDate}}', proposedStartDate ?? '');

  return { resolvedBody: body, canSend: true, blockingErrors: [], warnings, usedContactFallback, usedNeutralBlurb };
}

/**
 * Human-readable labels for SMS template variables
 */
export const SMS_VAR_LABELS: Record<string, string> = {
  '{{senderName}}': 'Sender Name (auto)',
  '{{contactName}}': 'Contact Name (auto / "there")',
  '{{address}}': 'Property Address (required)',
  '{{localBlurb}}': 'Local Market Blurb (auto)',
  '{{proposedRent}}': 'Proposed Rent (manual)',
  '{{leaseTerm}}': 'Lease Term (manual)',
  '{{proposedStartDate}}': 'Proposed Start Date (manual)',
};
