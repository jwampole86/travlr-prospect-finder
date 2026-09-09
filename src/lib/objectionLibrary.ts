/**
 * TRAVLR Pre-Built Objection Library
 * Curated responses to the most common homeowner objections.
 * Pattern matching is done before falling back to live LLM generation.
 */

export interface ObjectionEntry {
  id: string;
  category: string;
  label: string;
  patterns: RegExp[];
  response: string;
  note?: string;
}

export const OBJECTION_LIBRARY: ObjectionEntry[] = [
  {
    id: 'mgmt-fee-high',
    category: 'Management Fee',
    label: 'Management fee too high',
    patterns: [
      /fee.*(too high|expensive|a lot|much)/i,
      /percent.*(high|lot|much)/i,
      /management.*(cost|charge|fee)/i,
      /that'?s? a lot/i,
      /keep more/i,
    ],
    response: `Suggested next line: "That's a fair question — our fee covers full-service management: guest services, cleaning coordination, maintenance, pricing optimization, and 24/7 support. Most owners find the net revenue after our fee is higher than what they'd net managing it themselves, once you factor in the time and platform costs. Happy to walk through the numbers side by side."`,
    note: 'Acknowledge the concern, then pivot to net revenue comparison.',
  },
  {
    id: 'self-manage-airbnb',
    category: 'Self-Management',
    label: 'Already self-managing on Airbnb',
    patterns: [
      /already.*(airbnb|vrbo|manage|listing)/i,
      /self.?manag/i,
      /do it (myself|yourself|on my own)/i,
      /manage it (myself|on my own)/i,
      /listed on airbnb/i,
    ],
    response: `Suggested next line: "That's great — it means you already know the upside. A lot of our owners came from self-managing and found that handing off the day-to-day — guest communication, pricing adjustments, maintenance calls — freed up their time without giving up revenue. We'd love to show you a comparison of what we'd project for your property versus what you're currently netting."`,
    note: 'Validate their experience, then position TRAVLR as an upgrade, not a replacement.',
  },
  {
    id: 'hoa-restrictions',
    category: 'HOA / Restrictions',
    label: 'HOA restrictions or concerns',
    patterns: [
      /hoa/i,
      /homeowner.?s? association/i,
      /restrict/i,
      /not allowed/i,
      /rules.*(rental|short.?term)/i,
      /short.?term.*(not allowed|prohibited|ban)/i,
    ],
    response: `Suggested next line: "That's something we run into fairly often — our team reviews HOA rules as part of the qualification process, so we'd want to confirm what's permitted before moving forward. If there are restrictions, we can talk through what options might still work within those rules. Can you tell me a bit more about what the HOA allows?"`,
    note: 'Don\'t dismiss — gather more info and position TRAVLR as experienced with HOA situations.',
  },
  {
    id: 'trust-skepticism',
    category: 'Trust / Skepticism',
    label: 'General skepticism or trust concerns',
    patterns: [
      /how do i know/i,
      /trust you/i,
      /heard bad things/i,
      /scam/i,
      /too good to be true/i,
      /prove it/i,
      /references/i,
      /reviews/i,
    ],
    response: `Suggested next line: "That's a completely reasonable thing to want to verify — we'd expect that. We've been operating in this market for over ten years, and I'm happy to share references from current owners in your area, walk you through our contract terms, or connect you with someone on our team who can answer any specific questions. What would be most helpful?"`,
    note: 'Validate skepticism as reasonable, then offer concrete proof points.',
  },
  {
    id: 'not-interested-now',
    category: 'Timing',
    label: 'Not interested right now / bad timing',
    patterns: [
      /not (interested|ready) (right now|at this time|yet)/i,
      /bad timing/i,
      /not the right time/i,
      /maybe later/i,
      /call me back/i,
      /not now/i,
    ],
    response: `Suggested next line: "Totally understand — timing matters a lot with this. Would it be alright if I sent over some info by email so you have it when the timing is better? And is there a particular reason the timing isn't right — sometimes there's something specific we can address now that makes it easier down the road."`,
    note: 'Soft close + probe for the real objection underneath the timing deflection.',
  },
  {
    id: 'already-have-pm',
    category: 'Existing Manager',
    label: 'Already has a property manager',
    patterns: [
      /already have (a|an) (manager|management|company)/i,
      /working with (someone|a company|another)/i,
      /current (manager|management)/i,
      /under contract/i,
    ],
    response: `Suggested next line: "Got it — we actually work with a lot of owners who've switched from other management companies, and the most common reason is wanting more local expertise and better communication. I'm not asking you to make any changes today, but would you be open to a quick comparison so you have a benchmark? No obligation."`,
    note: 'Don\'t push to switch immediately — position as a benchmark comparison.',
  },
  {
    id: 'want-to-sell',
    category: 'Selling',
    label: 'Thinking about selling the property',
    patterns: [
      /thinking (about|of) sell/i,
      /might sell/i,
      /put it on the market/i,
      /list it for sale/i,
      /sell (it|the property|the house)/i,
    ],
    response: `Suggested next line: "That makes sense — a lot of owners in that position actually find that having a strong rental history and income documentation makes the property more attractive to buyers and can support a higher asking price. It might be worth exploring both paths in parallel. Would you be open to hearing more about how that's worked for other owners?"`,
    note: 'Reframe rental management as complementary to a future sale, not in conflict.',
  },
  {
    id: 'worried-about-damage',
    category: 'Property Concerns',
    label: 'Worried about property damage from guests',
    patterns: [
      /damage/i,
      /guests.*(break|ruin|trash|destroy)/i,
      /worried about (guests|renters|people)/i,
      /what if (they|guests|someone)/i,
      /insurance/i,
    ],
    response: `Suggested next line: "That's one of the most common concerns we hear, and it's a fair one. We screen guests, carry damage protection on every booking, and do property checks between stays. In ten-plus years, serious damage incidents are rare — and when they happen, we handle the claim process so you don't have to. Happy to walk through exactly how that coverage works."`,
    note: 'Acknowledge the concern as valid, then explain the protection layers.',
  },
  {
    id: 'occupancy-concerns',
    category: 'Revenue Concerns',
    label: 'Worried about occupancy / revenue',
    patterns: [
      /occupancy/i,
      /enough bookings/i,
      /sit empty/i,
      /slow season/i,
      /what if (it|the property) (doesn'?t|won'?t) (book|rent)/i,
      /guarantee.*(income|revenue|rent)/i,
    ],
    response: `Suggested next line: "Occupancy is really market and property dependent, so I'd rather give you a realistic projection for your specific property than a number that sounds good but isn't accurate. What I can do is pull together a revenue estimate based on comparable properties in your area — that gives you a real baseline to evaluate. Want me to put that together and follow up?"`,
    note: 'Never guarantee revenue — bridge to a data-backed follow-up instead.',
  },
  {
    id: 'personal-use',
    category: 'Personal Use',
    label: 'Wants to keep using the property personally',
    patterns: [
      /personal use/i,
      /use it (myself|ourselves|ourselves)/i,
      /block (off|out) dates/i,
      /vacation there/i,
      /still use it/i,
      /family (use|visits|trips)/i,
    ],
    response: `Suggested next line: "Absolutely — that's built into how we structure the partnership. You keep full access to block personal-use dates, and we work around your schedule. The agreement includes a personal-use notice period so we can manage bookings around your plans. Most of our owners use their property regularly and still see strong rental income."`,
    note: 'Reassure immediately — personal use is a feature, not a conflict.',
  },
  {
    id: 'contract-length',
    category: 'Contract Terms',
    label: 'Concerned about contract length or lock-in',
    patterns: [
      /contract.*(long|length|term|lock)/i,
      /locked in/i,
      /can i (leave|cancel|get out)/i,
      /how long.*(contract|agreement|term)/i,
      /termination/i,
    ],
    response: `Suggested next line: "The agreement terms are something we can walk through in detail — the standard term includes a notice period for either party, and there are clear provisions for termination. I'd rather you see the actual contract language than have me summarize it, so let me send that over and we can go through it together. Does that work?"`,
    note: 'Don\'t summarize contract terms verbally — bridge to sending the actual document.',
  },
  {
    id: 'need-to-think',
    category: 'Stalling',
    label: 'Needs to think about it / talk to spouse',
    patterns: [
      /need to (think|talk|discuss)/i,
      /talk to (my|the) (wife|husband|spouse|partner)/i,
      /let me think/i,
      /get back to you/i,
      /not sure yet/i,
    ],
    response: `Suggested next line: "Of course — this is a meaningful decision and it makes sense to think it through. Would it help if I sent over a summary of what we discussed so you have something concrete to review together? And is there a specific question or concern I can answer now that would make that conversation easier?"`,
    note: 'Facilitate the conversation rather than pushing — offer a leave-behind and probe for the real concern.',
  },
  {
    id: 'bad-experience',
    category: 'Past Experience',
    label: 'Had a bad experience with a previous manager',
    patterns: [
      /bad experience/i,
      /previous (manager|management|company)/i,
      /last (manager|company|time)/i,
      /didn'?t work out/i,
      /problems with/i,
    ],
    response: `Suggested next line: "I'm sorry to hear that — unfortunately it does happen, and it's one of the reasons we put a lot of emphasis on communication and transparency. I'd genuinely like to understand what went wrong, because it helps me explain specifically how we do things differently. What was the main issue?"`,
    note: 'Listen first — understanding the specific failure builds trust and lets you address it directly.',
  },
  {
    id: 'location-concerns',
    category: 'Market Concerns',
    label: 'Concerns about the local market or regulations',
    patterns: [
      /regulations/i,
      /city.*(rules|laws|ordinance)/i,
      /permit/i,
      /license/i,
      /ban.*(short.?term|rental)/i,
      /local.*(rules|laws|market)/i,
    ],
    response: `Suggested next line: "Regulatory environment is something we track closely — it varies a lot by city and even by neighborhood. We review the current rules for every property before we take it on, so we'd confirm what's permitted for your specific address before moving forward. Can I ask which city the property is in?"`,
    note: 'Position TRAVLR as the expert on local regulations — gather the city to give a specific answer.',
  },
  {
    id: 'not-interested-general',
    category: 'General Disinterest',
    label: 'Generally not interested',
    patterns: [
      /not interested/i,
      /no thank you/i,
      /don'?t want to/i,
      /please (remove|take me off|stop)/i,
      /don'?t call/i,
    ],
    response: `Suggested next line: "Totally understand — I appreciate you taking the time to hear me out. I'll make a note not to follow up. If anything changes down the road, feel free to reach out directly. Have a great day, {contactName}."`,
    note: 'Respect the no — a graceful exit leaves the door open better than a hard push.',
  },
];

