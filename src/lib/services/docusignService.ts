/**
 * DocuSign Embedded Signing Service
 * Uses DocuSign eSignature REST API with JWT authentication.
 * Build/test against sandbox: https://demo.docusign.net/restapi
 * Production: https://na1.docusign.net/restapi (after Go-Live certification)
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const DS_BASE_PATH = 'https://demo.docusign.net/restapi';
const DS_OAUTH_BASE = 'account-d.docusign.com';
const DS_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY ?? '';
const DS_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID ?? '';
const DS_USER_ID = process.env.DOCUSIGN_USER_ID ?? '';
const DS_PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

const hasPlaceholderValue = (value: string) => !value || /your-|here|xxxxxxxx|BEGIN RSA PRIVATE KEY/.test(value);

// TRAVLR static config — never re-entered per deal
export const TRAVLR_CONFIG = {
  entityType: 'TRAVLR Inc.',
  stateOfOrganization: 'Delaware',
  address: '123 TRAVLR Way, Suite 100, Austin, TX 78701',
  email: 'partnerships@travlr.com',
  signerName: 'TRAVLR Authorized Representative',
  signerEmail: 'partnerships@travlr.com',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignerInfo {
  name: string;
  email: string;
  clientUserId: string;
  recipientId: string;
  order: number;
}

export interface PrefillData {
  // Homeowner / lead fields
  homeownerName?: string;
  homeownerEmail?: string;
  homeownerPhone?: string;
  homeownerMailingAddress?: string;
  propertyAddress?: string;
  propertyType?: string;
  beds?: string;
  baths?: string;
  portfolio?: string;
  zone?: string;
  // Deal terms (from Proposal stage — never defaulted silently)
  managementFeePercent?: string;
  termLengthMonths?: string;
  renewalNoticePeriod?: string;
  onboardingTimeline?: string;
  maintenanceApprovalThreshold?: string;
  payoutSchedule?: string;
  personalUseNoticePeriod?: string;
  blackoutNightCap?: string;
  terminationNoticeConvenience?: string;
  terminationNoticeCause?: string;
  postTerminationHonorWindow?: string;
  finalPayoutWindow?: string;
  listingRemovalWindow?: string;
  disputeResolutionMethod?: string;
  governingState?: string;
}

export interface CreateEnvelopeResult {
  envelopeId: string;
  status: string;
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

export function getDocuSignConfigStatus() {
  const missing: string[] = [];
  if (hasPlaceholderValue(DS_INTEGRATION_KEY)) missing.push('DOCUSIGN_INTEGRATION_KEY');
  if (hasPlaceholderValue(DS_ACCOUNT_ID)) missing.push('DOCUSIGN_ACCOUNT_ID');
  if (hasPlaceholderValue(DS_USER_ID)) missing.push('DOCUSIGN_USER_ID');
  if (hasPlaceholderValue(DS_PRIVATE_KEY)) missing.push('DOCUSIGN_PRIVATE_KEY');

  return {
    configured: missing.length === 0,
    missing,
    basePath: DS_BASE_PATH,
    oauthBase: DS_OAUTH_BASE,
  };
}

// ─── JWT Auth ─────────────────────────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getDocuSignAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const config = getDocuSignConfigStatus();
  if (!config.configured) {
    throw new Error(
      `DocuSign credentials not configured. Set real values for: ${config.missing.join(', ')}.`
    );
  }

  // Build JWT assertion
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

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Sign with RSA private key using Node.js crypto
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(DS_PRIVATE_KEY, 'base64url');

  const jwt = `${signingInput}.${signature}`;

  const response = await fetch(`https://${DS_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DocuSign JWT auth failed: ${err}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// ─── Envelope Creation ────────────────────────────────────────────────────────

/**
 * Creates a DocuSign envelope from the TRAVLR Partnership Agreement template,
 * pre-filling all bracketed fields from lead/deal data.
 * Supports multiple homeowner signers (Section 16 multi-owner).
 */
