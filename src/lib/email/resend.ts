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

export function getResendFrom(): string {
  const email = process.env.RESEND_FROM_EMAIL;
  const name = process.env.RESEND_FROM_NAME || 'TRAVLR Pro';
  if (!isConfigured(email)) {
    throw new Error('RESEND_FROM_EMAIL is not configured with a verified sender address');
  }
  return `${name} <${email}>`;
}

export function getResendConfigStatus() {
  return {
    apiKeyConfigured: isConfigured(process.env.RESEND_API_KEY),
    senderConfigured: isConfigured(process.env.RESEND_FROM_EMAIL),
    senderDomain: process.env.RESEND_FROM_EMAIL?.split('@')[1] || null,
  };
}
