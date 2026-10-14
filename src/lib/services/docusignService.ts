/**
 * DocuSign eSignature service (JWT auth).
 * DOCUSIGN_ENV=demo (default) talks to the sandbox, where envelopes are NOT legally binding.
 * DOCUSIGN_ENV=production talks to the live account after DocuSign Go-Live approval.
 */
import { createHmac, createSign } from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

export const DS_ENV: 'demo' | 'production' = (process.env.DOCUSIGN_ENV ?? 'demo').toLowerCase() === 'production' ? 'production' : 'demo';
const DS_OAUTH_BASE = DS_ENV === 'production' ? 'account.docusign.com' : 'account-d.docusign.com';
const DS_DEFAULT_BASE_PATH = 'https://demo.docusign.net/restapi';
const DS_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY ?? '';
const DS_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID ?? '';
const DS_USER_ID = process.env.DOCUSIGN_USER_ID ?? '';
const DS_PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

// Unfilled env vars (still a "your-...-here" template) or the UI's "..." PEM hint are not real values.
const hasPlaceholderValue = (value: string) => !value || /your-|here|xxxxxxxx|\.\.\./.test(value);

/** Counter-signer for TRAVLR: set TRAVLR_COUNTERSIGNER_EMAIL/NAME, otherwise the DocuSign integration user signs. */
const COUNTERSIGNER = {
  name: process.env.TRAVLR_COUNTERSIGNER_NAME?.trim() || '',
  email: process.env.TRAVLR_COUNTERSIGNER_EMAIL?.trim() || '',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryMode = 'email' | 'embedded';

export interface SignerInfo {
  name: string;
  email: string;
  /** Present only for embedded (sign-now) signers. Email signers have none. */
  clientUserId?: string;
  recipientId: string;
  order: number;
}

/** Deal terms keyed by contract field name. */
export type PrefillData = Record<string, string | undefined>;

export interface CreateEnvelopeResult {
  envelopeId: string;
  status: string;
  /** Who TRAVLR's counter-signature goes to. */
  counterSigner: { name: string; email: string };
}

export interface EmbeddedSigningUrlResult {
  url: string;
}

export interface OfferLetterSigner {
  name: string;
  email: string;
  recipientId: string;
  order: number;
}

export interface EnvelopeSignerStatus {
  email: string;
  name: string;
  status: string;
  recipientId?: string;
  signedDateTime?: string;
  viewedDateTime?: string;
  declinedDateTime?: string;
  declinedReason?: string;
}

export function getDocuSignConfigStatus() {
  const missing: string[] = [];
  if (hasPlaceholderValue(DS_INTEGRATION_KEY)) missing.push('DOCUSIGN_INTEGRATION_KEY');
  if (hasPlaceholderValue(DS_ACCOUNT_ID)) missing.push('DOCUSIGN_ACCOUNT_ID');
  if (hasPlaceholderValue(DS_USER_ID)) missing.push('DOCUSIGN_USER_ID');
  if (hasPlaceholderValue(DS_PRIVATE_KEY)) missing.push('DOCUSIGN_PRIVATE_KEY');

  const warnings: string[] = [];
  if (DS_ENV === 'demo') warnings.push('Sandbox mode: envelopes are for testing and are not legally binding.');

  return {
    configured: missing.length === 0,
    missing,
    env: DS_ENV,
    basePath: resolvedBasePath ?? (DS_ENV === 'demo' ? DS_DEFAULT_BASE_PATH : 'resolved from your account on first use'),
    oauthBase: DS_OAUTH_BASE,
    warnings,
  };
}

// ─── JWT Auth ─────────────────────────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let integrationUser: { email: string; name: string } | null = null;
let resolvedBasePath: string | null = process.env.DOCUSIGN_BASE_PATH?.trim() || (DS_ENV === 'demo' ? DS_DEFAULT_BASE_PATH : null);

export async function getDocuSignAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const config = getDocuSignConfigStatus();
  if (!config.configured) {
    throw new Error(`DocuSign credentials not configured. Set real values for: ${config.missing.join(', ')}.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: DS_INTEGRATION_KEY,
    sub: DS_USER_ID,
    aud: DS_OAUTH_BASE,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  };

  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const jwt = `${signingInput}.${sign.sign(DS_PRIVATE_KEY, 'base64url')}`;

  const response = await fetch(`https://${DS_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });

  if (!response.ok) {
    throw new Error(`DocuSign JWT auth failed: ${await response.text()}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };

  if (!resolvedBasePath || !integrationUser) {
    // Production accounts live on a regional host; ask DocuSign which one, and who the integration user is.
    const info = await fetch(`https://${DS_OAUTH_BASE}/oauth/userinfo`, { headers: { Authorization: `Bearer ${data.access_token}` } });
    const body = info.ok ? await info.json() as { name?: string; email?: string; accounts?: Array<{ account_id: string; base_uri: string; is_default?: boolean }> } : null;
    const account = body?.accounts?.find((a) => a.account_id === DS_ACCOUNT_ID) ?? body?.accounts?.find((a) => a.is_default);
    if (!resolvedBasePath) {
      if (!account) throw new Error('DocuSign account lookup failed: the integration user has no matching account.');
      resolvedBasePath = `${account.base_uri}/restapi`;
    }
    if (body?.email) integrationUser = { email: body.email, name: body.name ?? 'Authorized Representative' };
  }
  return cachedToken.accessToken;
}

/** TRAVLR's counter-signer: the configured address, otherwise the DocuSign integration user. Never a guessed mailbox. */
async function getCounterSigner(): Promise<{ name: string; email: string }> {
  if (COUNTERSIGNER.email) return { email: COUNTERSIGNER.email, name: COUNTERSIGNER.name || 'Authorized Representative' };
  await getDocuSignAccessToken();
  if (!integrationUser) throw new Error('No counter-signer: set TRAVLR_COUNTERSIGNER_EMAIL.');
  return { email: integrationUser.email, name: COUNTERSIGNER.name || integrationUser.name };
}

async function dsRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getDocuSignAccessToken();
  return fetch(`${resolvedBasePath}/v2.1/accounts/${DS_ACCOUNT_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
}

// ─── Webhook token ────────────────────────────────────────────────────────────

/** Shared secret appended to the per-envelope webhook URL so only DocuSign-configured callbacks are accepted. */
export function docusignWebhookToken(): string | null {
  const secret = process.env.DOCUSIGN_WEBHOOK_SECRET || process.env.CRON_SECRET;
  return secret ? createHmac('sha256', secret).update('docusign-webhook-v1').digest('hex').slice(0, 40) : null;
}

/** Public webhook URL for envelope events, or null when the site is not publicly reachable (e.g. localhost). */
export function docusignWebhookUrl(): string | null {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const token = docusignWebhookToken();
  if (!token || !/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)) return null;
  return `${site}/api/docusign/webhook?t=${token}`;
}

function eventNotification(url: string) {
  return {
    url,
    loggingEnabled: 'true',
    requireAcknowledgement: 'true',
    useSoapInterface: 'false',
    includeCertificateWithSoap: 'false',
    includeDocuments: 'false',
    includeEnvelopeVoidReason: 'true',
    includeTimeZone: 'true',
    includeSenderAccountAsCustomField: 'false',
    includeDocumentFields: 'false',
    includeCertificateOfCompletion: 'false',
    envelopeEvents: ['sent', 'delivered', 'completed', 'declined', 'voided'].map((s) => ({ envelopeEventStatusCode: s })),
    recipientEvents: ['Sent', 'Delivered', 'Completed', 'Declined'].map((s) => ({ recipientEventStatusCode: s })),
    eventData: { version: 'restv2.1', format: 'json', includeData: ['recipients'] },
  };
}

// ─── Envelope Creation ────────────────────────────────────────────────────────

export interface CreateEnvelopeOptions {
  emailSubject: string;
  /** email: DocuSign emails the signer a link. embedded: the signer signs on this device via a signing URL. */
  delivery?: DeliveryMode;
  /** Counter-signature by the Company, appended after the signers. Defaults to on. */
  counterSign?: boolean;
  /** Names the counter-signer on the Company's behalf (falls back to the DocuSign user). */
  counterSigner?: { name: string; email: string };
}

/**
 * Sends a rendered contract (HTML with hidden [SIGN_HERE_n] / [DATE_HERE_n] anchors) for signature: each signer in
 * order, then the Company's counter-signature at [COMPANY_SIGN_HERE].
 */
export async function createSigningEnvelope(
  signers: SignerInfo[],
  document: { html: string; name: string },
  options: CreateEnvelopeOptions
): Promise<CreateEnvelopeResult> {
  const delivery = options.delivery ?? 'email';
  if (delivery === 'embedded' && signers.some((s) => !s.clientUserId)) throw new Error('Embedded signers need a clientUserId.');

  const tabsFor = (sign: string, date: string, id: string) => ({
    signHereTabs: [{ documentId: '1', tabLabel: `SignHere_${id}`, anchorString: sign, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-4' }],
    dateSignedTabs: [{ documentId: '1', tabLabel: `DateSigned_${id}`, anchorString: date, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-4' }],
  });

  const signerRecipients = signers.map((s) => ({
    email: s.email,
    name: s.name,
    ...(delivery === 'embedded' ? { clientUserId: s.clientUserId } : {}),
    recipientId: s.recipientId,
    routingOrder: String(s.order),
    tabs: tabsFor(`[SIGN_HERE_${s.recipientId}]`, `[DATE_HERE_${s.recipientId}]`, s.recipientId),
  }));

  const counter = options.counterSign === false ? null : (options.counterSigner?.email ? options.counterSigner : await getCounterSigner());
  const counterRecipientId = String(signers.length + 1);
  const counterRecipients = counter ? [{
    email: counter.email,
    name: counter.name,
    recipientId: counterRecipientId,
    routingOrder: counterRecipientId,
    tabs: tabsFor('[COMPANY_SIGN_HERE]', '[COMPANY_DATE_HERE]', 'COMPANY'),
  }] : [];

  const webhookUrl = docusignWebhookUrl();
  const envelopeDefinition = {
    emailSubject: options.emailSubject,
    documents: [{ documentId: '1', name: `${document.name.replace(/[^\w.-]+/g, '_')}.html`, fileExtension: 'html', documentBase64: Buffer.from(document.html).toString('base64') }],
    recipients: { signers: [...signerRecipients, ...counterRecipients] },
    ...(webhookUrl ? { eventNotification: eventNotification(webhookUrl) } : {}),
    status: 'sent',
  };

  const response = await dsRequest('/envelopes', { method: 'POST', body: JSON.stringify(envelopeDefinition) });
  if (!response.ok) throw new Error(`DocuSign create envelope failed: ${await response.text()}`);

  const data = await response.json() as { envelopeId: string; status: string };
  return { envelopeId: data.envelopeId, status: data.status, counterSigner: counter ?? { name: '', email: '' } };
}

export async function createOfferLetterEnvelope(
  signers: OfferLetterSigner[],
  letterHtml: string,
  emailSubject = 'TRAVLR Offer Letter — Please Review & Sign'
): Promise<CreateEnvelopeResult> {
  if (!signers.length) throw new Error('At least one offer signer is required');
  if (!letterHtml.trim()) throw new Error('Offer letter HTML is required');

  const signerRecipients = signers.map((signer) => ({
    email: signer.email,
    name: signer.name,
    recipientId: signer.recipientId,
    routingOrder: String(signer.order),
    tabs: {
      signHereTabs: [
        {
          documentId: '1',
          tabLabel: `CandidateSignHere_${signer.recipientId}`,
          anchorString: `[CANDIDATE_SIGNATURE_${signer.recipientId}]`,
          anchorUnits: 'pixels',
          anchorXOffset: '0',
          anchorYOffset: '-8',
        },
      ],
      dateSignedTabs: [
        {
          documentId: '1',
          tabLabel: `CandidateDateSigned_${signer.recipientId}`,
          anchorString: `[CANDIDATE_DATE_${signer.recipientId}]`,
          anchorUnits: 'pixels',
          anchorXOffset: '0',
          anchorYOffset: '-8',
        },
      ],
    },
  }));

  const envelopeDefinition = {
    emailSubject,
    documents: [{ documentId: '1', name: 'TRAVLR_Offer_Letter.html', fileExtension: 'html', documentBase64: Buffer.from(letterHtml).toString('base64') }],
    recipients: { signers: signerRecipients },
    status: 'sent',
  };

  const response = await dsRequest('/envelopes', { method: 'POST', body: JSON.stringify(envelopeDefinition) });
  if (!response.ok) throw new Error(`DocuSign create offer envelope failed: ${await response.text()}`);

  const data = await response.json() as { envelopeId: string; status: string };
  return { envelopeId: data.envelopeId, status: data.status, counterSigner: { name: '', email: '' } };
}

// ─── Embedded Signing URL ─────────────────────────────────────────────────────

/**
 * Recipient View URL for a signer created with a clientUserId. The URL is single-use and short-lived,
 * so request it when the signer is about to sign. `appOrigin` lets the signing page load inside our modal.
 */
export async function getEmbeddedSigningUrl(
  envelopeId: string,
  signer: SignerInfo,
  returnUrl: string,
  appOrigin?: string
): Promise<EmbeddedSigningUrlResult> {
  if (!signer.clientUserId) throw new Error('This signer receives the agreement by email, not embedded signing.');

  const viewRequest = {
    returnUrl,
    authenticationMethod: 'none',
    clientUserId: signer.clientUserId,
    email: signer.email,
    userName: signer.name,
    recipientId: signer.recipientId,
    ...(appOrigin
      ? { frameAncestors: [appOrigin, DS_ENV === 'production' ? 'https://apps.docusign.com' : 'https://apps-d.docusign.com'], messageOrigins: [DS_ENV === 'production' ? 'https://apps.docusign.com' : 'https://apps-d.docusign.com'] }
      : {}),
  };

  const response = await dsRequest(`/envelopes/${encodeURIComponent(envelopeId)}/views/recipient`, { method: 'POST', body: JSON.stringify(viewRequest) });
  if (!response.ok) throw new Error(`DocuSign recipient view failed: ${await response.text()}`);

  const data = await response.json() as { url: string };
  return { url: data.url };
}

// ─── Void Envelope ────────────────────────────────────────────────────────────

export async function voidEnvelope(envelopeId: string, reason: string): Promise<void> {
  const response = await dsRequest(`/envelopes/${encodeURIComponent(envelopeId)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'voided', voidedReason: reason }),
  });
  if (!response.ok) throw new Error(`DocuSign void envelope failed: ${await response.text()}`);
}

