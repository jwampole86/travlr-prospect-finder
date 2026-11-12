/**
 * "Earn while you wait" scripts for a for-sale home that is already listed with a broker. The sale stays with the listing broker (no seller referral),
 * so these only offer the rental side (NAVEO Stays), always conditionally ("where your listing agreement and local rules allow"), and exit cleanly on a
 * hard no. They are copy-and-paste drafts for a person to send; nothing here sends anything. Counsel should review them before first use, and the
 * fee wording must match the actual Stays agreement.
 */

export type ScriptGroup = 'owner_emails' | 'owner_replies' | 'broker_scripts' | 'broker_objections';

export interface Script {
  id: string;
  group: ScriptGroup;
  title: string;
  /** When to use it. */
  when?: string;
  subject?: string;
  body: string;
  /** A hard no: log it and stop contacting about the rental. */
  stop?: boolean;
}

export const GROUP_LABEL: Record<ScriptGroup, string> = {
  owner_emails: 'Owner emails',
  owner_replies: 'Owner replies',
  broker_scripts: 'Broker scripts',
  broker_objections: 'Broker objections',
};

export const GROUP_NOTE: Record<ScriptGroup, string> = {
  owner_emails: 'First contact goes to the owner. Use the primary version by default and the short one for text or tight limits.',
  owner_replies: 'Short answers to common owner pushback. Treat a clear no as final.',
  broker_scripts: 'Only contact the listing broker once the owner is interested, or when the owner asks you to. Keep it short and never touch the sale.',
  broker_objections: 'De-escalate and stop cleanly. Never argue with a listing broker.',
};

/** Reasons to log against the lead when the answer is a no, so the same offer is not sent again. */
export const OBJECTION_REASONS = ['broker_blocked', 'not_interested', 'timing', 'wants_info'] as const;

