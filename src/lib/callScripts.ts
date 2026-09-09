/**
 * TRAVLR Base Call Scripts — all 5 stages
 * Variables use {contactName}, {address}, {senderName}, {localBlurb} tokens.
 * These are resolved by variableResolutionService.applyVariables() before display.
 * Deal-specific fields (proposed rent, term, start date) use [enter X] bracket placeholders
 * that the agent fills in manually — never auto-filled.
 */

export type ScriptId =
  | 'initial_outreach' |'follow_up' |'questionnaire_handoff' |'proposal' |'closing_contract'
  | 'landing_page_inbound';

export interface CallScript {
  id: ScriptId;
  label: string;
  goal: string;
  sections: ScriptSection[];
}

export interface ScriptSection {
  id: string;
  title: string;
  lines: ScriptLine[];
}

export interface ScriptLine {
  id: string;
  type: 'spoken' | 'instruction' | 'agent_fill' | 'branch_label';
  text: string;
  /** If true, this line contains an agent-fill placeholder that must be entered before the call */
  hasAgentFill?: boolean;
}

// ─── Script 1: Initial Outreach ───────────────────────────────────────────────

const initialOutreach: CallScript = {
  id: 'initial_outreach',
  label: 'Initial Outreach',
  goal: 'Introduce TRAVLR, build trust, gather basic info, move toward questionnaire or scheduled follow-up.',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      lines: [
        {
          id: 'io-open-1',
          type: 'spoken',
          text: 'Hi, is this {contactName}? Hi {contactName}, this is {senderName} calling from TRAVLR Vacation Homes — I\'m reaching out about your property at {address}. Do you have a quick minute?',
        },
      ],
    },
    {
      id: 'if_yes',
      title: 'If Yes',
      lines: [
        {
          id: 'io-yes-1',
          type: 'spoken',
          text: 'Great — so TRAVLR is a boutique vacation rental and property management company, and {localBlurb}. I wanted to see if you\'d be open to hearing a bit about how it works and whether it might be a fit for your property.',
        },
      ],
    },
    {
      id: 'key_points',
      title: 'Key Points',
      lines: [
        { id: 'io-kp-1', type: 'instruction', text: 'Hit these if the conversation continues:' },
        { id: 'io-kp-2', type: 'spoken', text: 'We handle everything end-to-end: guest services, cleaning, maintenance, and pricing.' },
        { id: 'io-kp-3', type: 'spoken', text: 'Over 10 years of experience, {localBlurb}.' },
        { id: 'io-kp-4', type: 'spoken', text: 'No cost or commitment just to learn more — next step is either a short property questionnaire or a follow-up call with more detail.' },
      ],
    },
    {
      id: 'close_interested',
      title: 'Close — If Interested',
      lines: [
        {
          id: 'io-ci-1',
          type: 'spoken',
          text: 'The easiest next step is a quick property questionnaire — takes about five minutes and helps us see if {address} qualifies. Can I text or email you that link?',
        },
      ],
    },
    {
      id: 'close_hesitant',
      title: 'Close — If Hesitant',
      lines: [
        {
          id: 'io-ch-1',
          type: 'spoken',
          text: 'No worries at all — would it be alright if I followed up with some info by email so you can look it over when it\'s convenient?',
        },
      ],
    },
    {
      id: 'close_not_interested',
      title: 'Close — If Not Interested',
      lines: [
        {
          id: 'io-cn-1',
          type: 'spoken',
          text: 'Totally understand — thanks for your time, {contactName}. If anything changes down the road, feel free to reach out. Have a great day.',
        },
      ],
    },
  ],
};

// ─── Script 2: Follow-Up ─────────────────────────────────────────────────────

