import { Resend } from 'resend';

function isConfigured(value: string | undefined): value is string {
  return Boolean(value && !/your-|placeholder|changeme|example/i.test(value));
}

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!isConfigured(apiKey)) {
    throw new Error('RESEND_API_KEY is not configured with a valid Resend API key');
  }
  return new Resend(apiKey);
}

/** `brandName` (NAVEO Stays or NAVEO Homes) is the sender name an owner sees; without it the configured name, then NAVEO, is used. */
export function getResendFrom(brandName?: string): string {
  const email = process.env.RESEND_FROM_EMAIL;
  const name = brandName || process.env.RESEND_FROM_NAME || 'NAVEO';
  if (!isConfigured(email)) {
    throw new Error('RESEND_FROM_EMAIL is not configured with a verified sender address');
  }
  return `${name} <${email}>`;
}

export function getResendConfigStatus() {
  const senderEmail = process.env.RESEND_FROM_EMAIL;
  const senderDomain = senderEmail?.split('@')[1] || null;
  const senderIsSandbox = senderDomain === 'resend.dev';
  return {
    apiKeyConfigured: isConfigured(process.env.RESEND_API_KEY),
    senderConfigured: isConfigured(senderEmail),
    senderDomain,
    senderIsSandbox,
    productionReady: isConfigured(process.env.RESEND_API_KEY) && isConfigured(senderEmail) && !senderIsSandbox,
  };
}
