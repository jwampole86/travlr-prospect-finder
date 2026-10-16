import 'server-only';
import { isProtectedContact } from '@/lib/protectedContacts';
import Anthropic from '@anthropic-ai/sdk';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { toE164, isSuppressed } from '@/lib/services/smsConsent';
import { duplicateTextReason } from '@/lib/services/smsDuplicateGuard';

type Db = ReturnType<typeof getSupabaseAdmin>;

const MODEL = process.env.SMS_OUTREACH_MODEL || 'claude-haiku-4-5-20251001';
export const SITE_URL = 'https://staytrvlr.com';
export const MAX_SEGMENTS = 3;

// Only real listing sites may be named as "where we found you". Values like Direct or Referral are not listings.
const PLATFORMS: Record<string, string> = {
  zillow: 'Zillow', trulia: 'Trulia', hotpads: 'HotPads', 'realtor.com': 'Realtor.com', padmapper: 'PadMapper',
  craigslist: 'Craigslist', 'apartments.com': 'Apartments.com', redfin: 'Redfin', 'facebook marketplace': 'Facebook Marketplace',
};
const PLATFORM_NAMES = [...new Set(Object.values(PLATFORMS))];

// One primary zone per state. Sends are limited to 9am-8pm local, narrower than the 8am-9pm legal window, to cover split-zone states.
const STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Denver', IL: 'America/Chicago', IN: 'America/New_York',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/New_York', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago',
  OH: 'America/New_York', OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago',
  WY: 'America/Denver',
};

export const LEAD_COLUMNS = 'id,address,city,state,zip,owner_name,contact_name,contact_phone,verified_owner,verified_number,source,sms_opt_in,sms_opted_out_at,program,listing_url,price_type,listing_agent_name,listing_broker_name';

export interface OutreachLead {
  id: string; address: string | null; city: string | null; state: string | null; zip: string | null;
  owner_name: string | null; contact_name: string | null; contact_phone: string | null;
  verified_owner: boolean | null; verified_number: boolean | null; source: string | null; sms_opt_in: boolean | null;
  sms_opted_out_at: string | null;
  program?: string | null;
  price_type?: string | null; listing_agent_name?: string | null; listing_broker_name?: string | null;
}

export type Blocker =
  | 'no_phone' | 'invalid_phone' | 'no_sms_consent' | 'opted_out' | 'do_not_contact' | 'no_address' | 'quiet_hours' | 'contacted_recently' | 'text_in_flight' | 'no_estimate' | 'too_long' | 'co_host_program' | 'protected_contact';

export interface OutreachDraft {
  leadId: string;
  message: string;
  segments: number;
  chars: number;
  generatedBy: 'ai' | 'template';
  platform: string | null;
  firstName: string | null;
  range: string;
  to: string | null;
  /** Full estimate link. The message carries a same-length placeholder short link until finalizeMessage() runs. */
  longUrl: string;
  blockers: Blocker[];
  /** False means this is a draft for review only. */
  canSend: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Carriers bill UCS-2 messages at 70 chars/segment, so keep everything GSM-7. */
export function toGsm(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a]/g, "'").replace(/[\u201c\u201d\u201e]/g, '"').replace(/\s*\u2014\s*/g, ' - ').replace(/\u2013/g, '-').replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ').replace(/[^\x0a\x20-\x7e]/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

