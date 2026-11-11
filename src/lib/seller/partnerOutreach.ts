/**
 * The recruiting sequence for broker partners: a first email, a bump on day 3, a last note on day 7, then the terms email once they show
 * interest and the agreement email after the call. Written here once so the Partners tab, the copy buttons and the reminders agree.
 * Nothing is sent from here: a person copies or opens each email, and logs that it went out.
 */
export interface OutreachVars { first_name: string; market: string; your_name: string; your_phone: string; your_email: string }

export interface OutreachStep { id: string; label: string; dayOffset: number | null; subject: string; body: string }

const SIGN = '{{your_name}}\nNAVEO Homes\n{{your_phone}} · {{your_email}}';

export const OUTREACH_STEPS: OutreachStep[] = [
  {
    id: 'first', label: 'First email (day 0)', dayOffset: 0,
    subject: 'Seller-intent referrals in {{market}}: referral partnership',
    body: `Hi {{first_name}},

I work with NAVEO Homes. We source permissioned homeowner leads (often second homes or investment properties) where the owner is exploring a sale.

We're looking for one strong listing partner in {{market}} who:
- Already accepts broker-to-broker or digital referrals
- Will update simple status (Contacted / Listed / Under contract / Closed)
- Is paid the usual way: a referral percentage of your side, only when you close

No upfront lead fees. You only pay if the deal closes.

If that's a fit, I can send a one-page overview and a sample lead profile (no obligation).

Open to a 10-minute call this week?

Best,
${SIGN}`
  },
  {
    id: 'bump', label: 'Bump (day 3)', dayOffset: 3,
    subject: 'Re: Seller-intent referrals in {{market}}',
    body: `Hi {{first_name}},

Quick follow-up on seller-intent referrals in {{market}}.

These are property-specific homeowner leads with contact information (where authorized). You only pay a referral fee if you close.

Happy to share how the handoff and fee work in one short email or a 10-minute call.

Worth a quick look?

{{your_name}}`
  },
  {
    id: 'last', label: 'Last note (day 7)', dayOffset: 7,
    subject: 'Last note: referral partnership in {{market}}',
    body: `Hi {{first_name}},

I'll keep this short. We're signing one listing partner in {{market}} for permissioned seller-intent leads (paid only on close, with simple status updates).

If the timing isn't right or it's not a fit, no problem. Just reply "not interested" and I'll close the loop.

If you're open, reply "yes" and I'll send the one-page terms plus a sample lead.

Thanks either way,
{{your_name}}`
  },
  {
    id: 'terms', label: 'After they show interest', dayOffset: null,
    subject: 'NAVEO Homes referral partnership: next steps',
    body: `Hi {{first_name}},

Thanks for the reply. Here's the short version:

What you receive
- Permissioned seller-intent leads with property address and owner contact (where authorized)
- A lead reference for tracking
- Optional notes (engagement, estimated value, intent)

What you do
- Contact the owner promptly
- Update status (Received, Contacted, Listed, Under contract, then Closed or Dead)
- Pay the agreed referral percentage of your side only after you are paid at closing

Typical terms we start with
- 25-30% of your gross commission on the referred side
- 180-day protection on referred leads
- Non-exclusive (unless we agree otherwise)
- Payment to your brokerage

I'll attach the one-page summary and the Partnership Agreement with Exhibit A (fee and protection) and Exhibit B (reporting). Happy to walk through it on a 10-minute call.

What day and time work for a quick call?

Best,
${SIGN}`
  },
  {
    id: 'agreement', label: 'After the call: agreement and test leads', dayOffset: null,
    subject: 'Partnership agreement and first test leads',
    body: `Hi {{first_name}},

Great speaking with you. Attached is the Partnership Agreement with Exhibit A filled in for {{market}}.

Once it's signed, and your license is confirmed active in the property's state, I'll send the first 3-5 test leads, each with a lead reference. You'll receive them by email with owner contact and property details.

Please reply with:
- The signed agreement (or any redlines)
- The email address for lead delivery
- How you'd like to send status updates (an email reply with the lead reference in the subject is fine to start)

Looking forward to the first referrals.

Best,
${SIGN}`
  }
];

export const CALL_SCRIPT = {
  opening: "Thanks for jumping on. I'll keep this to about 10 minutes. I want to confirm this is a fit and answer any questions on the leads and the fee.",
  points: [
    'How leads are sourced: permissioned and property-level, not portal scrapes.',
    'What a good lead looks like for them: price range, areas, property types.',
    'Fee: we typically start at 25-30% of your side, paid only after you are paid at closing. No monthly or per-lead fee.',
    'Reporting: simple status updates so we know which leads are working and can send better ones.',
    'Protection: 180 days on referred leads so the introduction is protected.'
  ],
  questions: [
    'Do you already accept broker-to-broker or digital referrals?',
    'What areas and price points do you want?',
    'Who should the agreement and payment run through (brokerage name)?',
    'Can status updates come by email or a shared sheet?',
    'Typical time from introduction to first contact with the owner?'
  ],
  close: "If this looks good, I'll send the agreement for signature and we can start with 3-5 test leads so you can see the quality. Sound fair?"
};

export const PARTNER_SUMMARY = `NAVEO Homes: Referral Partner Overview

What we provide
- Permissioned homeowner leads with seller or sale-consideration intent
- Property address, owner name, phone and email (as authorized)
- A lead reference for tracking
- Optional: estimated value, engagement notes, market context

What you provide
- An active real estate license in the property's state
- Prompt outreach to the owner
- Status updates: Received, Contacted, Listed, Under contract, then Closed or Dead
- A referral fee only on closed deals that came from our lead

Economics
- Typical fee: 25-30% of your gross commission on the referred side
- Paid after you receive your commission at closing
- No upfront lead fees or monthly retainers
- 180-day protection period on referred leads

Process
1. We send you a lead with a lead reference
2. You contact the owner
3. You update status
4. If it closes, you pay the agreed percentage to our designated payee, brokerage to brokerage

Next step
Review the Partnership Agreement, confirm your license and markets, and we'll send 3-5 test leads.`;

export function fill(text: string, v: Partial<OutreachVars>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: keyof OutreachVars) => (v[k] ? String(v[k]) : m));
}

/** The words still to be filled in, so an email is never sent with a bracket left in it. */
export function unfilled(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

export function render(step: OutreachStep, v: Partial<OutreachVars>): { subject: string; body: string } {
  return { subject: fill(step.subject, v), body: fill(step.body, v) };
}

const DAY = 86_400_000;

export interface NextTouch { step: 'first' | 'bump' | 'last' | 'done'; label: string; dueOn: string | null; overdue: boolean }

/**
 * Where a prospect stands: `step` is how many of the three cold emails have gone out. The bump is due 3 days after the first email and the
 * last note 7 days after it. Once all three are out, the sequence is done and the next move is theirs.
 */
export function nextTouch(startedAt: string | null | undefined, step: number, now: Date = new Date()): NextTouch {
  if (!startedAt || step <= 0) return { step: 'first', label: 'Send the first email', dueOn: null, overdue: false };
  if (step >= 3) return { step: 'done', label: 'Sequence finished: wait for a reply', dueOn: null, overdue: false };
  const target = step === 1 ? 3 : 7;
  const due = new Date(Date.parse(startedAt) + target * DAY);
  return { step: step === 1 ? 'bump' : 'last', label: step === 1 ? 'Send the day-3 bump' : 'Send the day-7 last note', dueOn: due.toISOString().slice(0, 10), overdue: due.getTime() <= now.getTime() };
}

export const mailtoHref = (to: string | null | undefined, subject: string, body: string) => `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
