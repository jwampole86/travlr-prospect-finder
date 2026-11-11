/**
 * The seller and owner outreach campaign: one short question ("sale, long-term rent, short-term rent, or still deciding?"), then one
 * message matched to the answer. Pure text and rules, shared by the server (reply handling) and the Campaign tab (the message library).
 * Nothing here sends anything: a person sends every message, and a reply never routes an owner on its own.
 */
import type { ServiceLine } from './types';

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
export interface CampaignVars { first_name?: string; agent_name?: string; address?: string; brand?: string }

/** Fills {{first_name}}, {{agent_name}} and {{address}}, with a plain fallback when one is not known. */
export function renderMessage(text: string, vars: CampaignVars = {}): string {
  const v = {
    first_name: vars.first_name?.trim() || 'there',
    agent_name: vars.agent_name?.trim() || 'your AVYRO team',
    address: vars.address?.trim() || 'your property',
    brand: vars.brand?.trim() || 'NAVEO',
  };
  return text.replace(/\{\{\s*(first_name|agent_name|address|brand)\s*\}\}/g, (_, k: keyof typeof v) => v[k]);
}

export interface CampaignMessage {
  id: string;
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

const SALE_PITCH = "We help owners sell their home through NAVEO Homes, and it may be able to earn while it's on the market. Not in a rush? NAVEO Stays could be another option.";

/** For a home that is for sale: the first approach is helping them sell. No property management, no promise of a sale price or income. */
export const SALE_MESSAGES: CampaignMessage[] = [
  {
    id: 'sale-entry-sms', step: 'entry', listing: 'sale', channel: 'sms', title: 'For sale, first text',
    body: `Hi {{first_name}}, this is {{agent_name}} with {{brand}}.\nI saw {{address}} is for sale and wanted to reach out.\n${SALE_PITCH}\nOpen to a quick chat? Reply YES, or STOP to opt out.`,
  },
  {
    id: 'sale-entry-email', step: 'entry', listing: 'sale', channel: 'email', title: 'For sale, first email',
    subjects: ['Selling {{address}}? Here to help', 'A thought about {{address}}'],
    body: `Hi {{first_name}},\n\nI saw {{address}} is for sale and wanted to reach out.\n\n${SALE_PITCH}\n\nWould you be open to a quick conversation? Just reply and we'll find a time that suits you.\n\n– {{agent_name}}\n{{brand}}`,
  },
  {
    id: 'sale-followup-day3-sms', step: 'follow_up', listing: 'sale', channel: 'sms', title: 'For sale, no reply, day 3: text',
    body: `Hi {{first_name}}, just circling back on {{address}}. Still happy to help you sell, and to talk through earning while it's on the market. Reply YES for a quick chat, or STOP to opt out.`,
  },
  {
    id: 'sale-followup-day7-email', step: 'follow_up', listing: 'sale', channel: 'email', title: 'For sale, no reply, day 7: email', subjects: ['Still here if you want help selling {{address}}'],
    body: `Hi {{first_name}},\n\nNo rush. I'm keeping the door open in case you'd like help selling {{address}}, or want to talk through whether it could earn while it's on the market.\n\nJust reply whenever you're ready.\n\n– {{agent_name}}\n{{brand}}`,
  },
];
MESSAGES.push(...SALE_MESSAGES);

/** The first and follow-up messages for a kind of property. */
export const messagesForListing = (listing: 'rent' | 'sale', step: 'entry' | 'follow_up') => MESSAGES.filter((m) => m.step === step && m.listing === listing);

/** The messages to offer a person once an owner has answered: the text and the email for their choice. */
export const messagesForChoice = (choice: Choice) => MESSAGES.filter((m) => m.step === 'branch' && m.choice === choice);