const followUp: CallScript = {
  id: 'follow_up',
  label: 'Follow-Up',
  goal: 'Re-engage a homeowner who hasn\'t responded to prior outreach, without sounding pushy.',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      lines: [
        {
          id: 'fu-open-1',
          type: 'spoken',
          text: 'Hi {contactName}, this is {senderName} again from TRAVLR Vacation Homes — I\'d reached out about {address} a little while back. Do you have a couple minutes?',
        },
      ],
    },
    {
      id: 'if_yes',
      title: 'If Yes',
      lines: [
        {
          id: 'fu-yes-1',
          type: 'spoken',
          text: 'I just wanted to check back in — I know things get busy. We\'re still very interested in {address}, and {localBlurb}. Is this still something you\'d want to explore, or is the timing just not right at the moment?',
        },
      ],
    },
    {
      id: 'still_interested',
      title: 'If Still Interested',
      lines: [
        {
          id: 'fu-si-1',
          type: 'spoken',
          text: 'Great — the quickest way forward is a short property questionnaire, about five minutes, so we can confirm {address} qualifies. Want me to send that over now?',
        },
      ],
    },
    {
      id: 'timing_not_right',
      title: 'If Timing Isn\'t Right',
      lines: [
        {
          id: 'fu-tnr-1',
          type: 'spoken',
          text: 'Totally understandable — would it be alright if I checked back in with you in a month or so, or would you rather I just send some info by email for whenever you\'re ready?',
        },
      ],
    },
    {
      id: 'not_interested',
      title: 'If Not Interested',
      lines: [
        {
          id: 'fu-ni-1',
          type: 'spoken',
          text: 'No problem at all, {contactName} — appreciate you letting me know. I\'ll go ahead and close this out on our end. Take care.',
        },
      ],
    },
  ],
};

// ─── Script 3: Property Questionnaire Handoff ─────────────────────────────────

const questionnaireHandoff: CallScript = {
  id: 'questionnaire_handoff',
  label: 'Questionnaire Handoff',
  goal: 'Walk a warm/interested homeowner through starting the qualification questionnaire live, or send the link.',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      lines: [
        {
          id: 'qh-open-1',
          type: 'spoken',
          text: 'Perfect — so the questionnaire covers a few basics: property details, some quick safety questions like smoke detectors and locks, and anything like HOA rules that might apply. Takes about five minutes.',
        },
      ],
    },
    {
      id: 'by_phone',
      title: 'If They Want to Do It Now By Phone',
      lines: [
        {
          id: 'qh-bp-1',
          type: 'spoken',
          text: 'No problem, I can just ask you a few of these directly. First — is {address} currently vacant, owner-occupied, or under a lease?',
        },
        {
          id: 'qh-bp-2',
          type: 'instruction',
          text: 'Continue walking through Sections A/B of the questionnaire verbally, logging answers.',
        },
      ],
    },
    {
      id: 'self_serve',
      title: 'If They\'d Rather Do It Themselves',
      lines: [
        {
          id: 'qh-ss-1',
          type: 'spoken',
          text: 'That works great too — I\'ll text and email you the link right now. It saves your progress if you need to step away and come back to it.',
        },
      ],
    },
    {
      id: 'close',
      title: 'Close',
      lines: [
        {
          id: 'qh-close-1',
          type: 'spoken',
          text: 'Once that\'s submitted, our team reviews it and I\'ll follow up within a day or two with next steps. Thanks so much, {contactName} — talk soon.',
        },
      ],
    },
  ],
};

// ─── Script 4: Proposal ──────────────────────────────────────────────────────

const proposal: CallScript = {
  id: 'proposal',
  label: 'Proposal',
  goal: 'Walk a qualified homeowner through proposed partnership terms, building toward the Proposal Introduction email/agreement.',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      lines: [
        {
          id: 'pr-open-1',
          type: 'spoken',
          text: 'Hi {contactName}, thanks for hopping on — I\'ve got the details for {address} pulled up, and I wanted to walk you through what a partnership with TRAVLR would look like.',
        },
      ],
    },
    {
      id: 'key_points',
      title: 'Key Points',
      lines: [
        {
          id: 'pr-kp-1',
          type: 'spoken',
          text: 'Full-service management: guest services, concierge, cleaning, maintenance, and revenue optimization.',
        },
        { id: 'pr-kp-2', type: 'spoken', text: '{localBlurb}.' },
        {
          id: 'pr-kp-3',
          type: 'agent_fill',
          hasAgentFill: true,
          text: '[enter proposed monthly payment structure] — [enter term length] — starting [enter start date]',
        },
      ],
    },
    {
      id: 'numbers_question',
      title: 'If They Ask About Specific Numbers You Don\'t Have',
      lines: [
        {
          id: 'pr-nq-1',
          type: 'spoken',
          text: 'That\'s a great question — let me pull the exact figures together and follow up by email today so you have it in writing rather than me guessing on the phone.',
        },
      ],
    },
    {
      id: 'close_ready',
      title: 'Close — Ready to Move Forward',
      lines: [
        {
          id: 'pr-cr-1',
          type: 'spoken',
          text: 'I\'ll go ahead and send the full proposal over by email so you can review everything in writing, and we can set up a time to finalize once you\'ve had a chance to look it over.',
        },
      ],
    },
    {
      id: 'close_needs_time',
      title: 'Close — Needs Time',
      lines: [
        {
          id: 'pr-cnt-1',
          type: 'spoken',
          text: 'Totally understand — take your time. I\'ll send the written proposal so you have all the details, and just reach out whenever you\'re ready to talk next steps.',
        },
      ],
    },
  ],
};

