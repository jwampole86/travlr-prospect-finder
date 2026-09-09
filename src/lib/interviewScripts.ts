// ─── TRAVLR Interview Scripts ─────────────────────────────────────────────────
// Structured interview scripts for Jen Wampole to use during Zoom interviews

export interface InterviewQuestion {
  id: string;
  category: string;
  question: string;
  followUps?: string[];
  notes?: string;
}

export interface InterviewSection {
  id: string;
  title: string;
  duration: string;
  questions: InterviewQuestion[];
}

export interface InterviewScript {
  roleId: string;
  roleTitle: string;
  shortTitle: string;
  description: string;
  totalDuration: string;
  sections: InterviewSection[];
}

export const INTERVIEW_ROLES: { value: string; label: string; description: string }[] = [
  {
    value: 'homeowner_outreach_agent',
    label: 'Homeowner Outreach Agent',
    description: 'Front-line outreach to prospective homeowner partners',
  },
  {
    value: 'guest_experience_manager',
    label: 'Guest Experience Manager',
    description: 'Manages guest satisfaction and experience across properties',
  },
  {
    value: 'homeowner_success_manager',
    label: 'Homeowner Success Manager',
    description: 'Manages ongoing homeowner relationships and retention',
  },
  {
    value: 'head_of_property_operations',
    label: 'Head of Property Operations',
    description: 'Oversees all property operations, maintenance, and logistics',
  },
  {
    value: 'property_coordinator',
    label: 'Property Coordinator',
    description: 'Coordinates day-to-day property management tasks',
  },
  {
    value: 'revenue_manager',
    label: 'Revenue Manager',
    description: 'Manages pricing strategy and revenue optimization',
  },
  // ─── Prospect Finder Candidate Scripts ──────────────────────────────────────
  {
    value: 'candidate_kelli_winkel',
    label: 'Kelli Winkel — Prospect Finder',
    description: '20+ yrs luxury vacation rentals & STR management; top-ranked fit',
  },
  {
    value: 'candidate_brett_allen',
    label: 'Brett Allen — Prospect Finder',
    description: 'Directed ops for 60+ high-end properties; strong owner relationships',
  },
  {
    value: 'candidate_gina_mattivello',
    label: 'Gina L. Mattivello — Prospect Finder',
    description: 'High-volume outbound phone sales (75–100 calls/day), full-cycle closing',
  },
  {
    value: 'candidate_karissa_crooks',
    label: 'Karissa Crooks — Prospect Finder',
    description: 'Owner leads in CRM, property onboarding, revenue management',
  },
  {
    value: 'candidate_caitlyn_sorrells',
    label: 'Caitlyn Sorrells — Prospect Finder',
    description: 'National Director, corporate housing; lead gen & inventory building',
  },
  {
    value: 'candidate_margo_johnson',
    label: 'Margo Johnson — Prospect Finder',
    description: '300+ cold calls/day in real estate SaaS; full-cycle B2B sales',
  },
  {
    value: 'candidate_jessica_thrasher',
    label: 'Jessica Thrasher — Prospect Finder',
    description: 'CO Real Estate Broker, property management, marketing business owner',
  },
  {
    value: 'candidate_darlene_ciao',
    label: 'Darlene Ciao — Prospect Finder',
    description: 'Consistent phone-based consultative sales across multiple industries',
  },
];

// ─── Shared Compensation Language ─────────────────────────────────────────────
export const SHARED_COMPENSATION_LANGUAGE =
  `The role pays a $750–$1,000 signing bonus for every new homeowner who joins through your outreach, ` +
  `plus a 2% override on that property's management fee revenue for the first 12 months — so your ` +
  `earnings scale with the size and performance of the home, not just a flat per-call rate. It's ` +
  `uncapped, and every lead you call is warm and pre-qualified — no cold prospecting.`;

export const SHARED_TRAVLR_COMPANY_POSITIONING =
  `TRAVLR Vacation Homes has spent the past 10 years as a premier partner for homeowners of ultra-luxury ` +
  `California properties, managing multi-million-dollar vacation homes with high-touch care. The California ` +
  `desert portfolio has shown that TRAVLR can protect and elevate property value while producing substantial ` +
  `passive income for owners. TRAVLR is now bringing that approach to Aspen, Vail, Las Vegas, Miami, and Seattle. ` +
  `The operating model combines full-service property management, 5-star guest hospitality, dynamic revenue ` +
  `optimization, smart-home technology, compliance and permit support, robust marketing, weekly inspections, ` +
  `and transparent owner-portal reporting.`;

