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

/** Each NAVEO brand sends from its own domain: RESEND_FROM_EMAIL_STAYS and RESEND_FROM_EMAIL_HOMES. Until one is set, that brand uses RESEND_FROM_EMAIL. */
function senderEmailFor(brandName?: string): string | undefined {
  const brand = /homes/i.test(brandName ?? '') ? process.env.RESEND_FROM_EMAIL_HOMES : /stays/i.test(brandName ?? '') ? process.env.RESEND_FROM_EMAIL_STAYS : undefined;
  return isConfigured(brand?.trim()) ? brand!.trim() : process.env.RESEND_FROM_EMAIL;
}

/** `brandName` (NAVEO Stays or NAVEO Homes) is the sender name an owner sees and picks that brand's sending address; without it the configured name and address, then NAVEO, are used. */
export function getResendFrom(brandName?: string): string {
  const email = senderEmailFor(brandName);
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
    staysSenderDomain: senderEmailFor('NAVEO Stays')?.split('@')[1] || null,
    homesSenderDomain: senderEmailFor('NAVEO Homes')?.split('@')[1] || null,
    productionReady: isConfigured(process.env.RESEND_API_KEY) && isConfigured(senderEmail) && !senderIsSandbox,
  };
}