export function countSegments(text: string): number {
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

const kfmt = (n: number) => `$${Math.round(n / 1000)}K`;
const COMPANY = /\b(llc|inc|corp|co|trust|lp|llp|pllc|ltd|holdings?|properties|property|realty|group|partners|invest\w*|management|mgmt|estate|living|homes?|rentals?|stays?|vacation|capital|ventures?|enterprises?|solutions|services|hospitality|lodging|bnb|association|&)\b/i;

export function firstNameOf(lead: OutreachLead): string | null {
  if (lead.verified_owner !== true || !lead.owner_name || COMPANY.test(lead.owner_name) || lead.owner_name.includes(',')) return null;
  const first = lead.owner_name.trim().split(/[\s,]+/)[0] ?? '';
  return /^[A-Za-z][A-Za-z'-]{1,20}$/.test(first) ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : null;
}

function platformOf(source: string | null): string | null {
  return source ? PLATFORMS[source.trim().toLowerCase()] ?? null : null;
}

function localHour(state: string | null, now: Date): number | null {
  const tz = state ? STATE_TZ[state.toUpperCase()] : null;
  if (!tz) return null;
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(now)) % 24;
}

/** 9am-8pm in the owner's time zone, and never before 9am Mountain whatever the owner's zone. */
export function inSendWindow(state: string | null, now = new Date()): boolean {
  const h = localHour(state, now);
  const mountain = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Denver' }).format(now)) % 24;
  return h !== null && h >= 9 && h < 20 && mountain >= 9;
}

export function longEstimateUrl(lead: OutreachLead, site: string): string {
  // The ZIP must be included: the estimate looks up local market data by ZIP, so without it the page can show a different range than the text.
  const addr = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  // "+" for spaces and literal commas keep the link about 15 characters shorter than full percent-encoding.
  return `${site.replace(/\/$/, '')}/estimate?address=${encodeURIComponent(addr).replace(/%20/g, '+').replace(/%2C/g, ',')}`;
}

const SHORT_CODE_LEN = 7;
const SHORT_PLACEHOLDER = 'x'.repeat(SHORT_CODE_LEN);
const shortUrl = (site: string, code: string) => `${site.replace(/\/$/, '')}/e/${code}`;

function footer(url: string): string {
  // One link only: a second link makes carrier spam filters more likely to block the text. STOP is the standard opt-out word.
  return `Free estimate: ${url}\nReply YES for your estimate, STOP to opt out`;
}

/**
 * Who the campaigns are for: owner-listed rentals (no listing agent or broker) whose owner we can greet by name.
 * Homes for sale are not pitched (the owner is selling), and a listing agent's phone is not the owner's.
 * Returns why a lead is out, or null when they fit.
 */
export function campaignFitReason(lead: OutreachLead): 'for_sale' | 'not_a_rental' | 'agent_listed' | 'no_owner_name' | null {
  if (lead.price_type === 'sale') return 'for_sale';
  if (lead.price_type !== 'rent') return 'not_a_rental';
  if (lead.listing_agent_name?.trim() || lead.listing_broker_name?.trim()) return 'agent_listed';
  if (!firstNameOf(lead)) return 'no_owner_name';
  return null;
}

// ─── Copy ────────────────────────────────────────────────────────────────────

interface Facts { greeting: string; street: string; platform: string | null; range: string; expected: string }

function templateHook(f: Facts, seed: number): string {
  const on = f.platform ? ` on ${f.platform}` : '';
  const variants = [
    `${f.greeting}, TRAVLR Vacation Homes here. We came across ${f.street}${on}. As a vacation rental it could potentially earn an estimated ${f.range}/yr.`,
    `${f.greeting}! This is TRAVLR Vacation Homes. We saw ${f.street}${on} and estimate it could potentially earn ${f.range}/yr as a managed vacation rental.`,
    `${f.greeting}, we're TRAVLR Vacation Homes. ${f.street}${on} caught our eye: we estimate it could potentially earn ${f.range}/yr as a vacation rental.`,
  ];
  return variants[seed % variants.length];
}

function hashSeed(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/** Rejects hooks that could mislead or break compliance. The model only ever supplies this opening, never links or the opt-out line. */
export function validateHook(hook: string, f: Facts): boolean {
  if (hook.length < 60 || hook.length > 200) return false;
  if (!/travlr/i.test(hook)) return false;
  if (/https?:|www\.|\.com\b|\bSTOP\b|\breply\b|\bYES\b/i.test(hook)) return false;
  if (/guarantee|promise|risk[- ]free|act now|limited time|urgent|last chance|you (?:will|'ll) (?:earn|make)/i.test(hook)) return false;
  if (!/estimat|potential|could|possible|may\b/i.test(hook)) return false;
  if (!hook.includes(f.range) && !hook.includes(f.expected)) return false;
  // Any other digits would be invented facts. Allowed: the dollar figures and the street address.
  const stripped = hook.replace(f.range, '').replace(f.expected, '').replace(f.street, '').replace(/\$\d+K/g, '');
  if (/\d/.test(stripped)) return false;
  // Never name a platform we did not actually find them on.
  for (const name of PLATFORM_NAMES) if (name !== f.platform && hook.toLowerCase().includes(name.toLowerCase())) return false;
  if (f.platform && !hook.includes(f.platform)) return false;
  return true;
}

export async function aiHook(f: Facts, tone: 'friendly' | 'direct', seed: number, maxChars = 140): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 15_000 });
  const openers = ['a warm greeting', 'a question about whether they have thought about vacation rentals', 'a direct statement of what you noticed', 'a short friendly intro'];
  const res = await client.messages.create({
    model: MODEL, max_tokens: 200, temperature: 0.8,
    system: `You write the opening of a cold outreach text message from TRAVLR Vacation Homes, a vacation rental management company, to a homeowner. Output ONLY the message text, ONE or TWO very short sentences, at most ${maxChars} characters in total (count them; longer messages are discarded), plain ASCII, no emojis, no links, no sign-off.
Rules:
- Start with ${openers[seed % openers.length]}. Begin with exactly this greeting: "${f.greeting}".
- Say it is TRAVLR Vacation Homes.
- Mention the street address "${f.street}" once.
${f.platform ? `- Say you came across their listing on ${f.platform}.` : '- Say you came across their property. Do NOT name any listing website.'}
- State that as a managed vacation rental the home could potentially earn an estimated ${f.range} per year after costs. Use exactly "${f.range}". Always say "estimated" or "could potentially". Never guarantee anything.
- Never write any other number. Never use words like guarantee, promise, urgent, limited time or act now.
- Tone: ${tone === 'friendly' ? 'warm, neighborly, low pressure' : 'brief, businesslike, respectful'}. Do not mention that you used AI.`,
    messages: [{ role: 'user', content: 'Write the message.' }],
  });
  const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(' ');
  return toGsm(text).replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim() || null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function draftOutreach(db: Db, lead: OutreachLead, opts: { site: string; tone?: 'friendly' | 'direct'; useAi?: boolean; now?: Date; /** Rescheduling scripts redraft texts that are already queued. */ ignoreInFlight?: boolean }): Promise<OutreachDraft> {
  const now = opts.now ?? new Date();
  const blockers: Blocker[] = [];
  // The text campaigns are only for homeowners we are converting to short-term rentals, never for existing hosts we would co-host.
  if (lead.program === 'co_host') blockers.push('co_host_program');
  if (isProtectedContact(lead.owner_name, lead.contact_name)) blockers.push('protected_contact');
  const to = toE164(lead.contact_phone);
  if (!lead.contact_phone?.trim()) blockers.push('no_phone'); else if (!to) blockers.push('invalid_phone');
  // Consent: a YES reply sets sms_opt_in. Texting a number that has never opted in is a business/legal decision, so it stays
  // off until SMS_FIRST_TOUCH_ENABLED=true is set. An explicit opt-out always wins.
  const optedOut = !!lead.sms_opted_out_at || await isSuppressed(db, lead.contact_phone);
  if (optedOut) blockers.push('opted_out');
  else if (lead.sms_opt_in !== true && process.env.SMS_FIRST_TOUCH_ENABLED !== 'true') blockers.push('no_sms_consent');
  if (!lead.address || !lead.state) blockers.push('no_address');
  if (!inSendWindow(lead.state, now)) blockers.push('quiet_hours');

  const [{ data: enrichment }, { data: recent }] = await Promise.all([
    db.from('lead_enrichments').select('do_not_contact').eq('lead_id', lead.id).maybeSingle(),
    db.from('outreach_history').select('id').eq('lead_id', lead.id).eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach')
      .gte('sent_at', new Date(now.getTime() - 30 * 86_400_000).toISOString()).limit(1),
  ]);
  if (enrichment?.do_not_contact === true) blockers.push('do_not_contact');
  if ((recent ?? []).length) blockers.push('contacted_recently');
  else if (!opts.ignoreInFlight && await duplicateTextReason(db, lead.id, 24)) blockers.push('text_in_flight');

  const addr = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  let range = '';
  let expected = '';
  if (lead.address && lead.state) {
    const report = await buildHomeownerReport(addr).catch(() => null);
    if (report) { range = `${kfmt(report.scenarios[0].annualNet)}-${kfmt(report.scenarios[2].annualNet)}`; expected = kfmt(report.scenarios[1].annualNet); }
  }
  if (!range) blockers.push('no_estimate');

  const firstName = firstNameOf(lead);
  const platform = platformOf(lead.source);
  const facts: Facts = { greeting: firstName ? `Hi ${firstName}` : 'Hi there', street: lead.address ?? 'your property', platform, range, expected };
  const seed = hashSeed(lead.id);

  let hook = '';
  let generatedBy: OutreachDraft['generatedBy'] = 'template';
  if (range) {
    if (opts.useAi !== false) {
      const segs = (h: string) => countSegments(toGsm(`${h}\n${footer(shortUrl(opts.site, SHORT_PLACEHOLDER))}`));
      for (let attempt = 0; attempt < 4 && !hook; attempt++) {
        try {
          // The model overshoots length limits, so each retry asks for a tighter budget.
          const candidate = await aiHook(facts, opts.tone ?? 'friendly', seed + attempt, [140, 120, 105, 95][attempt]);
          // The first try must fit 2 segments; later tries may use 3 so tailored copy is not always lost to the template.
          if (candidate && validateHook(candidate, facts) && segs(candidate) <= (attempt === 0 ? 2 : MAX_SEGMENTS)) { hook = candidate; generatedBy = 'ai'; }
        } catch { break; /* fall back to the template */ }
      }
    }
    if (!hook) hook = templateHook(facts, seed);
  }

  const message = range ? toGsm(`${hook}\n${footer(shortUrl(opts.site, SHORT_PLACEHOLDER))}`) : '';
  const segments = message ? countSegments(message) : 0;
  if (segments > MAX_SEGMENTS) blockers.push('too_long');
  return {
    leadId: lead.id, message, segments, chars: message.length, generatedBy, platform, firstName, range, to, blockers,
    longUrl: longEstimateUrl(lead, opts.site),
    canSend: blockers.length === 0,
  };
}

/** Creates (or reuses) the short link for this lead and returns the message with the real link in place of the placeholder. */
export async function finalizeMessage(db: Db, draft: OutreachDraft, site: string): Promise<string> {
  const { data: existing } = await db.from('link_clicks').select('token').eq('lead_id', draft.leadId)
    .eq('sequence_name', 'estimate_outreach').eq('original_url', draft.longUrl).limit(1).maybeSingle();
  let code = existing?.token as string | undefined;
  for (let attempt = 0; !code && attempt < 5; attempt++) {
    const candidate = Array.from({ length: SHORT_CODE_LEN }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
    const { error } = await db.from('link_clicks').insert({ token: candidate, lead_id: draft.leadId, sequence_name: 'estimate_outreach', original_url: draft.longUrl });
    if (!error) code = candidate;
  }
  // If a short link cannot be stored, fall back to the full link so the text still works.
  return code ? draft.message.replace(shortUrl(site, SHORT_PLACEHOLDER), shortUrl(site, code)) : draft.message.replace(shortUrl(site, SHORT_PLACEHOLDER), draft.longUrl);
}
