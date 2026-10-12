import 'server-only';
import { promises as dns } from 'dns';

export type ValidationLevel = 'ok' | 'warn' | 'error';

export interface EmailCheck {
  level: ValidationLevel;
  normalized: string;
  code: 'ok' | 'format' | 'disposable' | 'typo' | 'no_domain' | 'role' | 'dns_unknown';
  message: string | null;
  suggestion: string | null;
  mx: boolean | null;
}

export interface PhoneCheck {
  level: ValidationLevel;
  normalized: string; // E.164
  formatted: string;
  code: 'ok' | 'empty' | 'length' | 'area_code' | 'exchange' | 'fake' | 'international';
  message: string | null;
}

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'mintemail.com', 'spamgourmet.com', 'mailnesia.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'burnermail.io',
  'discard.email', 'moakt.com', 'tmpmail.org', 'mytemp.email', 'inboxkitten.com', 'trashmail.net', 'spambox.us', 'tempinbox.com',
]);

const COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'comcast.net', 'me.com', 'msn.com', 'live.com', 'protonmail.com', 'sbcglobal.net', 'att.net', 'verizon.net', 'cox.net'];
const KNOWN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com',
  'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'iclould.com': 'icloud.com',
};
const ROLE_LOCALS = new Set(['info', 'admin', 'sales', 'support', 'noreply', 'no-reply', 'contact', 'office', 'hello', 'webmaster', 'postmaster']);

function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[m][n];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms))]);
}

/** Checks the address is well formed, not disposable, not a likely typo, and that its domain can receive mail. */
export async function validateEmail(input: string): Promise<EmailCheck> {
  const email = (input || '').trim().toLowerCase();
  const base: EmailCheck = { level: 'ok', normalized: email, code: 'ok', message: null, suggestion: null, mx: null };
  const at = email.lastIndexOf('@');
  const local = at > 0 ? email.slice(0, at) : '';
  const domain = at > 0 ? email.slice(at + 1) : '';
  const formatOk = email.length <= 254 && local.length > 0 && local.length <= 64 && !/\.\./.test(email) && !/^\.|\.$/.test(local)
    && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) && !domain.startsWith('-') && !domain.endsWith('-');
  if (!formatOk) return { ...base, level: 'error', code: 'format', message: 'Please enter a valid email address, like name@example.com' };

  if (DISPOSABLE.has(domain)) return { ...base, level: 'error', code: 'disposable', message: 'Please use a personal email address you check regularly. Temporary inboxes cannot receive your report.' };

  let suggestion: string | null = KNOWN_TYPOS[domain] ?? null;
  if (!suggestion && !COMMON_DOMAINS.includes(domain)) {
    const near = COMMON_DOMAINS.find(d => Math.abs(d.length - domain.length) <= 1 && distance(d, domain) === 1);
    if (near) suggestion = near;
  }
  if (suggestion) return { ...base, level: 'warn', code: 'typo', suggestion: `${local}@${suggestion}`, message: `Did you mean ${local}@${suggestion}?` };

  // Can the domain receive mail? Only a definite "no such domain" is treated as an error; timeouts never block a homeowner.
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 3000);
    if (mx.length > 0) return { ...base, mx: true, level: ROLE_LOCALS.has(local) ? 'warn' : 'ok', code: ROLE_LOCALS.has(local) ? 'role' : 'ok', message: ROLE_LOCALS.has(local) ? 'This looks like a shared inbox. Use a personal address if you want to be sure we reach you.' : null };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      try {
        const a = await withTimeout(dns.resolve4(domain), 3000);
        if (a.length > 0) return { ...base, mx: false, level: 'ok' };
      } catch { /* fall through */ }
      return { ...base, mx: false, level: 'error', code: 'no_domain', message: `We couldn't find the email domain "${domain}". Please check the spelling.` };
    }
  }
  return { ...base, code: 'dns_unknown' };
}

/** US/Canada numbers are validated against the North American numbering plan; other numbers need a country code. */
export function validatePhone(input: string): PhoneCheck {
  const raw = (input || '').trim();
  const empty: PhoneCheck = { level: 'ok', normalized: '', formatted: '', code: 'empty', message: null };
  if (!raw) return empty;
  const digits = raw.replace(/\D/g, '');
  const international = raw.startsWith('+') && !raw.startsWith('+1');
  if (international) {
    if (digits.length < 8 || digits.length > 15) return { ...empty, level: 'error', code: 'length', message: 'Please enter a valid phone number including the country code' };
    return { level: 'warn', normalized: `+${digits}`, formatted: `+${digits}`, code: 'international', message: 'International number saved. We will confirm the best way to reach you.' };
  }
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const bad = (code: PhoneCheck['code'], message: string): PhoneCheck => ({ level: 'error', normalized: '', formatted: '', code, message });
  if (national.length !== 10) return bad('length', 'Please enter a 10-digit US phone number, including the area code');
  const area = national.slice(0, 3), exchange = national.slice(3, 6), line = national.slice(6);
  if (!/^[2-9]\d\d$/.test(area) || /^[2-9]11$/.test(area)) return bad('area_code', 'That area code does not look right. Please check the number.');
  if (!/^[2-9]/.test(exchange) || /^[2-9]11$/.test(exchange)) return bad('exchange', 'That phone number does not look right. Please check it.');
  const fake = /^(\d)\1{9}$/.test(national) || national === '1234567890' || national === '0123456789' || (exchange === '555' && /^01\d\d$/.test(line)) || national.slice(3) === '5551212'
    || /^(\d)\1{6}$/.test(national.slice(3));
  if (fake) return bad('fake', 'Please enter a real phone number we can reach you on.');
  return { level: 'ok', normalized: `+1${national}`, formatted: `(${area}) ${exchange}-${line}`, code: 'ok', message: null };
}

export interface ContactValidation {
  email: EmailCheck;
  phone: PhoneCheck;
  /** field -> message for anything that must be fixed before we accept the submission */
  errors: Record<string, string>;
  /** typo suggestion for the email, when the homeowner has not already confirmed their spelling */
  emailSuggestion: string | null;
}

export async function validateContact(input: { email: string; phone?: string; phoneRequired?: boolean; keepEmail?: boolean }): Promise<ContactValidation> {
  const email = await validateEmail(input.email);
  const phone = validatePhone(input.phone ?? '');
  const errors: Record<string, string> = {};
  if (email.level === 'error') errors.email = email.message || 'Please enter a valid email';
  if (email.code === 'typo' && !input.keepEmail) errors.email = email.message || 'Please check your email address';
  if (phone.level === 'error') errors.phone = phone.message || 'Please enter a valid phone number';
  if (input.phoneRequired && !input.phone?.trim()) errors.phone = 'Please enter a phone number we can call';
  return { email, phone, errors, emailSuggestion: email.code === 'typo' ? email.suggestion : null };
}
