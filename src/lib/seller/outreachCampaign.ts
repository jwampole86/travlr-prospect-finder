/**
 * The seller and owner outreach campaign: one short question ("sale, long-term rent, short-term rent, or still deciding?"), then one
 * message matched to the answer. Pure text and rules, shared by the server (reply handling) and the Campaign tab (the message library).
 * Nothing here sends anything: a person sends every message, and a reply never routes an owner on its own.
 */
import type { ServiceLine } from './types';
import { OUTREACH_BRANDS } from '@/lib/brands';

export type Choice = 'sale' | 'rent_ltr' | 'rent_str' | 'both';

export interface ChoiceInfo {
  number: 1 | 2 | 3 | 4;
  label: string;
  /** The service the owner is most likely to need. A person still confirms eligibility and routes; this is only a starting point. */
  suggestedService: ServiceLine | null;
  /** Where the owner goes next, in the team's words. */
  destination: string;
  /** What the team does next. */
  nextAction: string;
}

export const CHOICES: Record<Choice, ChoiceInfo> = {
  sale: { number: 1, label: 'Sale', suggestedService: 'sale_partner', destination: 'Seller solutions', nextAction: 'Qualification call and authority check' },
  rent_ltr: { number: 2, label: 'Long-term rental', suggestedService: 'long_term_management', destination: 'NAVEO Homes', nextAction: 'Eligibility and scope call' },
  rent_str: { number: 3, label: 'Short-term rental', suggestedService: 'str_management', destination: 'NAVEO Stays', nextAction: 'Short-term rental checklist and fit review' },
  both: { number: 4, label: 'Both or still deciding', suggestedService: null, destination: 'Options consultation', nextAction: 'Options map call' },
};

export const CHOICE_ORDER: Choice[] = ['sale', 'rent_ltr', 'rent_str', 'both'];

/** The sentence that makes a text the campaign's question. A "1" to 4 reply only counts when the last text we sent contained it. */
export const ENTRY_MARKER = 'Reply with 1, 2, 3 or 4';

export const isEntryQuestion = (sentText: string | null | undefined) => !!sentText && sentText.toLowerCase().includes(ENTRY_MARKER.toLowerCase());

const WORDS: Array<[RegExp, Choice]> = [
  [/^(sell|selling|sale|sell it|for sale)$/, 'sale'],
  [/^(long term|longterm|long term rental|long term rent|rent long term)$/, 'rent_ltr'],
  [/^(short term|shortterm|short term rental|short term rent|rent short term|airbnb|vacation rental)$/, 'rent_str'],
  [/^(both|still deciding|undecided|exploring|not sure|unsure|still exploring|open to both)$/, 'both'],
];

/**
 * Reads an owner's answer to the entry question. Only a clear, whole-message answer counts: "2", "#2", "option 3", "2." or one of a few
 * plain phrases. Anything longer ("I'm not selling, but maybe a rental") is left for a person to read.
 */