export const INTERVIEW_SCRIPTS: Record<string, InterviewScript> = {
  homeowner_outreach_agent: {
    roleId: 'homeowner_outreach_agent',
    roleTitle: 'Homeowner Outreach Agent',
    shortTitle: 'Outreach Agent',
    description: 'Front-line outreach to prospective homeowner partners',
    totalDuration: '45–60 min',
    sections: [
      {
        id: 'company-positioning',
        title: 'TRAVLR Company Positioning',
        duration: 'Reference',
        questions: [
          {
            id: 'company-positioning-1',
            category: 'Company Context',
            question: SHARED_TRAVLR_COMPANY_POSITIONING,
            notes: 'Use this as interviewer context when asking candidates how they would explain TRAVLR to ultra-luxury homeowners.',
          },
        ],
      },
      {
        id: 'intro',
        title: 'Introduction & Overview',
        duration: '5 min',
        questions: [
          {
            id: 'intro-1',
            category: 'Opening',
            question: "Thanks for joining today — I'm Jen, and I lead the team here at TRAVLR. Can you start by walking me through your background and what drew you to this role?",
            followUps: ['What specifically about TRAVLR caught your attention?', 'How did you hear about us?'],
          },
          {
            id: 'intro-2',
            category: 'Opening',
            question: 'What does a typical day look like for you in your current or most recent role?',
          },
        ],
      },
      {
        id: 'outreach-skills',
        title: 'Outreach & Communication Skills',
        duration: '15 min',
        questions: [
          {
            id: 'out-1',
            category: 'Cold Outreach',
            question: 'Walk me through how you approach a cold outreach campaign from scratch — how do you build your list, craft your message, and track results.',
            followUps: ['What open rates or response rates have you achieved?', 'How do you personalize at scale?'],
          },
          {
            id: 'out-2',
            category: 'Objection Handling',
            question: 'Tell me about a time a prospect pushed back hard on your pitch. What was the objection and how did you handle it?',
            followUps: ['Did you ultimately convert them?', 'What would you do differently now?'],
          },
          {
            id: 'out-3',
            category: 'Phone Skills',
            question: "How comfortable are you with high-volume phone outreach? Describe your approach to a cold call to a homeowner who has never heard of TRAVLR.",
            notes: 'Look for: confidence, warmth, ability to handle rejection, natural conversational style',
          },
          {
            id: 'out-4',
            category: 'Follow-Up',
            question: "How do you manage follow-up cadence without being annoying? What's your rule of thumb for when to persist vs. move on?",
          },
        ],
      },
      {
        id: 'real-estate',
        title: 'Real Estate & STR Knowledge',
        duration: '10 min',
        questions: [
          {
            id: 're-1',
            category: 'Industry Knowledge',
            question: "What do you know about the short-term rental market and how it differs from traditional long-term rentals from a homeowner's perspective?",
          },
          {
            id: 're-2',
            category: 'Value Proposition',
            question: 'If a homeowner asked you "Why should I partner with TRAVLR instead of just listing on Airbnb myself?" — what would you say?',
            notes: 'Look for: understanding of management value, revenue optimization, guest experience, hands-off ownership',
          },
          {
            id: 're-3',
            category: 'Market Awareness',
            question: 'Are you familiar with any STR regulations or compliance requirements in markets like Colorado, Maryland, or Florida?',
          },
        ],
      },
      {
        id: 'tools-process',
        title: 'Tools & Process',
        duration: '5 min',
        questions: [
          {
            id: 'tools-1',
            category: 'CRM & Tools',
            question: 'What CRM or outreach tools have you used? How do you stay organized when managing hundreds of leads?',
          },
          {
            id: 'tools-2',
            category: 'Metrics',
            question: 'How do you measure your own performance? What KPIs do you track and how do you hold yourself accountable?',
          },
        ],
      },
      {
        id: 'culture-fit',
        title: 'Culture & Fit',
        duration: '10 min',
        questions: [
          {
            id: 'culture-1',
            category: 'Work Style',
            question: 'This is a fast-moving startup environment. How do you handle ambiguity or shifting priorities?',
          },
          {
            id: 'culture-2',
            category: 'Motivation',
            question: 'What motivates you most in a sales or outreach role — the hunt, the close, the relationship, or the numbers?',
          },
          {
            id: 'culture-3',
            category: 'Remote Work',
            question: 'This role is remote. How do you stay productive and connected when working independently?',
          },
        ],
      },
      {
        id: 'close',
        title: 'Closing Questions',
        duration: '5 min',
        questions: [
          {
            id: 'close-1',
            category: 'Candidate Questions',
            question: 'What questions do you have for me about the role, the team, or TRAVLR?',
          },
          {
            id: 'close-2',
            category: 'Next Steps',
            question: "We're moving quickly on this. What does your timeline look like and when could you start if things move forward?",
          },
        ],
      },
    ],
  },

  guest_experience_manager: {
    roleId: 'guest_experience_manager',
    roleTitle: 'Guest Experience Manager',
    shortTitle: 'Guest Experience',
    description: 'Manages guest satisfaction and experience across properties',
    totalDuration: '45–60 min',
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        duration: '5 min',
        questions: [
          {
            id: 'intro-1',
            category: 'Opening',
            question: "Thanks for being here — I'm Jen. Tell me about yourself and what brought you to hospitality or guest experience work.",
          },
          {
            id: 'intro-2',
            category: 'Opening',
            question: 'What does exceptional guest experience mean to you in the context of short-term rentals?',
          },
        ],
      },
      {
        id: 'guest-skills',
        title: 'Guest Experience Skills',
        duration: '15 min',
        questions: [
          {
            id: 'guest-1',
            category: 'Problem Resolution',
            question: "Tell me about a time a guest had a serious complaint or emergency during their stay. How did you handle it?",
            followUps: ['What was the outcome?', 'What would you do differently?'],
          },
          {
            id: 'guest-2',
            category: 'Communication',
            question: 'How do you balance being responsive to guests while also setting appropriate boundaries and expectations?',
          },
          {
            id: 'guest-3',
            category: 'Reviews',
            question: "How do you proactively drive 5-star reviews? What's your strategy for turning a neutral guest into a raving fan?",
          },
          {
            id: 'guest-4',
            category: 'Difficult Guests',
            question: 'Describe a situation where a guest was being unreasonable or making demands outside your policies. How did you handle it?',
            notes: 'Look for: empathy, firmness, policy knowledge, de-escalation skills',
          },
        ],
      },
      {
        id: 'operations',
        title: 'Operations & Coordination',
        duration: '10 min',
        questions: [
          {
            id: 'ops-1',
            category: 'Turnover Management',
            question: 'How have you managed property turnovers at scale? What systems or processes did you put in place?',
          },
          {
            id: 'ops-2',
            category: 'Vendor Management',
            question: 'How do you manage cleaning crews, maintenance vendors, and other service providers to ensure quality and reliability?',
          },
          {
            id: 'ops-3',
            category: 'Multi-Property',
            question: 'Have you managed multiple properties simultaneously? How many, and how did you stay on top of everything?',
          },
        ],
      },
      {
        id: 'tools',
        title: 'Tools & Technology',
        duration: '5 min',
        questions: [
          {
            id: 'tools-1',
            category: 'PMS & Tools',
            question: 'What property management systems or guest communication tools have you used? (Guesty, Hostaway, Lodgify, etc.)',
          },
          {
            id: 'tools-2',
            category: 'Automation',
            question: 'How have you used automation to improve guest communication or operational efficiency?',
          },
        ],
      },
      {
        id: 'culture-fit',
        title: 'Culture & Fit',
        duration: '10 min',
        questions: [
          {
            id: 'culture-1',
            category: 'Pace',
            question: 'Guest experience can be 24/7 in nature. How do you manage your own time and energy while staying responsive?',
          },
          {
            id: 'culture-2',
            category: 'Ownership',
            question: 'Tell me about a time you identified a gap in the guest experience and took initiative to fix it without being asked.',
          },
        ],
      },
      {
        id: 'close',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'close-1',
            category: 'Candidate Questions',
            question: 'What questions do you have for me about TRAVLR or this role?',
          },
          {
            id: 'close-2',
            category: 'Next Steps',
            question: "What's your availability and timeline if we move forward?",
          },
        ],
      },
    ],
  },

  homeowner_success_manager: {
    roleId: 'homeowner_success_manager',
    roleTitle: 'Homeowner Success Manager',
    shortTitle: 'Homeowner Success',
    description: 'Manages ongoing homeowner relationships and retention',
    totalDuration: '45–60 min',
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        duration: '5 min',
        questions: [
          {
            id: 'intro-1',
            category: 'Opening',
            question: "Hi, I'm Jen — thanks for joining. Walk me through your background in account management or customer success.",
          },
          {
            id: 'intro-2',
            category: 'Opening',
            question: 'What does "homeowner success" mean to you in the context of a property management company?',
          },
        ],
      },
      {
        id: 'relationship',
        title: 'Relationship Management',
        duration: '15 min',
        questions: [
          {
            id: 'rel-1',
            category: 'Retention',
            question: 'Tell me about a time you saved a client relationship that was at risk of churning. What was the situation and what did you do?',
            followUps: ['What was the root cause of their dissatisfaction?', 'What did you learn from it?'],
          },
          {
            id: 'rel-2',
            category: 'Proactive Communication',
            question: 'How do you proactively communicate with clients to prevent problems before they escalate?',
          },
          {
            id: 'rel-3',
            category: 'Difficult Conversations',
            question: 'Describe a time you had to deliver bad news to a client — like lower-than-expected revenue or a property issue. How did you handle it?',
            notes: 'Look for: transparency, empathy, solution-orientation, ownership',
          },
          {
            id: 'rel-4',
            category: 'Upsell / Expansion',
            question: 'Have you ever identified opportunities to expand a client relationship or add services? How did you approach it?',
          },
        ],
      },
      {
        id: 'real-estate',
        title: 'Real Estate & STR Knowledge',
        duration: '10 min',
        questions: [
          {
            id: 're-1',
            category: 'Revenue',
            question: 'How comfortable are you discussing revenue performance, occupancy rates, and ADR with homeowners who may not be familiar with STR metrics?',
          },
          {
            id: 're-2',
            category: 'Property Knowledge',
            question: "What do you know about the factors that drive STR performance — location, seasonality, pricing strategy, listing quality?",
          },
          {
            id: 're-3',
            category: 'Compliance',
            question: "Are you familiar with STR regulations and how they might affect a homeowner's ability to rent their property?",
          },
        ],
      },
      {
        id: 'tools',
        title: 'Tools & Process',
        duration: '5 min',
        questions: [
          {
            id: 'tools-1',
            category: 'CRM',
            question: 'What CRM or customer success tools have you used? How do you track the health of your accounts?',
          },
          {
            id: 'tools-2',
            category: 'Reporting',
            question: "How do you create and present performance reports to clients in a way that's clear and builds confidence?",
          },
        ],
      },
      {
        id: 'culture-fit',
        title: 'Culture & Fit',
        duration: '10 min',
        questions: [
          {
            id: 'culture-1',
            category: 'Ownership',
            question: 'This role requires a high degree of ownership. Tell me about a time you went above and beyond for a client without being asked.',
          },
          {
            id: 'culture-2',
            category: 'Startup Mindset',
            question: "We're building processes as we go. How do you handle working in an environment where not everything is defined yet?",
          },
        ],
      },
      {
        id: 'close',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'close-1',
            category: 'Candidate Questions',
            question: 'What questions do you have for me about the role or TRAVLR?',
          },
          {
            id: 'close-2',
            category: 'Next Steps',
            question: "What's your timeline and when could you start if things move forward?",
          },
        ],
      },
    ],
  },

  head_of_property_operations: {
    roleId: 'head_of_property_operations',
    roleTitle: 'Head of Property Operations',
    shortTitle: 'Head of Ops',
    description: 'Oversees all property operations, maintenance, and logistics',
    totalDuration: '60 min',
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        duration: '5 min',
        questions: [
          {
            id: 'intro-1',
            category: 'Opening',
            question: "Thanks for joining — I'm Jen. Walk me through your background in property operations or hospitality management.",
          },
          {
            id: 'intro-2',
            category: 'Opening',
            question: "What's the largest portfolio or team you've managed, and what were your key responsibilities?",
          },
        ],
      },
      {
        id: 'operations',
        title: 'Operations Leadership',
        duration: '20 min',
        questions: [
          {
            id: 'ops-1',
            category: 'Scale',
            question: 'How have you built or scaled an operations function from scratch? What were the first systems you put in place?',
            followUps: ['What broke first as you scaled?', 'How did you fix it?'],
          },
          {
            id: 'ops-2',
            category: 'Vendor Management',
            question: 'How do you build and manage a reliable vendor network for cleaning, maintenance, and emergency services across multiple markets?',
          },
          {
            id: 'ops-3',
            category: 'Quality Control',
            question: 'What quality control systems have you implemented to ensure consistent property standards across a large portfolio?',
            notes: 'Look for: checklists, inspection processes, photo verification, scoring systems',
          },
          {
            id: 'ops-4',
            category: 'Crisis Management',
            question: "Tell me about a major operational crisis you've managed — a property emergency, a vendor failure, or a guest incident. How did you handle it?",
          },
          {
            id: 'ops-5',
            category: 'Cost Management',
            question: 'How do you balance operational quality with cost efficiency? Give me an example of a cost-saving initiative you led.',
          },
        ],
      },
      {
        id: 'team',
        title: 'Team & Leadership',
        duration: '10 min',
        questions: [
          {
            id: 'team-1',
            category: 'Team Building',
            question: 'How have you built and developed an operations team? What do you look for when hiring?',
          },
          {
            id: 'team-2',
            category: 'Performance Management',
            question: 'How do you hold your team accountable to performance standards while keeping morale high?',
          },
          {
            id: 'team-3',
            category: 'Cross-Functional',
            question: 'How do you work with guest experience, homeowner success, and revenue teams to ensure operations supports the broader business?',
          },
        ],
      },
      {
        id: 'technology',
        title: 'Technology & Systems',
        duration: '10 min',
        questions: [
          {
            id: 'tech-1',
            category: 'PMS & Tools',
            question: 'What property management systems, operations tools, or automation platforms have you implemented or used at scale?',
          },
          {
            id: 'tech-2',
            category: 'Data & Reporting',
            question: 'How do you use data to drive operational decisions? What metrics do you track and report on?',
          },
        ],
      },
      {
        id: 'strategy',
        title: 'Strategy & Vision',
        duration: '10 min',
        questions: [
          {
            id: 'strat-1',
            category: 'Vision',
            question: 'If you joined TRAVLR as Head of Property Operations, what would your first 90 days look like?',
          },
          {
            id: 'strat-2',
            category: 'Growth',
            question: 'What do you see as the biggest operational challenges for a fast-growing STR company expanding into new markets?',
          },
        ],
      },
      {
        id: 'close',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'close-1',
            category: 'Candidate Questions',
            question: 'What questions do you have for me about TRAVLR, the team, or this role?',
          },
          {
            id: 'close-2',
            category: 'Next Steps',
            question: "What's your timeline and compensation expectations if we move forward?",
          },
        ],
      },
    ],
  },

  property_coordinator: {
    roleId: 'property_coordinator',
    roleTitle: 'Property Coordinator',
    shortTitle: 'Property Coord.',
    description: 'Coordinates day-to-day property management tasks',
    totalDuration: '45 min',
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        duration: '5 min',
        questions: [
          {
            id: 'intro-1',
            category: 'Opening',
            question: "Hi, I'm Jen — thanks for joining. Tell me about your background and what drew you to property coordination or management.",
          },
        ],
      },
      {
        id: 'coordination',
        title: 'Coordination Skills',
        duration: '15 min',
        questions: [
          {
            id: 'coord-1',
            category: 'Organization',
            question: 'How do you manage multiple competing priorities and deadlines? Walk me through your organizational system.',
          },
          {
            id: 'coord-2',
            category: 'Vendor Coordination',
            question: 'Tell me about a time you had to coordinate multiple vendors for a property — cleaning, maintenance, inspection. How did you keep everything on track?',
          },
          {
            id: 'coord-3',
            category: 'Problem Solving',
            question: 'Describe a time something went wrong with a property and you had to solve it quickly. What happened and what did you do?',
          },
        ],
      },
      {
        id: 'communication',
        title: 'Communication',
        duration: '10 min',
        questions: [
          {
            id: 'comm-1',
            category: 'Stakeholder Communication',
            question: 'How do you communicate with homeowners, guests, and vendors simultaneously without things falling through the cracks?',
          },
          {
            id: 'comm-2',
            category: 'Written Communication',
            question: "How comfortable are you with written communication — emails, messages, reports? Can you give me an example of a message you'd send to a homeowner about a maintenance issue?",
          },
        ],
      },
      {
        id: 'tools',
        title: 'Tools & Tech',
        duration: '5 min',
        questions: [
          {
            id: 'tools-1',
            category: 'Tools',
            question: 'What tools or software have you used for property management, scheduling, or communication?',
          },
        ],
      },
      {
        id: 'close',
        title: 'Closing',
        duration: '10 min',
        questions: [
          {
            id: 'culture-1',
            category: 'Culture',
            question: 'What kind of work environment do you thrive in? How do you handle fast-paced, sometimes unpredictable days?',
          },
          {
            id: 'close-1',
            category: 'Candidate Questions',
            question: 'What questions do you have for me about TRAVLR or this role?',
          },
        ],
      },
    ],
  },

  revenue_manager: {
    roleId: 'revenue_manager',
    roleTitle: 'Revenue Manager',
    shortTitle: 'Revenue Mgr',
    description: 'Manages pricing strategy and revenue optimization',
    totalDuration: '45–60 min',
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        duration: '5 min',
        questions: [
          {
            id: 'intro-1',
            category: 'Opening',
            question: "Hi, I'm Jen — thanks for joining. Walk me through your background in revenue management or pricing strategy.",
          },
          {
            id: 'intro-2',
            category: 'Opening',
            question: 'What drew you to revenue management specifically, and what do you find most interesting about it?',
          },
        ],
      },
      {
        id: 'revenue-skills',
        title: 'Revenue Management Skills',
        duration: '20 min',
        questions: [
          {
            id: 'rev-1',
            category: 'Pricing Strategy',
            question: 'Walk me through your approach to dynamic pricing for short-term rentals. What factors do you consider and how do you balance occupancy vs. ADR?',
            notes: 'Look for: seasonality, events, comp set analysis, demand forecasting, minimum stays',
          },
          {
            id: 'rev-2',
            category: 'Tools',
            question: 'What revenue management or dynamic pricing tools have you used? (PriceLabs, Beyond, Wheelhouse, etc.) What are their strengths and limitations?',
          },
          {
            id: 'rev-3',
            category: 'Performance',
            question: 'Tell me about a pricing change or strategy you implemented that significantly improved revenue performance. What was the impact?',
          },
          {
            id: 'rev-4',
            category: 'Market Analysis',
            question: 'How do you analyze a new market to set initial pricing? What data sources do you use?',
          },
        ],
      },
      {
        id: 'analytics',
        title: 'Analytics & Reporting',
        duration: '10 min',
        questions: [
          {
            id: 'analytics-1',
            category: 'Metrics',
            question: 'What KPIs do you track to measure revenue performance? How do you report on them to stakeholders?',
          },
          {
            id: 'analytics-2',
            category: 'Data',
            question: 'How comfortable are you with data analysis? What tools do you use — Excel, SQL, BI tools?',
          },
        ],
      },
      {
        id: 'collaboration',
        title: 'Collaboration',
        duration: '10 min',
        questions: [
          {
            id: 'collab-1',
            category: 'Cross-Functional',
            question: "How do you work with operations and guest experience teams to ensure pricing decisions don't create operational problems?",
          },
          {
            id: 'collab-2',
            category: 'Homeowner Communication',
            question: 'How would you explain a pricing recommendation to a homeowner who is unhappy with their revenue performance?',
          },
        ],
      },
      {
        id: 'close',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'close-1',
            category: 'Candidate Questions',
            question: 'What questions do you have for me about TRAVLR or this role?',
          },
          {
            id: 'close-2',
            category: 'Next Steps',
            question: "What's your timeline and when could you start if things move forward?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Kelli Winkel ─────────────────────────────────────────────────
  candidate_kelli_winkel: {
    roleId: 'candidate_kelli_winkel',
    roleTitle: 'Kelli Winkel — Outreach & BD Agent',
    shortTitle: 'Kelli Winkel',
    description: 'Top-ranked fit: 20+ yrs luxury vacation rentals, direct homeowner recruitment experience. Flagged: Florida-based (remote OK).',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'kw-open-1',
            category: 'Opening',
            question: "Hi Kelli, thanks for making time today. I've got your background in front of me — 20+ years in luxury vacation rental and property management is exactly the depth we're looking for on this team. I'd love to start by hearing, in your own words, about your experience actually recruiting homeowners into a management program — not just managing properties once they're already signed.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'kw-bg-a',
            category: 'Background Probe — Option A',
            question: "Walk me through what a typical homeowner recruitment conversation looked like for you — from the first call to them actually signing on.",
          },
          {
            id: 'kw-bg-b',
            category: 'Background Probe — Option B',
            question: "You mention owning the full sales pipeline — what did that pipeline actually look like day to day, and how did you keep leads moving instead of going stale?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'kw-concern-1',
            category: 'Concern Probe — Florida / Remote Logistics',
            question: "Since this role is remote, I want to make sure the logistics work well on both sides — what does your ideal daily schedule look like, and are there any time zone or availability constraints on your end I should know about given you're in Florida?",
            notes: 'Flagged concern: Florida-based. Remote is fine, but confirm time zone alignment and daily availability.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'kw-align-1',
            category: 'Role Alignment',
            question: "This role is specifically warm-lead, phone-based conversion — not sourcing, not cold outreach. Given your background owning a fuller pipeline before, how do you feel about a role that's more narrowly focused on the call and the close?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'kw-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'kw-close-1',
            category: 'Closing',
            question: "Given everything we've talked through, what questions do you have for me about TRAVLR, the properties, or the day-to-day of this role?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Brett Allen ──────────────────────────────────────────────────
  candidate_brett_allen: {
    roleId: 'candidate_brett_allen',
    roleTitle: 'Brett Allen — Outreach & BD Agent',
    shortTitle: 'Brett Allen',
    description: 'Strong fit: directed ops for 60+ high-end properties, portfolio growth, owner relationships. Flagged: operations-heavy vs. pure outbound sales.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'ba-open-1',
            category: 'Opening',
            question: "Hi Brett, thanks for joining. Your operations background managing 60+ high-end properties really stood out — that's a serious scale of owner relationships. This role is a bit different from operations, though, so I want to spend some time understanding your actual comfort level with being on the phone converting warm leads day to day.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'ba-bg-a',
            category: 'Background Probe — Option A',
            question: "When you grew those portfolios, were you personally involved in the homeowner conversations that got new properties signed, or was that handled by a separate team?",
          },
          {
            id: 'ba-bg-b',
            category: 'Background Probe — Option B',
            question: "What part of managing owner relationships did you enjoy most — the ongoing relationship, or the moment of actually bringing a new owner on board?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'ba-concern-1',
            category: 'Concern Probe — Ops Background vs. Sales Role',
            question: "I want to be direct about this: this role is almost entirely phone-based conversion — talking to warm leads and guiding them to sign, not managing day-to-day operations once they're on board. How does that sit with you, genuinely? Is that the kind of daily work you want, or would you miss the operational side?",
            notes: 'Flagged concern: More operations-heavy than pure outbound sales. Probe for genuine appetite for phone-first, conversion-focused work.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'ba-align-1',
            category: 'Role Alignment',
            question: "Given your operations depth, I'd guess you're very credible talking to a sophisticated homeowner about what happens after they sign — how would you use that in a sales conversation without turning it into an operations pitch?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'ba-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'ba-close-1',
            category: 'Closing',
            question: "What would make this the right move for you right now, given where you've been operationally?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Gina L. Mattivello ──────────────────────────────────────────
  candidate_gina_mattivello: {
    roleId: 'candidate_gina_mattivello',
    roleTitle: 'Gina L. Mattivello — Outreach & BD Agent',
    shortTitle: 'Gina Mattivello',
    description: 'Strong fit: high-volume outbound phone sales (75–100 calls/day), full-cycle closing, objection handling, CRM pipeline. Flagged: less luxury STR/homeowner experience.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'gm-open-1',
            category: 'Opening',
            question: "Hi Gina, thanks for taking the time. Your phone sales background jumped out immediately — 75 to 100 calls a day with full-cycle closing is a serious volume and skill level. This role is actually lower-volume than that, since every lead is warm and pre-qualified, but I want to understand how your high-volume closing skill translates to a more relationship-driven, high-value conversation.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'gm-bg-a',
            category: 'Background Probe — Option A',
            question: "At that call volume, how did you keep each conversation feeling personal rather than scripted, especially by the 50th call of the day?",
          },
          {
            id: 'gm-bg-b',
            category: 'Background Probe — Option B',
            question: "Walk me through how you typically handled objections — what's your actual approach in the moment, not just the theory?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'gm-concern-1',
            category: 'Concern Probe — Luxury STR Experience',
            question: "This role involves talking with owners of multi-million dollar properties about a fairly sophisticated topic — property management and concierge services. What's your comfort level stepping into a luxury, high-net-worth conversation specifically, even without direct STR experience yet?",
            notes: 'Flagged concern: Less direct luxury STR/homeowner experience. Assess adaptability and learning curve for high-net-worth conversations.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'gm-align-1',
            category: 'Role Alignment',
            question: "Since every lead here is already warm, pre-qualified, and reaching out because they're interested, how do you think your high-volume, cold-outbound skill set changes or adapts to a warm-lead, consultative conversation?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'gm-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'gm-close-1',
            category: 'Closing',
            question: "What questions do you have about the properties, the homeowners we work with, or how the CRM and call queue work day to day?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Karissa Crooks ───────────────────────────────────────────────
  candidate_karissa_crooks: {
    roleId: 'candidate_karissa_crooks',
    roleTitle: 'Karissa Crooks — Outreach & BD Agent',
    shortTitle: 'Karissa Crooks',
    description: 'Strong fit: managed owner leads in CRM, onboarded properties, revenue management, new-home sales. Flagged: less pure high-volume outreach experience.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'kc-open-1',
            category: 'Opening',
            question: "Hi Karissa, thanks for joining. I like that your background already includes managing owner leads directly in a CRM and onboarding properties — that's very close to what this role actually does day to day. I want to dig into your comfort level with a steady daily call queue specifically.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'kc-bg-a',
            category: 'Background Probe — Option A',
            question: "When you onboarded properties, what did the actual homeowner conversation look like — were you the one convincing them to join, or picking up after someone else had already sold them?",
          },
          {
            id: 'kc-bg-b',
            category: 'Background Probe — Option B',
            question: "Tell me about your new-home sales experience — what part of that felt most similar to convincing someone to make a big decision about their property?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'kc-concern-1',
            category: 'Concern Probe — Call Volume Cadence',
            question: "This role involves working through a daily queue of warm leads fairly consistently. Have you worked a real call-volume cadence before, and how do you personally stay consistent and organized across a full day of these conversations?",
            notes: 'Flagged concern: Less pure high-volume outreach experience than Gina or Kelli. Probe for daily discipline and consistency.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'kc-align-1',
            category: 'Role Alignment',
            question: "Given you've already worked directly with homeowners and in a CRM, what part of this role feels most familiar to you, and what part feels newest?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'kc-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'kc-close-1',
            category: 'Closing',
            question: "What would you want to know about TRAVLR specifically, or about the homeowners we currently manage properties for?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Caitlyn Sorrells ────────────────────────────────────────────
  candidate_caitlyn_sorrells: {
    roleId: 'candidate_caitlyn_sorrells',
    roleTitle: 'Caitlyn Sorrells — Outreach & BD Agent',
    shortTitle: 'Caitlyn Sorrells',
    description: 'Strong fit: National Director, corporate housing; lead gen, owner/guest relations, inventory building, B2B outreach. Flagged: more operational/admin than pure BD.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'cs-open-1',
            category: 'Opening',
            question: "Hi Caitlyn, thanks for making time. Your tenure as a National Director really stands out — especially the lead generation and inventory-building side of that role. I want to talk through how much of your day was actually spent on the phone converting owners versus managing things operationally.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'cs-bg-a',
            category: 'Background Probe — Option A',
            question: "As National Director, how much of your role was hands-on with individual owner conversations versus overseeing a broader team or process?",
          },
          {
            id: 'cs-bg-b',
            category: 'Background Probe — Option B',
            question: "Tell me about the B2B outreach part of your role — what did a successful outreach conversation actually look like for you?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'cs-concern-1',
            category: 'Concern Probe — Operational vs. BD-Focused Role',
            question: "This role is very specifically about being on the phone with homeowners every day, not managing a broader operation. How much of that day-to-day, one-on-one selling do you genuinely want right now, versus the more administrative or oversight work you've done more recently?",
            notes: 'Flagged concern: More operational/administrative background. Probe for genuine desire to return to individual contributor selling.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'cs-align-1',
            category: 'Role Alignment',
            question: "Given your background in owner and guest relations specifically, how would you describe your natural style on a call — more relationship-building, or more direct and efficient?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'cs-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'cs-close-1',
            category: 'Closing',
            question: "What questions do you have about the day-to-day structure of this role, or about TRAVLR's current homeowner portfolio?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Margo Johnson ────────────────────────────────────────────────
  candidate_margo_johnson: {
    roleId: 'candidate_margo_johnson',
    roleTitle: 'Margo Johnson — Outreach & BD Agent',
    shortTitle: 'Margo Johnson',
    description: 'Strong fit: 300+ cold calls/day in real estate SaaS, full-cycle B2B sales, CRM expertise (HubSpot, Salesforce, Pipedrive). Flagged: less luxury STR/homeowner-specific experience.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'mj-open-1',
            category: 'Opening',
            question: "Hi Margo, thanks for joining. 300+ calls a day in real estate SaaS is a genuinely impressive volume and shows real discipline. This role is actually a different shape — much lower volume, since every lead is warm — so I want to talk about how you'd approach a smaller number of higher-stakes, higher-value conversations.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'mj-bg-a',
            category: 'Background Probe — Option A',
            question: "At that call volume in real estate SaaS, what were you actually selling, and how did you adapt your pitch across such a high number of calls?",
          },
          {
            id: 'mj-bg-b',
            category: 'Background Probe — Option B',
            question: "Which CRM did you rely on most, and what's one habit from managing that pipeline you'd bring directly into this role?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'mj-concern-1',
            category: 'Concern Probe — Luxury STR Audience',
            question: "This role involves speaking with owners of multi-million dollar vacation properties specifically about property management and concierge-level service. What's your comfort level adjusting your pitch and tone for a luxury, high-net-worth audience versus the real estate SaaS audience you're used to?",
            notes: 'Flagged concern: Excellent pure BD skillset, but less luxury STR/homeowner-specific experience. Assess tone adaptability.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'mj-align-1',
            category: 'Role Alignment',
            question: "Given you're used to a much higher call volume, how do you think you'll approach a queue that's smaller but where every single lead is already warm and worth real time and attention?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'mj-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'mj-close-1',
            category: 'Closing',
            question: "What would you want to know about TRAVLR's properties, the homeowners we work with, or how leads get to you already pre-qualified?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Jessica Thrasher ─────────────────────────────────────────────
  candidate_jessica_thrasher: {
    roleId: 'candidate_jessica_thrasher',
    roleTitle: 'Jessica Thrasher — Outreach & BD Agent',
    shortTitle: 'Jessica Thrasher',
    description: 'Secondary fit: CO Real Estate Broker, property management at large high-rise, marketing business owner. Flagged: phone outreach not clear primary strength.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'jt-open-1',
            category: 'Opening',
            question: "Hi Jessica, thanks for joining. Your real estate broker background combined with property management experience at a large high-rise gives you a really solid foundation for understanding what homeowners actually care about. I want to talk specifically about your comfort and experience on the phone, since that's the core of this role day to day.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'jt-bg-a',
            category: 'Background Probe — Option A',
            question: "As a broker, how much of your client work happened over the phone versus in person — walk me through a typical client conversation.",
          },
          {
            id: 'jt-bg-b',
            category: 'Background Probe — Option B',
            question: "Tell me about your marketing business — how did that shape how you talk about a property's value to an owner?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'jt-concern-1',
            category: 'Concern Probe — Phone-First Role',
            question: "This role is almost entirely phone-based — there's no in-person or open-house component. How do you feel about a role where the entire relationship, start to finish, happens over the phone, compared to the in-person work you've done as a broker?",
            notes: 'Flagged concern: Phone outreach is not her clear primary strength. Probe for genuine comfort with a fully phone-based relationship model.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'jt-align-1',
            category: 'Role Alignment',
            question: "Given your property management experience at the high-rise, what do you think homeowners considering a management partnership are most anxious about, and how would you address that on a first call?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'jt-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'jt-close-1',
            category: 'Closing',
            question: "What questions do you have about the role, the properties, or how TRAVLR's homeowner program actually works?",
          },
        ],
      },
    ],
  },

  // ─── Candidate: Darlene Ciao ─────────────────────────────────────────────────
  candidate_darlene_ciao: {
    roleId: 'candidate_darlene_ciao',
    roleTitle: 'Darlene Ciao — Outreach & BD Agent',
    shortTitle: 'Darlene Ciao',
    description: 'Solid mid-tier fit: phone-based consultative sales (legal services, timeshare inside sales), client outreach/retention, heavy CRM use. Flagged: not luxury real estate or STR-specific.',
    totalDuration: '30–45 min',
    sections: [
      {
        id: 'opening',
        title: 'Opening',
        duration: '3 min',
        questions: [
          {
            id: 'dc-open-1',
            category: 'Opening',
            question: "Hi Darlene, thanks for joining. Your background is consistently phone-based consultative selling across a few different industries, which tells me you're comfortable adapting your pitch — that's valuable here. I want to talk through how you'd apply that specifically to luxury vacation property owners.",
          },
        ],
      },
      {
        id: 'background_probe',
        title: 'Background Probe',
        duration: '8 min',
        questions: [
          {
            id: 'dc-bg-a',
            category: 'Background Probe — Option A',
            question: "Tell me about your timeshare inside sales experience — what did closing look like in that role, and how did you handle hesitant prospects?",
          },
          {
            id: 'dc-bg-b',
            category: 'Background Probe — Option B',
            question: "Across legal services and timeshare, what's stayed consistent in your approach to a consultative sales call, regardless of industry?",
          },
        ],
      },
      {
        id: 'concern_probe',
        title: 'Concern Probe',
        duration: '5 min',
        questions: [
          {
            id: 'dc-concern-1',
            category: 'Concern Probe — Luxury / STR Subject Matter',
            question: "This role involves speaking with owners of multi-million dollar properties about a fairly specialized topic — luxury property management and concierge services. How would you go about getting up to speed quickly on that subject matter, given it's new territory for you?",
            notes: 'Flagged concern: Good phone skills and relationship management, but not luxury real estate or STR-specific. Assess ramp-up plan and intellectual curiosity.',
          },
        ],
      },
      {
        id: 'role_alignment',
        title: 'Role Alignment',
        duration: '5 min',
        questions: [
          {
            id: 'dc-align-1',
            category: 'Role Alignment',
            question: "Given your retention and account management background, how do you think about the second or third conversation with a lead who isn't ready to decide yet — what's your approach to following up without being pushy?",
          },
        ],
      },
      {
        id: 'compensation',
        title: 'Compensation Walkthrough',
        duration: '5 min',
        questions: [
          {
            id: 'dc-comp-1',
            category: 'Compensation',
            question: SHARED_COMPENSATION_LANGUAGE,
            notes: 'Walk through the signing bonus ($750–$1,000 per homeowner) and the 2% override on management fee revenue for 12 months. Emphasize uncapped earnings and warm pre-qualified leads.',
          },
        ],
      },
      {
        id: 'closing',
        title: 'Closing',
        duration: '5 min',
        questions: [
          {
            id: 'dc-close-1',
            category: 'Closing',
            question: "What would you want to know about TRAVLR, the properties we manage, or how this role actually works day to day?",
          },
        ],
      },
    ],
  },
};

export function getInterviewScript(roleId: string): InterviewScript | null {
  if (!roleId) return null;
  return INTERVIEW_SCRIPTS[roleId] || null;
}

export function buildInterviewScriptText(script: InterviewScript): string {
  const lines: string[] = [
    `INTERVIEW SCRIPT: ${script.roleTitle}`,
    `Duration: ${script.totalDuration}`,
    '',
  ];
  for (const section of script.sections) {
    lines.push(`=== ${section.title.toUpperCase()} (${section.duration}) ===`);
    for (const q of section.questions) {
      lines.push(`[${q.category}] ${q.question}`);
      if (q.followUps?.length) {
        lines.push(`  Follow-ups: ${q.followUps.join(' | ')}`);
      }
      if (q.notes) {
        lines.push(`  Note: ${q.notes}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
