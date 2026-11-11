/**
 * What an owner of a home that is FOR SALE is told. The first approach is helping them sell through NAVEO Homes; the home may be able to
 * earn while it is on the market, and an owner in no immediate rush has NAVEO Stays as another route. Nothing here talks about property
 * management (that is the rental conversation), and nothing promises a sale price, a buyer or any income.
 * Every for-sale text, email and message in the app takes its wording from this file, so the position is stated once.
 */

/** One-sentence version for short messages. */
export const FOR_SALE_PITCH =
  "We help owners sell their home through NAVEO Homes, and it may be able to earn while it's on the market. Not in a rush? NAVEO Stays could be another option.";

/** First text to an owner of a home for sale. `{first_name}`, `{address}` and `{brand}` are filled in per recipient. */
export const HOMES_FIRST_TEXT = `Hi {first_name}! I'm Jennifer with {brand}. I came across {address} and wanted to reach out.

${FOR_SALE_PITCH} Open to a quick chat?

Reply STOP to opt out`;

/** The one-to-one outreach message an agent copies from a lead for a home that is for sale. */
export function forSaleOutreachMessage(opts: { opening: string; agentFirstName?: string }): string {
  return `${opts.opening} I'm with NAVEO Homes. ${FOR_SALE_PITCH} Happy to chat whenever suits you.\n— ${opts.agentFirstName || 'Your NAVEO Homes team'}, NAVEO Homes`;
}

/** Short opener used in the lead panel and the fallback page, which already say which listing they came across. */
export function forSaleListingMessage(address: string): string {
  return `Hi! I came across your listing at ${address} and wanted to reach out — I'm with NAVEO Homes. ${FOR_SALE_PITCH} Happy to chat whenever suits you.`;
}

export const HOMES_REVENUE_TEXT =
  "Hi {first_name}, I took a quick look at {address}. I'd love to share what selling through {brand} looks like, and how it may be able to earn while it's on the market. No commitment. Can I send it over?\n\nReply STOP to opt out.";

export const HOMES_INTRO_TEXT =
  "Hi {first_name}! This is Jennifer with {brand}. I came across {address} and wanted to reach out. We help owners sell their home, and it may be able to earn while it's on the market. Would you be open to a quick call?\n\nReply STOP to opt out.";

/** Replies the cadence and the automatic answers send for a home for sale. */
export const HOMES_CADENCE_SMS: Record<string, string> = {
  initial_outreach: "Hi {{leadName}}, this is {{brand}}. We help owners sell their home, and {{address}} may be able to earn while it's on the market. Open to a quick chat? Reply YES or STOP to opt out.",
  follow_up_1: 'Hi {{leadName}}, following up from {{brand}} about {{address}}. Not in a rush to sell? NAVEO Stays could be another option. Reply YES to talk or STOP to opt out.',
  check_in: 'Hi {{leadName}}, {{brand}} here. Still thinking about selling {{address}}? Happy to talk it through. Reply YES or STOP to opt out.',
  proposal_introduction: 'Hi {{leadName}}, I have some thoughts on selling {{address}} through {{brand}}. Reply YES and I will send them over. STOP to opt out.',
  closing: 'Hi {{leadName}}, last message from {{brand}}. Reach out anytime if you would like help selling {{address}}. STOP to opt out.',
};

export const HOMES_CADENCE_EMAIL: Record<string, string> = {
  initial_outreach: "<p>Hi {{leadName}},</p><p>I came across {{address}} and wanted to reach out. We help owners sell their home through NAVEO Homes, and it may be able to earn while it's on the market.</p><p>If you're not in a rush, NAVEO Stays could be another option. Would you be open to a quick conversation?</p>",
  follow_up_1: "<p>Hi {{leadName}},</p><p>Just following up about {{address}}. Happy to walk you through how selling with NAVEO Homes works, and whether it makes sense for the home to earn in the meantime.</p>",
  check_in: "<p>Hi {{leadName}},</p><p>Checking in one more time about {{address}}. If a quick call would help, I'm happy to talk through your options, with no pressure.</p>",
  proposal_introduction: "<p>Hi {{leadName}},</p><p>I have some thoughts on selling {{address}} through NAVEO Homes, and on how it may be able to earn while it's on the market. Reply and I'll send them over.</p>",
  closing: "<p>Hi {{leadName}},</p><p>This is my final follow-up. If you ever want help selling {{address}}, I'm here. No pressure, just reach out when the time is right.</p>",
};
