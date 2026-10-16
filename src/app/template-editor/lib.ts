import { renderTemplate, templateToText, textToBody, type MergeLead } from '@/lib/followUpTemplates';
import { resolveVariables } from '@/lib/services/variableResolutionService';
import { resolveRecipientPersonalization, type SmsRecipient } from '@/lib/services/smsPersonalizationService';

export type TemplateChannel = 'email' | 'sms';
export type TemplateSourceTable = 'email_templates' | 'message_templates';
export type EmailPreviewMode = 'cadence' | 'bulk-email';
export type SmsPreviewMode = 'bulk-sms';
export type PreviewMode = EmailPreviewMode | SmsPreviewMode;

export interface TemplateRecord {
  id: string;
  channel: TemplateChannel;
  sourceTable: TemplateSourceTable;
  name: string;
  category: string;
  subject: string;
  body: string;
  rawBody: string;
  tag: string;
  cadenceStep: number | null;
  portfolio: string | null;
  variables: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PreviewLead {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  owner_name: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  source: string;
}

export interface DraftTemplate {
  id?: string;
  channel: TemplateChannel;
  name: string;
  category: string;
  subject: string;
  body: string;
  tag: string;
  cadenceStep: number;
  portfolio: string;
}

export interface TemplatePathReport {
  mode: PreviewMode;
  label: string;
  supported: string[];
  unsupported: string[];
}

export interface TemplateCompatibility {
  tokens: string[];
  blockingTokens: string[];
  pathReports: TemplatePathReport[];
}

export interface EmailPreviewResult {
  mode: EmailPreviewMode;
  label: string;
  subject: string;
  body: string;
  issues: string[];
}

export interface SmsPreviewResult {
  mode: SmsPreviewMode;
  label: string;
  body: string;
  issues: string[];
}

const TOKEN_PATTERN = /\{\{\s*([A-Za-z_]+)\s*\}\}|\{\s*([A-Za-z_]+)\s*\}/g;

const EMAIL_PATHS: TemplatePathReport[] = [
  {
    mode: 'cadence',
    label: 'Cadence email',
    supported: ['address', 'contactName', 'senderName', 'localBlurb', 'price'],
    unsupported: [],
  },
  {
    mode: 'bulk-email',
    label: 'Bulk email',
    supported: ['address', 'contactName', 'senderName', 'localBlurb', 'price', 'city', 'state', 'beds', 'baths', 'source'],
    unsupported: [],
  },
];

const SMS_PATHS: TemplatePathReport[] = [
  {
    mode: 'bulk-sms',
    label: 'Bulk SMS',
    supported: ['first_name', 'address'],
    unsupported: [],
  },
];

const MANUAL_ONLY_TOKENS = new Set(['proposedRent', 'leaseTerm', 'proposedStartDate']);

export const EMAIL_VARIABLES = [
  '{{contactName}}',
  '{{senderName}}',
  '{{address}}',
  '{{localBlurb}}',
  '{{price}}',
  '{{city}}',
  '{{state}}',
  '{{beds}}',
  '{{baths}}',
  '{{source}}',
] as const;

export const SMS_VARIABLES = ['{first_name}', '{address}'] as const;

export const EMAIL_DEFAULTS: DraftTemplate = {
  channel: 'email',
  name: '',
  category: 'initial_outreach',
  subject: 'Interested in {{address}}',
  body: 'Hi {{contactName}},\n\nI came across {{address}} and wanted to reach out.\n\nBest,\n{{senderName}}',
  tag: '',
  cadenceStep: 1,
  portfolio: '',
};

export const SMS_DEFAULTS: DraftTemplate = {
  channel: 'sms',
  name: '',
  category: 'Initial Outreach',
  subject: '',
  body: 'Hi {first_name}, I came across {address} and wanted to reach out.\n\nReply STOP to opt out.',
  tag: 'outreach',
  cadenceStep: 1,
  portfolio: '',
};

export function extractTemplateTokens(...parts: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const match of String(part ?? '').matchAll(TOKEN_PATTERN)) {
      tokens.add(match[1] ?? match[2]);
    }
  }
  return [...tokens];
}

export function getTemplatePaths(channel: TemplateChannel): TemplatePathReport[] {
  return channel === 'email' ? EMAIL_PATHS : SMS_PATHS;
}

export function analyzeTemplateCompatibility(channel: TemplateChannel, subject: string, body: string): TemplateCompatibility {
  const tokens = extractTemplateTokens(subject, body);
  const pathReports = getTemplatePaths(channel).map((path) => ({
    ...path,
    unsupported: tokens.filter((token) => !path.supported.includes(token)),
  }));

  const supportedAnywhere = new Set(pathReports.flatMap((path) => path.supported));
  const blockingTokens = tokens.filter((token) => MANUAL_ONLY_TOKENS.has(token) || !supportedAnywhere.has(token));

  return { tokens, blockingTokens, pathReports };
}

export function makeDraftFromTemplate(template: TemplateRecord): DraftTemplate {
  return {
    id: template.id,
    channel: template.channel,
    name: template.name,
    category: template.category,
    subject: template.subject,
    body: template.body,
    tag: template.tag,
    cadenceStep: template.cadenceStep ?? 1,
    portfolio: template.portfolio ?? '',
  };
}

export function serializeDraft(draft: DraftTemplate) {
  if (draft.channel === 'email') {
    return {
      sourceTable: 'email_templates' as const,
      payload: {
        name: draft.name.trim(),
        category: draft.category.trim() || 'initial_outreach',
        subject: draft.subject.trim(),
        body: textToBody(draft.body),
        cadence_step: Number.isFinite(draft.cadenceStep) ? draft.cadenceStep : 1,
        portfolio: draft.portfolio.trim() || null,
      },
    };
  }

  return {
    sourceTable: 'message_templates' as const,
    payload: {
      name: draft.name.trim(),
      type: 'sms',
      category: draft.category.trim() || 'Initial Outreach',
      tag: draft.tag.trim() || null,
      subject: null,
      body: draft.body,
      variables: extractTemplateTokens(draft.body).map(toStoredToken),
    },
  };
}

