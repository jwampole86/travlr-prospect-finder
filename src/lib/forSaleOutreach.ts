/**
 * What an owner of a home that is FOR SALE is told. One primary offer: NAVEO Homes connects them with a licensed local broker, who guides the sale
 * (NAVEO does not list or sell homes itself; in each state the sale is handled by a state-licensed broker partner). The bridge is the second
 * half: if the home will sit empty while it is listed, NAVEO Stays may be able to run it as a short-term rental in the meantime. It never
 * says NAVEO is the listing brokerage ("we sell your home"), never talks about property management (the rental conversation), and promises
 * no sale price, timeline, buyer or income. Each text ends with one simple ask.
 * Every for-sale text, email and message in the app takes its wording from this file, so the position is stated once.
 */

/** One-sentence version for short messages. */
export const FOR_SALE_PITCH =
  "If a sale is on the table, we connect owners with a licensed local broker to guide the sale, and if the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental in the meantime.";

/** The one ask that closes a for-sale first message. */
export const FOR_SALE_ASK = 'Worth a short conversation?';

/** First text to an owner of a home for sale. `{first_name}`, `{address}` and `{brand}` are filled in per recipient. */
export const HOMES_FIRST_TEXT = `Hi {first_name} — Jennifer with {brand}. Reaching out about {address}.

${FOR_SALE_PITCH}
${FOR_SALE_ASK}

Reply STOP to opt out`;

/** The one-to-one outreach message an agent copies from a lead for a home that is for sale. */
export function forSaleOutreachMessage(opts: { address: string; agentFirstName?: string }): string {
  const who = opts.agentFirstName ? `${opts.agentFirstName} with NAVEO Homes` : 'NAVEO Homes here';
  return `Hi — ${who}. Reaching out about ${opts.address}. ${FOR_SALE_PITCH}\n${FOR_SALE_ASK}\n— ${opts.agentFirstName || 'NAVEO Homes'}`;
}

/** Short opener used in the lead panel and the fallback page, which already say which listing they came across. */
export function forSaleListingMessage(address: string, agentFirstName?: string): string {
  return forSaleOutreachMessage({ address, agentFirstName });
}

export const HOMES_REVENUE_TEXT =
  "Hi {first_name}, I took a quick look at {address}. I'd love to share how a sale with {brand} could work, and how NAVEO Stays may be able to run the home as a short-term rental while it's listed. No commitment. Can I send it over?\n\nReply STOP to opt out.";

export const HOMES_INTRO_TEXT =
  "Hi {first_name} — Jennifer with {brand}. Reaching out about {address}. If a sale is on the table, we connect owners with a licensed local broker to guide the sale. Worth a short call?\n\nReply STOP to opt out.";

/** Replies the cadence and the automatic answers send for a home for sale. */
export const HOMES_CADENCE_SMS: Record<string, string> = {
  initial_outreach: "Hi {{leadName}} — {{brand}} here. Reaching out about {{address}}. If a sale is on the table, we connect owners with a licensed local broker to guide the sale. Worth a short conversation? Reply YES or STOP to opt out.",
  follow_up_1: "Hi {{leadName}}, following up from {{brand}} about {{address}}. If the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental meanwhile. Reply YES to talk or STOP to opt out.",
  check_in: 'Hi {{leadName}}, {{brand}} here. Still thinking about selling {{address}}? Worth a short call to talk it through. Reply YES or STOP to opt out.',
  proposal_introduction: 'Hi {{leadName}}, I have some thoughts on a sale of {{address}} with {{brand}}. Reply YES and I will send them over. STOP to opt out.',
  closing: 'Hi {{leadName}}, last message from {{brand}}. Reach out anytime if you would like support with a sale of {{address}}. STOP to opt out.',
};

export const HOMES_CADENCE_EMAIL: Record<string, string> = {
  initial_outreach: "<p>Hi {{leadName}},</p><p>I'm reaching out about {{address}}. If a sale is on the table, we connect owners with a licensed local broker to guide the sale.</p><p>And if the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental in the meantime. Worth a short conversation?</p>",
  follow_up_1: "<p>Hi {{leadName}},</p><p>Just following up about {{address}}. Happy to walk you through how a sale with NAVEO Homes works, and whether a short-term rental in the meantime makes sense.</p>",
  check_in: "<p>Hi {{leadName}},</p><p>Checking in one more time about {{address}}. If a quick call would help, I'm happy to talk through your options, with no pressure.</p>",
  proposal_introduction: "<p>Hi {{leadName}},</p><p>I have some thoughts on a sale of {{address}} with NAVEO Homes, and on a short-term rental while it's listed. Reply and I'll send them over.</p>",
  closing: "<p>Hi {{leadName}},</p><p>This is my final follow-up. If you ever want support with a sale of {{address}}, I'm here. No pressure, just reach out when the time is right.</p>",
};