export async function createSigningEnvelope(
  signers: SignerInfo[],
  prefill: PrefillData,
  emailSubject = 'TRAVLR Partnership Agreement — Please Review & Sign'
): Promise<CreateEnvelopeResult> {
  const accessToken = await getDocuSignAccessToken();

  // Build text tabs (pre-filled fields) for each signer
  // These map to the bracketed fields in the TRAVLR Partnership Agreement Template
  const textTabs = buildTextTabs(prefill);

  // Build signer recipients with embedded signing (clientUserId = embedded)
  const signerRecipients = signers.map((s) => ({
    email: s.email,
    name: s.name,
    clientUserId: s.clientUserId,
    recipientId: s.recipientId,
    routingOrder: String(s.order),
    tabs: {
      textTabs,
      signHereTabs: [
        {
          documentId: '1',
          tabLabel: `\\*SignHere_${s.recipientId}`,
          anchorString: `[HOMEOWNER_SIGNATURE_${s.recipientId}]`,
          anchorUnits: 'pixels',
          anchorXOffset: '0',
          anchorYOffset: '0',
        },
      ],
    },
  }));

  // TRAVLR counter-signer (agent-side, not embedded — uses email signing)
  const travlrSigner = {
    email: TRAVLR_CONFIG.signerEmail,
    name: TRAVLR_CONFIG.signerName,
    recipientId: String(signers.length + 1),
    routingOrder: String(signers.length + 1),
    tabs: {
      signHereTabs: [
        {
          documentId: '1',
          tabLabel: '\\*SignHere_TRAVLR',
          anchorString: '[TRAVLR_SIGNATURE]',
          anchorUnits: 'pixels',
          anchorXOffset: '0',
          anchorYOffset: '0',
        },
      ],
    },
  };

  const envelopeDefinition = {
    emailSubject,
    templateId: process.env.DOCUSIGN_TEMPLATE_ID ?? undefined,
    // If no template ID yet, use composite template approach with inline document
    ...(process.env.DOCUSIGN_TEMPLATE_ID
      ? {
          templateRoles: signerRecipients.map((s) => ({
            ...s,
            roleName: `Homeowner_${s.recipientId}`,
          })),
        }
      : {
          documents: [
            {
              documentId: '1',
              name: 'TRAVLR_Partnership_Agreement.pdf',
              fileExtension: 'html',
              documentBase64: buildAgreementHtml(prefill, signers),
            },
          ],
          recipients: {
            signers: [...signerRecipients, travlrSigner],
          },
        }),
    status: 'sent',
  };

  const response = await fetch(
    `${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeDefinition),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DocuSign create envelope failed: ${err}`);
  }

  const data = await response.json() as { envelopeId: string; status: string };
  return { envelopeId: data.envelopeId, status: data.status };
}

export async function createOfferLetterEnvelope(
  signers: OfferLetterSigner[],
  letterHtml: string,
  emailSubject = 'TRAVLR Offer Letter — Please Review & Sign'
): Promise<CreateEnvelopeResult> {
  if (!signers.length) throw new Error('At least one offer signer is required');
  if (!letterHtml.trim()) throw new Error('Offer letter HTML is required');

  const accessToken = await getDocuSignAccessToken();
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
    documents: [
      {
        documentId: '1',
        name: 'TRAVLR_Offer_Letter.html',
        fileExtension: 'html',
        documentBase64: Buffer.from(letterHtml).toString('base64'),
      },
    ],
    recipients: { signers: signerRecipients },
    status: 'sent',
  };

  const response = await fetch(
    `${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeDefinition),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DocuSign create offer envelope failed: ${err}`);
  }

  const data = await response.json() as { envelopeId: string; status: string };
  return { envelopeId: data.envelopeId, status: data.status };
}

// ─── Embedded Signing URL ─────────────────────────────────────────────────────

/**
 * Generates a Recipient View URL for embedded signing.
 * The homeowner is redirected to this URL inside an iframe within TRAVLR's UI.
 */
export async function getEmbeddedSigningUrl(
  envelopeId: string,
  signer: SignerInfo,
  returnUrl: string
): Promise<EmbeddedSigningUrlResult> {
  const accessToken = await getDocuSignAccessToken();

  const viewRequest = {
    returnUrl,
    authenticationMethod: 'none',
    clientUserId: signer.clientUserId,
    email: signer.email,
    userName: signer.name,
    recipientId: signer.recipientId,
  };

  const response = await fetch(
    `${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(viewRequest),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DocuSign recipient view failed: ${err}`);
  }

  const data = await response.json() as { url: string };
  return { url: data.url };
}

// ─── Void Envelope ────────────────────────────────────────────────────────────

