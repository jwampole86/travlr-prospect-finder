import 'server-only';
import type { NextRequest } from 'next/server';
import { verifyTwilioSignature } from '@/lib/services/smsConsent';

/**
 * Checks Twilio's signature on a form-encoded webhook. Twilio signs the exact URL it was given, so the configured site URL and the URL the request
 * arrived on are both tried. Returns false only when a token is configured and neither matches; null when there is nothing to check against.
 */
export function verifyTwilioFormRequest(req: NextRequest, formData: FormData): boolean | null {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { if (typeof value === 'string') params[key] = value; });
  const signature = req.headers.get('x-twilio-signature');
  const path = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  const hosts = [process.env.NEXT_PUBLIC_SITE_URL, req.nextUrl.origin].filter((h): h is string => Boolean(h)).map((h) => h.replace(/\/$/, ''));
  let result: boolean | null = null;
  for (const host of new Set(hosts)) {
    const r = verifyTwilioSignature(`${host}${path}`, params, signature);
    if (r === true) return true;
    if (r === false) result = false;
  }
  return result;
}