/** Re-sends the signing email to every emailed signer who has not signed yet (a reminder, same envelope). */
export async function resendEnvelopeNotification(envelopeId: string): Promise<number> {
  const id = encodeURIComponent(envelopeId);
  const res = await dsRequest(`/envelopes/${id}/recipients`);
  if (!res.ok) throw new Error(`DocuSign recipients lookup failed (${res.status})`);
  const { signers = [] } = await res.json() as { signers?: Array<EnvelopeSignerStatus & { clientUserId?: string }> };
  const pending = signers.filter((s) => ['sent', 'delivered'].includes(s.status) && !s.clientUserId);
  if (!pending.length) return 0;
  const put = await dsRequest(`/envelopes/${id}/recipients?resend_envelope=true`, {
    method: 'PUT',
    body: JSON.stringify({ signers: pending.map((s) => ({ recipientId: s.recipientId, name: s.name, email: s.email })) }),
  });
  if (!put.ok) throw new Error(`DocuSign reminder failed: ${await put.text()}`);
  return pending.length;
}

// ─── Get Envelope Status ──────────────────────────────────────────────────────

export async function getEnvelopeStatus(envelopeId: string): Promise<{
  status: string;
  completedDateTime?: string;
  voidedDateTime?: string;
  voidedReason?: string;
  recipients: { signers: EnvelopeSignerStatus[] };
}> {
  const id = encodeURIComponent(envelopeId);
  const [envRes, recipRes] = await Promise.all([dsRequest(`/envelopes/${id}`), dsRequest(`/envelopes/${id}/recipients`)]);
  if (!envRes.ok) throw new Error(`DocuSign envelope lookup failed (${envRes.status}): ${await envRes.text()}`);
  if (!recipRes.ok) throw new Error(`DocuSign recipients lookup failed (${recipRes.status}): ${await recipRes.text()}`);

  const env = await envRes.json() as { status: string; completedDateTime?: string; voidedDateTime?: string; voidedReason?: string };
  const recips = await recipRes.json() as { signers?: EnvelopeSignerStatus[] };
  return { status: env.status, completedDateTime: env.completedDateTime, voidedDateTime: env.voidedDateTime, voidedReason: env.voidedReason, recipients: { signers: recips.signers ?? [] } };
}

// ─── Download Signed PDF ──────────────────────────────────────────────────────

/** Streams one finished document (the combined signed PDF or the certificate of completion) from DocuSign. */
export async function downloadEnvelopeDocument(envelopeId: string, kind: 'signed' | 'certificate'): Promise<ArrayBuffer> {
  const res = await dsRequest(`/envelopes/${encodeURIComponent(envelopeId)}/documents/${kind === 'signed' ? 'combined' : 'certificate'}`, { headers: { Accept: 'application/pdf' } });
  if (!res.ok) throw new Error(`DocuSign document download failed (${res.status})`);
  return res.arrayBuffer();
}