export function toStoredToken(token: string): string {
  if (token === 'first_name') return '{first_name}';
  if (token === 'address') return '{address}';
  return `{{${token}}}`;
}

export function fromEmailRow(row: Record<string, unknown>): TemplateRecord {
  const rawBody = String(row.body ?? '');
  return {
    id: String(row.id),
    channel: 'email',
    sourceTable: 'email_templates',
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    subject: String(row.subject ?? ''),
    body: templateToText(rawBody).text,
    rawBody,
    tag: '',
    cadenceStep: typeof row.cadence_step === 'number' ? row.cadence_step : Number(row.cadence_step ?? 0) || null,
    portfolio: row.portfolio ? String(row.portfolio) : null,
    variables: extractTemplateTokens(String(row.subject ?? ''), templateToText(rawBody).text).map((token) => `{{${token}}}`),
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export function fromSmsRow(row: Record<string, unknown>): TemplateRecord {
  const body = String(row.body ?? '');
  return {
    id: String(row.id),
    channel: 'sms',
    sourceTable: 'message_templates',
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    subject: '',
    body,
    rawBody: body,
    tag: row.tag ? String(row.tag) : '',
    cadenceStep: null,
    portfolio: null,
    variables: extractTemplateTokens(body).map(toStoredToken),
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export function formatTemplateDate(value: string | null) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

export function normalizeLegacySmsTokens(body: string): string {
  return body
    .replace(/\{\{\s*contactName\s*\}\}/g, '{first_name}')
    .replace(/\{\{\s*first_name\s*\}\}/g, '{first_name}')
    .replace(/\{\{\s*address\s*\}\}/g, '{address}');
}

function renderBulkEmailText(template: string, lead: PreviewLead, senderName: string) {
  const resolved = resolveVariables(
    {
      contactName: lead.contact_name || lead.owner_name || '',
      address: lead.address,
      city: lead.city,
      state: lead.state,
    },
    { senderName }
  );

  return String(template || '')
    .replace(/\{\{contactName\}\}/g, resolved.contactName)
    .replace(/\{\{senderName\}\}/g, resolved.senderName || senderName)
    .replace(/\{\{address\}\}/g, resolved.address)
    .replace(/\{\{city\}\}/g, lead.city || '')
    .replace(/\{\{state\}\}/g, lead.state || '')
    .replace(/\{\{price\}\}/g, lead.price ? `$${lead.price.toLocaleString('en-US')}` : '')
    .replace(/\{\{beds\}\}/g, lead.beds ? String(lead.beds) : '')
    .replace(/\{\{baths\}\}/g, lead.baths ? String(lead.baths) : '')
    .replace(/\{\{source\}\}/g, lead.source || '')
    .replace(/\{\{localBlurb\}\}/g, resolved.localBlurb)
    .replace(/\{\{proposedRent\}\}/g, '')
    .replace(/\{\{leaseTerm\}\}/g, '')
    .replace(/\{\{proposedStartDate\}\}/g, '');
}

export function buildEmailPreviewResults(draft: DraftTemplate, lead: PreviewLead, senderName: string): EmailPreviewResult[] {
  const mergeLead: MergeLead = {
    address: lead.address,
    city: lead.city,
    state: lead.state,
    contact_name: lead.contact_name,
    owner_name: lead.owner_name,
    price: lead.price,
  };

  const cadence = renderTemplate(draft.subject, draft.body, mergeLead, senderName);
  const cadenceIssues = [
    ...new Set(
      cadence.missing.map((token) => `Cadence send cannot resolve {{${token}}}.`)
    ),
  ];

  const bulkSubject = renderBulkEmailText(draft.subject, lead, senderName);
  const bulkBody = renderBulkEmailText(draft.body, lead, senderName);
  const bulkIssues = [
    ...extractTemplateTokens(bulkSubject, bulkBody)
      .filter((token) => MANUAL_ONLY_TOKENS.has(token) || !EMAIL_PATHS[1].supported.includes(token))
      .map((token) => `Bulk email will not resolve ${token.startsWith('{') ? token : `{{${token}}}`}.`),
  ];

  return [
    {
      mode: 'cadence',
      label: 'Cadence email',
      subject: cadence.subject,
      body: cadence.text,
      issues: cadenceIssues,
    },
    {
      mode: 'bulk-email',
      label: 'Bulk email',
      subject: bulkSubject,
      body: bulkBody,
      issues: bulkIssues,
    },
  ];
}

export function buildSmsPreviewResult(draft: DraftTemplate, lead: PreviewLead): SmsPreviewResult {
  const recipient: SmsRecipient = {
    leadId: lead.id,
    phone: 'preview',
    contactName: lead.contact_name,
    ownerName: lead.owner_name,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    verifiedOwner: true,
    verifiedAddress: lead.address,
    verifiedNumber: true,
    hasPhone: true,
  };

  const result = resolveRecipientPersonalization(recipient, draft.body);
  return {
    mode: 'bulk-sms',
    label: 'Bulk SMS',
    body: result.renderedMessage || draft.body,
    issues: result.status === 'READY' ? [] : [result.exclusionReason ?? 'This SMS template does not match the live personalization pipeline.'],
  };
}

export function humanizeToken(token: string): string {
  if (token === 'first_name') return '{first_name}';
  if (token === 'address') return '{address}';
  return `{{${token}}}`;
}