export async function voidEnvelope(
  envelopeId: string,
  reason: string
): Promise<void> {
  const accessToken = await getDocuSignAccessToken();

  const response = await fetch(
    `${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes/${envelopeId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'voided', voidedReason: reason }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DocuSign void envelope failed: ${err}`);
  }
}

// ─── Get Envelope Status ──────────────────────────────────────────────────────

export async function getEnvelopeStatus(envelopeId: string): Promise<{
  status: string;
  completedDateTime?: string;
  recipients?: { signers: Array<{ email: string; name: string; status: string; signedDateTime?: string; viewedDateTime?: string }> };
}> {
  const accessToken = await getDocuSignAccessToken();

  const [envRes, recipRes] = await Promise.all([
    fetch(`${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes/${envelopeId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes/${envelopeId}/recipients`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  const envData = await envRes.json() as { status: string; completedDateTime?: string };
  const recipData = await recipRes.json() as { signers: Array<{ email: string; name: string; status: string; signedDateTime?: string; viewedDateTime?: string }> };

  return {
    status: envData.status,
    completedDateTime: envData.completedDateTime,
    recipients: recipData,
  };
}

// ─── Download Signed PDF ──────────────────────────────────────────────────────

export async function downloadSignedDocuments(envelopeId: string): Promise<{
  pdfBase64: string;
  certificateBase64: string;
}> {
  const accessToken = await getDocuSignAccessToken();

  const [pdfRes, certRes] = await Promise.all([
    fetch(
      `${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
    fetch(
      `${DS_BASE_PATH}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes/${envelopeId}/documents/certificate`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
  ]);

  const pdfBuffer = await pdfRes.arrayBuffer();
  const certBuffer = await certRes.arrayBuffer();

  return {
    pdfBase64: Buffer.from(pdfBuffer).toString('base64'),
    certificateBase64: Buffer.from(certBuffer).toString('base64'),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTextTabs(prefill: PrefillData) {
  const tabs: Array<{ tabLabel: string; value: string }> = [];

  const fieldMap: Record<string, string | undefined> = {
    homeownerName: prefill.homeownerName,
    homeownerEmail: prefill.homeownerEmail,
    homeownerPhone: prefill.homeownerPhone,
    homeownerMailingAddress: prefill.homeownerMailingAddress,
    propertyAddress: prefill.propertyAddress,
    propertyType: prefill.propertyType,
    beds: prefill.beds,
    baths: prefill.baths,
    portfolio: prefill.portfolio,
    zone: prefill.zone,
    managementFeePercent: prefill.managementFeePercent,
    termLengthMonths: prefill.termLengthMonths,
    renewalNoticePeriod: prefill.renewalNoticePeriod,
    onboardingTimeline: prefill.onboardingTimeline,
    maintenanceApprovalThreshold: prefill.maintenanceApprovalThreshold,
    payoutSchedule: prefill.payoutSchedule,
    personalUseNoticePeriod: prefill.personalUseNoticePeriod,
    blackoutNightCap: prefill.blackoutNightCap,
    terminationNoticeConvenience: prefill.terminationNoticeConvenience,
    terminationNoticeCause: prefill.terminationNoticeCause,
    postTerminationHonorWindow: prefill.postTerminationHonorWindow,
    finalPayoutWindow: prefill.finalPayoutWindow,
    listingRemovalWindow: prefill.listingRemovalWindow,
    disputeResolutionMethod: prefill.disputeResolutionMethod,
    governingState: prefill.governingState,
    // TRAVLR static fields
    travlrEntityType: TRAVLR_CONFIG.entityType,
    travlrStateOfOrganization: TRAVLR_CONFIG.stateOfOrganization,
    travlrAddress: TRAVLR_CONFIG.address,
  };

  for (const [label, value] of Object.entries(fieldMap)) {
    if (value !== undefined && value !== '') {
      tabs.push({ tabLabel: `\\*${label}`, value });
    }
  }

  return tabs;
}

/**
 * Builds a minimal HTML agreement document for sandbox testing
 * (used when DOCUSIGN_TEMPLATE_ID is not yet configured).
 * In production, the actual TRAVLR_Partnership_Agreement_Template is used.
 */
function buildAgreementHtml(prefill: PrefillData, signers: SignerInfo[]): string {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>TRAVLR Partnership Agreement</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:40px;line-height:1.6}
h1{font-size:18px;text-align:center}h2{font-size:14px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:12px 0}
td,th{border:1px solid #ccc;padding:6px 10px;font-size:11px}
.sig-block{margin-top:40px;border-top:1px solid #333;padding-top:20px}
</style></head>
<body>
<h1>TRAVLR PROPERTY MANAGEMENT PARTNERSHIP AGREEMENT</h1>
<p>This Partnership Agreement ("Agreement") is entered into between <strong>${TRAVLR_CONFIG.entityType}</strong>, 
a ${TRAVLR_CONFIG.stateOfOrganization} entity ("TRAVLR"), and the Homeowner(s) identified below.</p>

<h2>1. PARTIES</h2>
<table>
<tr><th>TRAVLR</th><th>Homeowner</th></tr>
<tr><td>${TRAVLR_CONFIG.entityType}<br>${TRAVLR_CONFIG.address}</td>
<td>${prefill.homeownerName ?? '[HOMEOWNER NAME]'}<br>
${prefill.homeownerMailingAddress ?? '[MAILING ADDRESS]'}<br>
${prefill.homeownerEmail ?? '[EMAIL]'} | ${prefill.homeownerPhone ?? '[PHONE]'}</td></tr>
</table>

<h2>2. PROPERTY</h2>
<table>
<tr><th>Address</th><th>Type</th><th>Beds</th><th>Baths</th><th>Portfolio/Zone</th></tr>
<tr><td>${prefill.propertyAddress ?? '[PROPERTY ADDRESS]'}</td>
<td>${prefill.propertyType ?? '[TYPE]'}</td>
<td>${prefill.beds ?? '[BEDS]'}</td>
<td>${prefill.baths ?? '[BATHS]'}</td>
<td>${prefill.portfolio ?? '[PORTFOLIO]'} / ${prefill.zone ?? '[ZONE]'}</td></tr>
</table>

<h2>3. MANAGEMENT TERMS</h2>
<table>
<tr><th>Management Fee</th><th>Term Length</th><th>Renewal Notice</th><th>Onboarding Timeline</th></tr>
<tr><td>${prefill.managementFeePercent ?? '[FEE %]'}%</td>
<td>${prefill.termLengthMonths ?? '[MONTHS]'} months</td>
<td>${prefill.renewalNoticePeriod ?? '[DAYS]'} days</td>
<td>${prefill.onboardingTimeline ?? '[TIMELINE]'}</td></tr>
</table>

<h2>4. FINANCIAL TERMS</h2>
<table>
<tr><th>Maintenance Approval Threshold</th><th>Payout Schedule</th></tr>
<tr><td>$${prefill.maintenanceApprovalThreshold ?? '[AMOUNT]'}</td>
<td>${prefill.payoutSchedule ?? '[SCHEDULE]'}</td></tr>
</table>

<h2>5. PERSONAL USE & TERMINATION</h2>
<table>
<tr><th>Personal Use Notice</th><th>Blackout Night Cap</th><th>Termination (Convenience)</th><th>Termination (Cause)</th></tr>
<tr><td>${prefill.personalUseNoticePeriod ?? '[DAYS]'} days</td>
<td>${prefill.blackoutNightCap ?? 'None'} nights/yr</td>
<td>${prefill.terminationNoticeConvenience ?? '[DAYS]'} days</td>
<td>${prefill.terminationNoticeCause ?? '[DAYS]'} days</td></tr>
</table>

<h2>16. DISPUTE RESOLUTION & GOVERNING LAW</h2>
<p>Disputes shall be resolved via <strong>${prefill.disputeResolutionMethod ?? '[METHOD]'}</strong>. 
This Agreement is governed by the laws of <strong>${prefill.governingState ?? '[STATE]'}</strong>.</p>

<div class="sig-block">
<h2>SIGNATURES</h2>
${signers.map((s, i) => `
<p><strong>Homeowner ${i + 1}: ${s.name}</strong></p>
<p>Signature: [HOMEOWNER_SIGNATURE_${s.recipientId}] &nbsp;&nbsp;&nbsp; Date: _______________</p>
`).join('')}
<p><strong>TRAVLR Authorized Representative</strong></p>
<p>Signature: [TRAVLR_SIGNATURE] &nbsp;&nbsp;&nbsp; Date: _______________</p>
</div>
</body></html>`;

  return Buffer.from(html).toString('base64');
}