// ─── Script 5: Closing / Contract ────────────────────────────────────────────

const closingContract: CallScript = {
  id: 'closing_contract',
  label: 'Closing / Contract',
  goal: 'Confirm the homeowner is ready to sign and walk them through next steps before sending the DocuSign agreement.',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      lines: [
        {
          id: 'cc-open-1',
          type: 'spoken',
          text: 'Hi {contactName}, great news — we\'re ready to move forward with {address}! I wanted to quickly walk through what happens next before I send the agreement over.',
        },
      ],
    },
    {
      id: 'key_points',
      title: 'Key Points',
      lines: [
        {
          id: 'cc-kp-1',
          type: 'spoken',
          text: 'The agreement will come through DocuSign — quick to review and sign electronically.',
        },
        {
          id: 'cc-kp-2',
          type: 'spoken',
          text: 'Once signed, we\'ll schedule a walkthrough and get a start date locked in.',
        },
        {
          id: 'cc-kp-3',
          type: 'spoken',
          text: '{senderName} remains your point of contact throughout onboarding.',
        },
      ],
    },
    {
      id: 'onboarding_overview',
      title: 'Post-Signing Onboarding Overview (If Homeowner Asks)',
      lines: [
        {
          id: 'cc-ob-0',
          type: 'instruction',
          text: 'Use this section if the homeowner asks "What happens after I sign?" or "How long does it take to get listed?" Our Onboarding/Operations Coordinator manages the full process from signed agreement to STR-ready listing.',
        },
        {
          id: 'cc-ob-1',
          type: 'spoken',
          text: 'Once the agreement is signed, our Onboarding and Operations Coordinator takes over and guides you through the entire process — from getting the property ready all the way to your first live listing. Here\'s a quick overview of what that looks like:',
        },
      ],
    },
    {
      id: 'onboarding_step1',
      title: 'Step 1 — Assessment & Prep (Week 1)',
      lines: [
        {
          id: 'cc-s1-0',
          type: 'instruction',
          text: 'If homeowner asks about the walkthrough or what "getting ready" involves:',
        },
        {
          id: 'cc-s1-1',
          type: 'spoken',
          text: 'The first thing we do is a full walkthrough and inspection of {address} — we document the condition, amenities, and flag any repairs or upgrades needed. We also do a safety compliance check: smoke and CO detectors, fire extinguisher, first aid kit, and lockboxes. And we\'ll identify any furnishing or staging gaps against our brand standard.',
        },
      ],
    },
    {
      id: 'onboarding_step2',
      title: 'Step 2 — Legal & Compliance',
      lines: [
        {
          id: 'cc-s2-0',
          type: 'instruction',
          text: 'If homeowner asks about permits, taxes, or HOA — especially relevant in Coachella Valley (Palm Desert, Indio, etc.):',
        },
        {
          id: 'cc-s2-1',
          type: 'spoken',
          text: 'We handle the legal and compliance side in parallel. That includes verifying your STR permit or license status with the city or county — this is especially important in the Coachella Valley where Palm Desert, Indio, and other cities have specific STR ordinances and permit caps. We also confirm TOT — Transient Occupancy Tax — registration, and HOA approval if that applies to your property.',
        },
      ],
    },
    {
      id: 'onboarding_step3',
      title: 'Step 3 — Photography & Content',
      lines: [
        {
          id: 'cc-s3-0',
          type: 'instruction',
          text: 'If homeowner asks about photos, listing quality, or how the property will be presented:',
        },
        {
          id: 'cc-s3-1',
          type: 'spoken',
          text: 'Once staging is complete, we schedule professional photography. For premium listings we also capture video and drone footage. We\'ll gather all the property specs — square footage, bed and bath count, full amenities list, and house rules — so the listing is accurate and complete.',
        },
      ],
    },
    {
      id: 'onboarding_step4',
      title: 'Step 4 — Operations Setup',
      lines: [
        {
          id: 'cc-s4-0',
          type: 'instruction',
          text: 'If homeowner asks about how the property is managed day-to-day or what tech is installed:',
        },
        {
          id: 'cc-s4-1',
          type: 'spoken',
          text: 'On the operations side, we add {address} to our property management system, set up your cleaning and turnover vendor, and stock supplies. We install smart locks — Yale or August — noise monitors, and smart thermostats as part of our standard tech stack. We also set up all guest communication templates and check-in instructions so everything is automated and consistent.',
        },
      ],
    },
    {
      id: 'onboarding_step5',
      title: 'Step 5 — Listing Creation',
      lines: [
        {
          id: 'cc-s5-0',
          type: 'instruction',
          text: 'If homeowner asks about pricing, which platforms, or how the listing is built:',
        },
        {
          id: 'cc-s5-1',
          type: 'spoken',
          text: 'We draft the full listing copy, run a comp analysis to set your pricing strategy, and configure your calendar and minimum stay rules. We set up listings on Airbnb, VRBO, and other channels, and sync the calendars. We typically soft-launch with competitive pricing to build initial reviews, then adjust from there.',
        },
      ],
    },
    {
      id: 'onboarding_step6',
      title: 'Step 6 — Pre-Launch QA',
      lines: [
        {
          id: 'cc-s6-0',
          type: 'instruction',
          text: 'If homeowner asks about the final check before going live:',
        },
        {
          id: 'cc-s6-1',
          type: 'spoken',
          text: 'Before we go live, we do a final walkthrough to make sure everything matches the listing photos and description. We also test the full guest journey — booking confirmation, check-in instructions, Wi-Fi, and everything else — so the first guest experience is seamless.',
        },
      ],
    },
    {
      id: 'onboarding_timeline',
      title: 'If Homeowner Asks About Timeline',
      lines: [
        {
          id: 'cc-tl-1',
          type: 'spoken',
          text: 'The full process from signed agreement to live listing typically takes a few weeks depending on how quickly the property is ready and how fast permits come through. Week one is the assessment and prep. Legal and compliance runs in parallel. Photography happens once staging is done. Then we build the listing and do a final QA before launch. Your Onboarding Coordinator will keep you updated at every step.',
        },
      ],
    },
    {
      id: 'close',
      title: 'Close',
      lines: [
        {
          id: 'cc-close-1',
          type: 'spoken',
          text: 'I\'ll send that agreement to your email right after this call. Take your time reviewing it, and if anything\'s unclear, just call or email me directly. Really excited to get started at {address}, {contactName}.',
        },
      ],
    },
  ],
};