/**
 * Match a transcript segment against the objection library.
 * Returns the best matching objection entry, or null if no match found.
 */
export function matchObjection(text: string): ObjectionEntry | null {
  if (!text || text.trim().length < 5) return null;
  
  for (const entry of OBJECTION_LIBRARY) {
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Match against recent transcript entries (last N homeowner utterances).
 */
export function matchObjectionFromTranscript(
  transcript: Array<{ speaker: string; text: string }>,
  lookback = 3
): ObjectionEntry | null {
  const recentHomeowner = transcript
    .filter(e => e.speaker === 'Homeowner')
    .slice(-lookback);
  
  for (const entry of recentHomeowner.reverse()) {
    const match = matchObjection(entry.text);
    if (match) return match;
  }
  return null;
}

/**
 * Script beat definitions for the call outline progress tracker.
 * Each beat has patterns to detect if it's been covered in the transcript.
 */
export interface ScriptBeat {
  id: string;
  label: string;
  shortLabel: string;
  patterns: RegExp[];
  scriptIds: string[]; // which scripts this beat applies to
}

export const SCRIPT_BEATS: ScriptBeat[] = [
  {
    id: 'intro',
    label: 'Introduction',
    shortLabel: 'Intro',
    patterns: [
      /this is .* (from|with) travlr/i,
      /calling from travlr/i,
      /travlr vacation/i,
      /my name is/i,
    ],
    scriptIds: ['initial_outreach', 'follow_up', 'questionnaire_handoff', 'proposal', 'closing_contract'],
  },
  {
    id: 'local_blurb',
    label: 'Local Market Mention',
    shortLabel: 'Local Blurb',
    patterns: [
      /market/i,
      /area/i,
      /local/i,
      /years? (of experience|in)/i,
      /boutique/i,
    ],
    scriptIds: ['initial_outreach', 'follow_up'],
  },
  {
    id: 'services_mentioned',
    label: 'Services Overview',
    shortLabel: 'Services',
    patterns: [
      /full.?service/i,
      /guest services/i,
      /cleaning/i,
      /maintenance/i,
      /pricing/i,
      /end.?to.?end/i,
    ],
    scriptIds: ['initial_outreach', 'proposal'],
  },
  {
    id: 'questionnaire_offered',
    label: 'Questionnaire Offered',
    shortLabel: 'Questionnaire',
    patterns: [
      /questionnaire/i,
      /five minutes/i,
      /short (form|survey|questionnaire)/i,
      /send (you|that) (the|a) link/i,
    ],
    scriptIds: ['initial_outreach', 'follow_up', 'questionnaire_handoff'],
  },
  {
    id: 'objection_handled',
    label: 'Objection Handled',
    shortLabel: 'Objection',
    patterns: [
      /understand/i,
      /fair (question|point|concern)/i,
      /good question/i,
      /that'?s? (a )?(fair|reasonable|valid)/i,
    ],
    scriptIds: ['initial_outreach', 'follow_up', 'proposal', 'closing_contract'],
  },
  {
    id: 'proposal_terms',
    label: 'Proposal Terms Discussed',
    shortLabel: 'Terms',
    patterns: [
      /management fee/i,
      /percent/i,
      /term length/i,
      /start date/i,
      /monthly/i,
      /payout/i,
    ],
    scriptIds: ['proposal'],
  },
  {
    id: 'next_steps',
    label: 'Next Steps Confirmed',
    shortLabel: 'Next Steps',
    patterns: [
      /next step/i,
      /follow up/i,
      /send (that|the|an) (email|proposal|agreement|link)/i,
      /docusign/i,
      /schedule/i,
      /get back to you/i,
    ],
    scriptIds: ['initial_outreach', 'follow_up', 'questionnaire_handoff', 'proposal', 'closing_contract'],
  },
  {
    id: 'close',
    label: 'Call Closed',
    shortLabel: 'Close',
    patterns: [
      /thanks? (for|so much)/i,
      /appreciate (your|the) time/i,
      /have a (great|good)/i,
      /talk soon/i,
      /take care/i,
    ],
    scriptIds: ['initial_outreach', 'follow_up', 'questionnaire_handoff', 'proposal', 'closing_contract'],
  },
];
