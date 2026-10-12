import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

// Signed links let us confirm a homeowner really received our email without a login or a second email.
function secret(): string {
  const s = process.env.ESTIMATE_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!s || /your-|placeholder/i.test(s)) throw new Error('No signing secret configured');
  return s;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 22);

/** Token for "this email address belongs to this lead". Opaque to the recipient. */
export function createEmailConfirmToken(leadId: string, email: string): string {
  const body = Buffer.from(JSON.stringify({ l: leadId, e: email.trim().toLowerCase() })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readEmailConfirmToken(token: string): { leadId: string; email: string } | null {
  try {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac) return null;
    const expected = sign(body);
    const a = Buffer.from(mac), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof parsed.l === 'string' && typeof parsed.e === 'string' ? { leadId: parsed.l, email: parsed.e } : null;
  } catch {
    return null;
  }
}

/** Resend signs webhooks with Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}` using the base64 part of the whsec_ secret. */
export function verifySvixSignature(args: { id: string | null; timestamp: string | null; signature: string | null; body: string; secret: string }): boolean {
  const { id, timestamp, signature, body } = args;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(args.secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some(part => {
    const [, sig] = part.split(',');
    if (!sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