// ─── Script 6: Landing Page Inbound (Warm Self-Submitted Lead) ────────────────

const landingPageInbound: CallScript = {
  id: 'landing_page_inbound',
  label: 'Landing Page Inbound',
  goal: 'Acknowledge the homeowner\'s self-submission, confirm their interest, and move quickly toward the questionnaire or a scheduled next step — skipping cold-intro logic entirely.',
  sections: [
    {
      id: 'opening',
      title: 'Opening — Acknowledge Their Submission',
      lines: [
        {
          id: 'lpi-open-1',
          type: 'spoken',
          text: 'Hi, is this {contactName}? Hi {contactName} — this is {senderName} from TRAVLR Vacation Homes. I\'m calling because you recently submitted your property at {address} through our website — I wanted to personally follow up and make sure we get you taken care of.',
        },
        {
          id: 'lpi-open-2',
          type: 'instruction',
          text: 'Tone: warm and responsive, not salesy. They came to you — acknowledge that immediately. Do NOT use the cold-outreach opener.',
        },
      ],
    },
    {
      id: 'confirm_interest',
      title: 'Confirm Their Interest',
      lines: [
        {
          id: 'lpi-ci-1',
          type: 'spoken',
          text: 'First — thanks for reaching out. It sounds like you\'re exploring what vacation rental management could look like for {address}. Is that right, or was there something specific that prompted you to submit?',
        },
        {
          id: 'lpi-ci-2',
          type: 'instruction',
          text: 'Listen carefully here. They may have a specific question, a timeline, or a concern. Let them lead briefly before pivoting to qualification.',
        },
      ],
    },
    {
      id: 'value_bridge',
      title: 'Value Bridge',
      lines: [
        {
          id: 'lpi-vb-1',
          type: 'spoken',
          text: 'That makes a lot of sense. {localBlurb}. What we do is handle everything end-to-end — guest services, cleaning, maintenance, pricing — so you\'re earning income without the day-to-day management headache.',
        },
        {
          id: 'lpi-vb-2',
          type: 'spoken',
          text: 'Since you already know what we do, I won\'t go through the whole intro — I\'d rather just make sure {address} is a good fit and get you a real number.',
        },
      ],
    },
    {
      id: 'questionnaire_pivot',
      title: 'Pivot to Qualification',
      lines: [
        {
          id: 'lpi-qp-1',
          type: 'spoken',
          text: 'The quickest way to do that is a short property questionnaire — takes about five minutes, and it\'s what lets us put together an actual revenue estimate for your specific property. Did you get a chance to start that, or would you like me to send it over now?',
        },
      ],
    },
    {
      id: 'if_already_started',
      title: 'If They Already Started the Questionnaire',
      lines: [
        {
          id: 'lpi-ias-1',
          type: 'spoken',
          text: 'Perfect — once that\'s submitted, our team reviews it and I\'ll follow up within a day or two with a full revenue estimate and next steps. Is there anything you want to ask me while I have you on the phone?',
        },
      ],
    },
    {
      id: 'if_not_started',
      title: 'If They Haven\'t Started It Yet',
      lines: [
        {
          id: 'lpi-ins-1',
          type: 'spoken',
          text: 'No problem — I\'ll text and email you the link right now. It saves your progress if you need to step away. Once it\'s in, I\'ll personally review it and get back to you with a revenue estimate.',
        },
      ],
    },
    {
      id: 'close_warm',
      title: 'Close',
      lines: [
        {
          id: 'lpi-cw-1',
          type: 'spoken',
          text: 'Really glad you reached out, {contactName} — {address} sounds like a great fit for what we do. I\'ll send that link right now, and feel free to call or text me directly if anything comes up. Talk soon.',
        },
      ],
    },
    {
      id: 'close_hesitant',
      title: 'If They\'re Hesitant or Just Browsing',
      lines: [
        {
          id: 'lpi-ch-1',
          type: 'spoken',
          text: 'Totally fine — no pressure at all. I\'ll send over some info so you have it when you\'re ready to take a closer look. And if you have questions at any point, I\'m easy to reach. Thanks for submitting, {contactName}.',
        },
      ],
    },
  ],
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const CALL_SCRIPTS: Record<ScriptId, CallScript> = {
  initial_outreach: initialOutreach,
  follow_up: followUp,
  questionnaire_handoff: questionnaireHandoff,
  proposal: proposal,
  closing_contract: closingContract,
  landing_page_inbound: landingPageInbound,
};

export const SCRIPT_OPTIONS: { value: ScriptId; label: string; goal: string }[] = [
  { value: 'initial_outreach', label: 'Initial Outreach', goal: initialOutreach.goal },
  { value: 'follow_up', label: 'Follow-Up', goal: followUp.goal },
  { value: 'questionnaire_handoff', label: 'Questionnaire Handoff', goal: questionnaireHandoff.goal },
  { value: 'proposal', label: 'Proposal', goal: proposal.goal },
  { value: 'closing_contract', label: 'Closing / Contract', goal: closingContract.goal },
  { value: 'landing_page_inbound', label: 'Landing Page Inbound', goal: landingPageInbound.goal },
];

/**
 * Build a flat text version of a script for feeding into the Claude system prompt.
 * Variables must already be resolved before calling this.
 */
export function buildScriptText(script: CallScript): string {
  const lines: string[] = [
    `${script.label.toUpperCase()} CALL SCRIPT`,
    `Goal: ${script.goal}`,
    '',
  ];

  for (const section of script.sections) {
    lines.push(`--- ${section.title} ---`);
    for (const line of section.lines) {
      if (line.type === 'instruction') {
        lines.push(`[${line.text}]`);
      } else if (line.type === 'agent_fill') {
        lines.push(`[AGENT FILLS IN: ${line.text}]`);
      } else {
        lines.push(`"${line.text}"`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