export const SCRIPTS: Script[] = [
  {
    id: 'owner-primary',
    group: 'owner_emails',
    title: 'Primary version (default)',
    subject: 'Earn income while {{property_address}} is listed',
    body: `Hi {{owner_first_name}},

I noticed {{property_address}} is already on the market.

While your listing moves forward, NAVEO Stays can help the home earn income through short- or mid-term stays, where local rules and your listing agreement allow it.

You keep your current broker. We only handle the rental side and work around showings so the sale isn't disrupted.

If you'd like a quick estimate of what it could generate, just reply and I'll send it over.

Best,
{{sender_name}}
NAVEO Stays
{{phone}}`,
  },
  {
    id: 'owner-short',
    group: 'owner_emails',
    title: 'Shorter version',
    subject: 'Income option while your home is listed',
    body: `Hi {{owner_first_name}},

{{property_address}} is listed, and it may be able to earn in the meantime.

NAVEO Stays handles the rental side (where permitted) and coordinates around your broker's showings. Your listing stays exactly as it is.

Want a quick look at potential income?

{{sender_name}}
NAVEO Stays`,
  },
  {
    id: 'owner-warm',
    group: 'owner_emails',
    title: 'Warmer version',
    subject: 'A way to earn while you sell',
    body: `Hi {{owner_first_name}},

Selling can take time. While {{property_address}} is listed, some owners use the gap to generate income.

NAVEO Stays can set that up where allowed. We manage the stays and work around your listing schedule. Your broker remains in place for the sale.

Happy to send a simple overview if you're curious.

{{sender_name}}
NAVEO Stays`,
  },
  {
    id: 'owner-followup',
    group: 'owner_emails',
    title: 'Follow-up (day 4, no reply)',
    when: 'One soft follow-up at most. None after a no.',
    subject: 'Re: Earn income while {{property_address}} is listed',
    body: `Hi {{owner_first_name}},

Just following up on the rental option while your home is listed.

No change to your current broker or listing. This is only an additional way to earn in the meantime, if it fits.

Let me know if you'd like the short overview.

{{sender_name}}
NAVEO Stays`,
  },

  {
    id: 'reply-not-interested',
    group: 'owner_replies',
    title: '"I\'m not interested."',
    body: `No problem at all. I'll leave it there. If anything changes while the home is listed, feel free to reach out.`,
    stop: true,
  },
  {
    id: 'reply-broker-no',
    group: 'owner_replies',
    title: '"My broker doesn\'t allow rentals."',
    body: `Understood. Some listing agreements restrict it. We'll respect that and won't pursue it. Wishing you a smooth sale.`,
    stop: true,
  },
  {
    id: 'reply-strangers',
    group: 'owner_replies',
    title: '"I don\'t want strangers in the house while it\'s listed."',
    body: `Completely fair. A lot of owners feel the same way. We'll step back, with no further follow-up on the rental side.`,
    stop: true,
  },
  {
    id: 'reply-offers',
    group: 'owner_replies',
    title: '"It\'s already getting showings / offers."',
    body: `That's great to hear. Sounds like the sale is moving, so there's no need for the rental option. Best of luck with the listing.`,
    stop: true,
  },
  {
    id: 'reply-how-much',
    group: 'owner_replies',
    title: '"How much would I actually make?"',
    body: `It depends on the market, season, and how many days it's available between showings. If you want, I can send a simple range based on similar homes, with no obligation.`,
  },
  {
    id: 'reply-fee',
    group: 'owner_replies',
    title: '"What\'s the catch / what do you charge?"',
    when: 'Confirm this matches the Stays agreement before sending.',
    body: `No catch. We only earn a management fee on stays that are booked and completed. If it doesn't book, you don't pay us. Your listing broker stays in place for the sale.`,
  },
  {
    id: 'reply-ask-someone',
    group: 'owner_replies',
    title: '"I need to ask my broker / spouse first."',
    body: `Of course. Take your time. I'm happy to send a one-page overview you can share with them, or I can wait until you've had the conversation.`,
  },
  {
    id: 'reply-tried',
    group: 'owner_replies',
    title: '"We already tried renting it / it didn\'t work."',
    body: `Appreciate you sharing that. Every situation is different. If the earlier attempt wasn't a fit, no need to revisit it. I'll close this out on my side.`,
    stop: true,
  },
  {
    id: 'reply-send-info',
    group: 'owner_replies',
    title: '"Just send me information."',
    body: `Happy to. I'll email a short overview that covers how it works, how we coordinate around showings, and what the fee looks like. You can review it whenever it's convenient.`,
  },
  {
    id: 'reply-stop',
    group: 'owner_replies',
    title: '"Remove me / stop contacting me."',
    when: 'Also mark the lead Do Not Contact.',
    body: `Done. I've removed you from any further messages about this. Sorry for the interruption, and best of luck with the sale.`,
    stop: true,
  },

  {
    id: 'broker-heads-up',
    group: 'broker_scripts',
    title: 'Courtesy heads-up (email)',
    when: 'The owner is interested and you want to avoid surprises.',
    subject: 'Rental option during listing: {{property_address}}',
    body: `Hi {{broker_first_name}},

I'm with NAVEO Stays. {{owner_name}} asked about earning income on {{property_address}} while it's listed.

We only proceed if you and the owner are comfortable with it. We would coordinate blackout dates around your showings and would not be involved in the sale.

Happy to jump on a quick call or send a one-page overview if useful.

{{sender_name}}
NAVEO Stays
{{phone}}`,
  },
  {
    id: 'broker-heads-up-call',
    group: 'broker_scripts',
    title: 'Courtesy heads-up (call)',
    body: `Hi {{broker_first_name}}, this is {{sender_name}} with NAVEO Stays. {{owner_name}} is interested in a possible rental option while the home is listed. I wanted to give you a heads-up and make sure it wouldn't interfere with your showings. We only move forward if you're both comfortable.`,
  },
  {
    id: 'broker-no',
    group: 'broker_scripts',
    title: 'Broker says no',
    subject: 'Understood: {{property_address}}',
    body: `Hi {{broker_first_name}},

Thank you for the quick reply. We'll respect that and will not pursue a rental arrangement on {{property_address}}.

Wishing you a smooth sale.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
  {
    id: 'broker-how',
    group: 'broker_scripts',
    title: 'Broker asks how it works',
    subject: 'How the rental option works: {{property_address}}',
    body: `Hi {{broker_first_name}},

Simple version:

- Owner keeps you as the listing broker
- We only handle permitted stays
- You and the owner set blackout dates for showings
- We manage guests, cleaning, and coordination
- No involvement in offers, negotiations, or the sale

Happy to walk through it briefly if you'd like.

{{sender_name}}
NAVEO Stays`,
  },
  {
    id: 'broker-writing',
    group: 'broker_scripts',
    title: 'Broker wants it in writing',
    when: 'Attach the coordination outline your counsel approved.',
    subject: 'Coordination outline: {{property_address}}',
    body: `Hi {{broker_first_name}},

Attached is a short outline confirming:

- You remain the listing broker
- Any stays will be scheduled around your showing calendar
- We will not market or negotiate the sale
- Owner has requested the rental option

Let me know if you'd like any additions before we proceed.

{{sender_name}}`,
  },
  {
    id: 'broker-intro',
    group: 'broker_scripts',
    title: 'Owner says "ask my broker" (intro email)',
    subject: 'Introduction: rental option during listing',
    body: `Hi {{broker_first_name}},

{{owner_name}} asked me to connect with you about a possible rental option on {{property_address}} while it's listed.

I wanted to introduce myself and confirm we're happy to work around your schedule. No action needed unless you'd like a quick overview.

{{sender_name}}
NAVEO Stays
{{phone}}`,
  },
  {
    id: 'broker-approved',
    group: 'broker_scripts',
    title: 'After the broker approves',
    subject: 'Thank you: moving forward on {{property_address}}',
    body: `Hi {{broker_first_name}},

Thank you for the green light. We'll coordinate directly with {{owner_name}} and keep showings as the priority.

I'll share the blackout process so your calendar stays clear. Please reach out anytime if something needs to change.

{{sender_name}}
NAVEO Stays`,
  },

  {
    id: 'obj-hurt-sale',
    group: 'broker_objections',
    title: '"This will hurt my sale / scare buyers"',
    subject: 'Re: {{property_address}}: understood',
    body: `Hi {{broker_first_name}},

I appreciate you flagging that. Buyer perception matters, and we don't want to create any friction for the sale.

We'll step back and will not pursue a rental arrangement on {{property_address}}. Your listing remains the priority.

Thank you for the direct feedback.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
  {
    id: 'obj-outside',
    group: 'broker_objections',
    title: '"I don\'t work with outside rental companies"',
    subject: 'Re: {{property_address}}',
    body: `Hi {{broker_first_name}},

Completely understood. We won't move forward.

If the owner later asks, I'll let them know the rental option isn't a fit while the home is listed with you.

Thanks for clarifying.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
  {
    id: 'obj-around-me',
    group: 'broker_objections',
    title: '"You\'re trying to go around me"',
    subject: 'Clarification: {{property_address}}',
    body: `Hi {{broker_first_name}},

That's not the intent. You remain the listing broker, and we would only handle permitted stays if both you and the owner were comfortable.

Since that isn't the case here, we'll close it out on our side and will not contact the owner further about a rental.

Appreciate you being direct.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
  {
    id: 'obj-agreement',
    group: 'broker_objections',
    title: '"The listing agreement prohibits it"',
    subject: 'Re: {{property_address}}: listing terms',
    body: `Hi {{broker_first_name}},

Thank you for pointing that out. We'll respect the listing agreement and will not pursue any rental activity.

No further action needed from you.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
  {
    id: 'obj-no-contact',
    group: 'broker_objections',
    title: '"Don\'t contact my client again"',
    when: 'Also mark the lead Do Not Contact.',
    subject: 'Confirmed: no further contact',
    body: `Hi {{broker_first_name}},

Understood. I will not contact {{owner_name}} again about a rental option on {{property_address}}.

I've noted it on our side. Sorry for any disruption.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
  {
    id: 'obj-money-grab',
    group: 'broker_objections',
    title: '"What\'s in it for you? / This feels like a money grab"',
    when: 'Confirm this matches the Stays agreement before sending.',
    subject: 'Re: {{property_address}}',
    body: `Hi {{broker_first_name}},

Fair question. We only earn a management fee if a stay is actually completed. If it doesn't book, there's no fee.

That said, if the arrangement doesn't feel right for this listing, we're happy to leave it. Just say the word and we'll stop.

{{sender_name}}
NAVEO Stays`,
  },
  {
    id: 'obj-think',
    group: 'broker_objections',
    title: '"I need to think about it / I\'m not sure"',
    subject: 'No rush: {{property_address}}',
    body: `Hi {{broker_first_name}},

No pressure at all. Take whatever time you need.

If it's easier, I can send a one-page outline of how we coordinate around showings, or we can simply leave it. Either way works.

{{sender_name}}
NAVEO Stays`,
  },
  {
    id: 'obj-hostile',
    group: 'broker_objections',
    title: 'Aggressive or hostile reply',
    subject: 'Noted: stepping back',
    body: `Hi {{broker_first_name}},

I've received your message and will not pursue this further. No additional contact from me on {{property_address}}.

{{sender_name}}
NAVEO Stays`,
    stop: true,
  },
];

export const scriptsFor = (group: ScriptGroup): Script[] => SCRIPTS.filter((s) => s.group === group);

const firstWord = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || '';

export interface ScriptVars {
  ownerName?: string | null;
  propertyAddress?: string | null;
  brokerName?: string | null;
  senderName?: string | null;
  phone?: string | null;
}

/** Fills what is known. Anything unknown stays as `{{name}}` so it is obvious before sending. */
export function fillScript(text: string, v: ScriptVars): string {
  const values: Record<string, string> = {
    owner_first_name: firstWord(v.ownerName),
    owner_name: (v.ownerName || '').trim(),
    property_address: (v.propertyAddress || '').trim(),
    broker_first_name: firstWord(v.brokerName),
    sender_name: (v.senderName || '').trim(),
    phone: (v.phone || '').trim(),
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] || m);
}