export function parseChoice(raw: string): Choice | null {
  const t = String(raw ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const digit = t.match(/^(?:option |number |choice |reply )?([1-4])$/);
  if (digit) return CHOICE_ORDER[Number(digit[1]) - 1];
  for (const [re, choice] of WORDS) if (re.test(t)) return choice;
  return null;
}

/** `brand` is who the message is from: NAVEO Stays for a home for rent, NAVEO Homes for one for sale (see lib/brands.ts). */
export interface CampaignVars { first_name?: string; agent_name?: string; address?: string; brand?: string; company_address?: string }

const HOMES_LINK = `${OUTREACH_BRANDS.homes.siteUrl}/sell`;
const STAYS_LINK = `${OUTREACH_BRANDS.stays.siteUrl}/for-owners#analysis`;

/** Fills {{first_name}}, {{agent_name}}, {{address}} and {{brand}}, with a plain fallback when one is not known, and the two site links. */
export function renderMessage(text: string, vars: CampaignVars = {}): string {
  const v = {
    first_name: vars.first_name?.trim() || 'there',
    agent_name: vars.agent_name?.trim() || 'the NAVEO team',
    address: vars.address?.trim() || 'your property',
    brand: vars.brand?.trim() || 'NAVEO',
    valuation_link: HOMES_LINK,
    owner_link: STAYS_LINK,
  };
  return text.replace(/\{\{\s*(first_name|agent_name|address|brand|valuation_link|owner_link)\s*\}\}/g, (_, k: keyof typeof v) => v[k]);
}

/**
 * What every email needs at the bottom: who it is from, a mailing address and a way to stop. The address is the company's own (COMPANY_POSTAL_ADDRESS);
 * when it is not known the footer says so in brackets so it cannot be sent without one by accident.
 */
export function emailFooter(vars: CampaignVars = {}): string {
  const address = vars.company_address?.trim() || '[add your company mailing address]';
  return `--\n${vars.brand?.trim() || 'NAVEO'}, ${address}\nIf you would rather not get these emails, reply "unsubscribe" or use the unsubscribe link and we will stop right away.`;
}

export interface CampaignMessage {
  id: string;
  /** Who may be sent this one, shown on the card. */
  note?: string;
  /** Where in the campaign it belongs. */
  step: 'entry' | 'branch' | 'follow_up';
  choice?: Choice;
  channel: 'sms' | 'email';
  /** Which kind of property the first and follow-up messages are for. A home for rent gets the options question; a home for sale is helped to sell. Branch messages apply to both. */
  listing?: 'rent' | 'sale';
  title: string;
  /** Email subject (the first one is the default; the rest are for testing). */
  subjects?: string[];
  body: string;
}

const STOP = ' Reply STOP to opt out.';

export const MESSAGES: CampaignMessage[] = [
  {
    id: 'entry-sms', step: 'entry', listing: 'rent', channel: 'sms', title: 'First text: what are you looking for?',
    body: `Hi {{first_name}}, this is {{agent_name}} with {{brand}}.\nYou reached out (or we spoke) about your property at {{address}}.\nQuick question so we send the right info:\nAre you mainly looking to sell, rent long-term, rent short-term, or still deciding?\n${ENTRY_MARKER}.${STOP}`,
  },
  {
    id: 'entry-email', step: 'entry', listing: 'rent', channel: 'email', title: 'First email: what are you looking for?',
    subjects: ['Quick question about {{address}}', 'Sell, rent, or both? We need 10 seconds', "So we don't send the wrong options…"],
    body: `Hi {{first_name}},\n\nThanks for connecting with us about {{address}}.\n\nTo make sure we only send relevant options (and respect your time), can you tell us what you're currently considering?\n\n1. Selling the property\n2. Long-term rental management\n3. Short-term / vacation rental (Airbnb-style)\n4. Still exploring / open to more than one\n\nJust reply with the number.\n\nWe'll only follow up with the path that matches what you choose.\n\n– {{agent_name}}\n{{brand}}`,
  },
  {
    id: 'sale-sms', step: 'branch', choice: 'sale', channel: 'sms', title: 'Sale: text',
    body: `Got it — you're considering a sale.\nWe'll keep this simple. Next step is a short qualification so we can route you correctly (licensed sale pathway or other options if timing isn't right).\nReply YES to schedule a quick call, or reply with your preferred timeline (e.g. 30 days, 90 days, exploring).`,
  },
  {
    id: 'sale-email', step: 'branch', choice: 'sale', channel: 'email', title: 'Sale: email', subjects: ['Next step for {{address}} (sale path)'],
    body: `Hi {{first_name}},\n\nThanks for confirming you're looking at a sale for {{address}}.\n\nHere's exactly what happens next:\n\n1. We confirm you have authority to discuss the property\n2. We capture timeline, occupancy, and goals\n3. We route you to the correct licensed pathway or service options\n\nThis is not a listing appointment and we will not make any promises about price or sale until the proper steps are complete.\n\nReply to this email or text YES and we'll get the short qualification on the calendar.\n\n– {{agent_name}}`,
  },
  {
    id: 'ltr-sms', step: 'branch', choice: 'rent_ltr', channel: 'sms', title: 'Long-term rental: text',
    body: `Understood — long-term rental management.\nWe can walk you through what NAVEO Homes covers (tenant placement, oversight, reporting) and whether the property is a fit.\nReply YES for a short call or send your preferred days.`,
  },
  {
    id: 'ltr-email', step: 'branch', choice: 'rent_ltr', channel: 'email', title: 'Long-term rental: email', subjects: ['Long-term management options for {{address}}'],
    body: `Hi {{first_name}},\n\nYou indicated interest in long-term rental management for {{address}}.\n\nNAVEO Homes focuses on:\n• Tenant placement & screening\n• Ongoing property oversight\n• Clear owner reporting\n• Local compliance and vendor coordination\n\nNext step is a short qualification so we can confirm eligibility and scope. No commitment required to have the conversation.\n\nReply YES or let us know a good time.\n\n– {{agent_name}}\nNAVEO Homes`,
  },
  {
    id: 'str-sms', step: 'branch', choice: 'rent_str', channel: 'sms', title: 'Short-term rental: text',
    body: `Got it — short-term / vacation rental interest.\nNAVEO Stays handles setup + operations where the property and local rules allow.\nReply YES if you'd like the eligibility checklist and next steps.`,
  },
  {
    id: 'str-email', step: 'branch', choice: 'rent_str', channel: 'email', title: 'Short-term rental: email', subjects: ['Short-term rental path for {{address}}'],
    body: `Hi {{first_name}},\n\nThanks for confirming interest in short-term rental for {{address}}.\n\nNAVEO Stays is our specialist operation for eligible properties. Before anything else we check:\n• Local STR rules & building restrictions\n• Insurance and safety requirements\n• Owner goals and timeline\n• Whether the property is a realistic operational fit\n\nIf it clears those gates, we can discuss management scope and onboarding.\n\nReply YES and we'll send the short eligibility questions or jump on a quick call.\n\n– {{agent_name}}\nNAVEO Stays`,
  },
  {
    id: 'both-sms', step: 'branch', choice: 'both', channel: 'sms', title: 'Both or still deciding: text',
    body: `Understood — you're open to more than one option.\nWe can map sale vs long-term vs short-term against your timeline and the property so you can choose with clear next steps.\nReply YES for a short options call.`,
  },
  {
    id: 'both-email', step: 'branch', choice: 'both', channel: 'email', title: 'Both or still deciding: email', subjects: ['Options map for {{address}}'],
    body: `Hi {{first_name}},\n\nYou told us you're still weighing options for {{address}} (sale, long-term rent, short-term, or a combination).\n\nWe'll keep this practical:\n1. Confirm current situation (occupancy, timeline, goals)\n2. Show which paths are realistically available\n3. Give you one clear recommended next step (no pressure)\n\nReply YES and we'll schedule a short options conversation.\n\n– {{agent_name}}\n{{brand}}`,
  },
  {
    id: 'followup-day3-sms', step: 'follow_up', listing: 'rent', channel: 'sms', title: 'No reply, day 3: text',
    body: `Hi {{first_name}}, just circling back on {{address}}.\nStill happy to help whether you're leaning sale, rent, or still deciding.\n${ENTRY_MARKER} whenever you're ready (1 sale, 2 long-term, 3 short-term, 4 still deciding).${STOP}`,
  },
  {
    id: 'followup-day7-email', step: 'follow_up', listing: 'rent', channel: 'email', title: 'No reply, day 7: email', subjects: ['Still here if you want the right path for {{address}}'],
    body: `Hi {{first_name}},\n\nNo rush — just keeping the door open.\n\nWhenever you're ready, reply with:\n1 = Sale\n2 = Long-term management\n3 = Short-term / Stays\n4 = Still exploring\n\nWe'll only send the matching next step.\n\n– {{agent_name}}`,
  },
];

const SALE_PITCH = "If a sale is on the table, we connect owners with a licensed local broker to guide the sale, and if the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental in the meantime.";

/** For a home that is for sale: the first approach is helping them sell. No property management, no promise of a sale price or income. */
export const SALE_MESSAGES: CampaignMessage[] = [
  {
    id: 'sale-entry-sms', step: 'entry', listing: 'sale', channel: 'sms', title: 'For sale, first text',
    body: `Hi {{first_name}}, this is {{agent_name}} with {{brand}}.\nI'm reaching out about {{address}}.\n${SALE_PITCH}\nWorth a short conversation? Reply YES, or STOP to opt out.`,
  },
  {
    id: 'sale-entry-email', step: 'entry', listing: 'sale', channel: 'email', title: 'For sale, first email',
    subjects: ['Selling {{address}}? Here to help', 'A thought about {{address}}'],
    body: `Hi {{first_name}},\n\nI'm reaching out about {{address}}.\n\n${SALE_PITCH}\n\nWorth a short conversation? Just reply and we'll find a time that suits you.\n\n– {{agent_name}}\n{{brand}}`,
  },
  {
    id: 'sale-followup-day3-sms', step: 'follow_up', listing: 'sale', channel: 'sms', title: 'For sale, no reply, day 3: text',
    body: `Hi {{first_name}}, just circling back on {{address}}. Still happy to talk through a sale, and a short-term rental while it's listed. Reply YES for a quick chat, or STOP to opt out.`,
  },
  {
    id: 'sale-followup-day7-email', step: 'follow_up', listing: 'sale', channel: 'email', title: 'For sale, no reply, day 7: email', subjects: ['Still here if you want help selling {{address}}'],
    body: `Hi {{first_name}},\n\nNo rush. I'm keeping the door open in case you'd like support with a sale of {{address}}, or want to talk through a short-term rental while it's listed.\n\nJust reply whenever you're ready.\n\n– {{agent_name}}\n{{brand}}`,
  },
];
MESSAGES.push(...SALE_MESSAGES);

/** The first and follow-up messages for a kind of property. */
export const messagesForListing = (listing: 'rent' | 'sale', step: 'entry' | 'follow_up') => MESSAGES.filter((m) => m.step === step && m.listing === listing);

/** The messages to offer a person once an owner has answered: the text and the email for their choice. */
export const messagesForChoice = (choice: Choice) => MESSAGES.filter((m) => m.step === 'branch' && m.choice === choice);

// ─── Ready-made campaigns ─────────────────────────────────────────────────────────────────────────────────────
// Short, low-pressure sequences for owners who have agreed to hear from us. Each text ends with the opt-out line; each email gets the footer when copied.
// The claims are the ones the sites really make: estimates are preliminary and not an appraisal, rental income is never promised, and Stays homes meet quality standards.

export interface ReadyCampaign {
  id: string;
  title: string;
  /** Which NAVEO the messages are from; it fills {{brand}} in them whatever property type the tab is showing. */
  brand: 'homes' | 'stays';
  audience: string;
  /** The permission to have before sending. */
  consent: string;
  messages: CampaignMessage[];
}

const NOTE_ESTIMATE = 'An estimate, not an appraisal or an offer. Rental income depends on local rules and is never promised.';

export const READY_CAMPAIGNS: ReadyCampaign[] = [
  {
    id: 'homes-valuation', title: 'NAVEO Homes: estimated value and sale timeline', brand: 'homes',
    audience: 'Owners showing seller intent, or with high equity, who agreed to hear from NAVEO Homes.',
    consent: 'Texts only to owners who agreed to texts; emails only with email permission. Never to Do Not Contact or anyone who replied STOP.',
    messages: [
      {
        id: 'rc-homes-email-1', step: 'entry', listing: 'sale', channel: 'email', title: 'Valuation invite: email', subjects: ["Your home's estimated value and sale timeline"], note: NOTE_ESTIMATE,
        body: `Hi {{first_name}},\n\nYour property at {{address}} may be worth a look if you're thinking about selling.\n\n{{brand}} can show you:\n• A preliminary estimated value range\n• An estimated time-to-sale range\n• An optional look at temporary rental income while the home is listed\n\nIt's free, with no obligation, and takes a few minutes. It's a preliminary estimate, not an appraisal or an offer.\n\nGet your estimate:\n{{valuation_link}}\n\nBest,\n{{agent_name}}\n{{brand}}`,
      },
      {
        id: 'rc-homes-sms-1', step: 'entry', listing: 'sale', channel: 'sms', title: 'Valuation ask: text',
        body: `Hi {{first_name}}, this is {{agent_name}} with {{brand}}. We can send a free preliminary value range for {{address}}. Reply YES for the link.${STOP}`,
      },
      {
        id: 'rc-homes-email-30', step: 'follow_up', listing: 'sale', channel: 'email', title: 'Day 30: email', subjects: ['Still thinking about {{address}}?'],
        body: `Hi {{first_name}},\n\nIt's been about a month since I reached out about {{address}}.\n\nIf your plans have changed, or you're just curious what the numbers look like now, I can send a fresh preliminary estimate. No pressure either way.\n\n{{valuation_link}}\n\n{{agent_name}}\n{{brand}}`,
      },
    ],
  },
  {
    id: 'homes-dual-path', title: 'NAVEO Homes: sell now, or earn while you wait?', brand: 'homes',
    audience: 'Owners open to either a sale or temporary rental income while the home is listed.',
    consent: 'Same as above. Mention rental income only for homes where short-term rentals are allowed or not yet confirmed, and keep the "may" wording.',
    messages: [
      {
        id: 'rc-homes-email-2', step: 'follow_up', listing: 'sale', channel: 'email', title: 'Dual path, day 3: email', subjects: ['Sell now, or earn while you wait?'], note: NOTE_ESTIMATE,
        body: `Hi {{first_name}},\n\nMany owners want to know two things about a home like {{address}}:\n1. What it could sell for\n2. Whether it could earn rental income while it's on the market\n\nNAVEO looks at both separately, so you can choose to sell only or explore "earn while you sell." Rental income depends on local rules and isn't guaranteed.\n\nSee your preliminary analysis:\n{{valuation_link}}\n\nNo listing agreement is needed to start.\n\n{{agent_name}}\n{{brand}}`,
      },
      {
        id: 'rc-homes-sms-2', step: 'follow_up', listing: 'sale', channel: 'sms', title: 'Dual path: text',
        body: `{{first_name}}, {{brand}} can show a sale estimate and possible rental income while {{address}} is listed. Want the free review? Reply YES.${STOP}`,
      },
    ],
  },
  {
    id: 'stays-owner', title: 'NAVEO Stays: list your vacation home', brand: 'stays',
    audience: 'Owners of short-term rentals, or homes that could be, who agreed to hear from NAVEO Stays.',
    consent: 'Texts only to owners who agreed to texts; emails only with email permission. Never to Do Not Contact or anyone who replied STOP.',
    messages: [
      {
        id: 'rc-stays-email-1', step: 'entry', listing: 'rent', channel: 'email', title: 'Owner invitation: email', subjects: ['List your vacation home with transparent pricing'], note: NOTE_ESTIMATE,
        body: `Hi {{first_name}},\n\n{{brand}} helps owners reach guests directly, with:\n• All-in pricing shown to guests, with no guest service fee\n• Homes that meet our quality standards\n• Your choice of listing only or full-service management\n\nIf {{address}} is, or could be, a short-term rental, we'd like to show you estimated occupancy and net income scenarios. They're estimates, and income isn't guaranteed.\n\nSee owner options:\n{{owner_link}}\n\nBest,\n{{agent_name}}\n{{brand}}\nowners@naveo.com`,
      },
      {
        id: 'rc-stays-sms-1', step: 'entry', listing: 'rent', channel: 'sms', title: 'Owner outreach: text',
        body: `Hi {{first_name}}, {{agent_name}} from {{brand}}. We help vacation-home owners with transparent guest pricing and optional management. Want a free look at {{address}}? Reply YES.${STOP}`,
      },
      {
        id: 'rc-stays-email-2', step: 'follow_up', listing: 'rent', channel: 'email', title: 'How we work, day 4: email', subjects: ['How owners work with NAVEO Stays'],
        body: `Hi {{first_name}},\n\nHere's what {{brand}} focuses on:\n• Clear guest pricing\n• Direct guest demand\n• Owner control: list only, or add full-service management\n\nWe can take a no-obligation look at {{address}}: a permit check, a pricing range and an estimated net income.\n\nStart here:\n{{owner_link}}\n\n{{agent_name}}\n{{brand}}`,
      },
      {
        id: 'rc-stays-email-30', step: 'follow_up', listing: 'rent', channel: 'email', title: 'Day 30: email', subjects: ['Quick check on {{address}}'],
        body: `Hi {{first_name}},\n\nJust circling back on {{address}}.\n\nIf you're still open to looking at rental income or listing options, I'm happy to run an updated estimate. If the timing's off, no worries at all.\n\n{{owner_link}}\n\n{{agent_name}}\n{{brand}}`,
      },
    ],
  },
  {
    id: 'stays-bridge', title: 'NAVEO Stays: rental income while listed for sale', brand: 'stays',
    audience: 'NAVEO Homes leads whose recommendation is Sell + Earn.',
    consent: 'Send only if the owner ticked the rental follow-up box ("I consent to NAVEO following up about temporary rental options"). NAVEO Stays is a separate sender from NAVEO Homes, so a sale-only permission is not enough.',
    messages: [
      {
        id: 'rc-stays-sms-bridge', step: 'entry', listing: 'sale', channel: 'sms', title: 'Bridge from a sale lead: text',
        body: `{{first_name}}, {{address}} may qualify for temporary rental income while it's listed for sale. {{brand}} can check. Reply YES for details.${STOP}`,
      },
    ],
  },
];
