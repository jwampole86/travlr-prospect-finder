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
  { value: 'homeowner_outreach_agent', label: 'Homeowner Outreach Agent', description: 'Front-line outreach to prospective homeowner partners' },
  { value: 'guest_experience_manager', label: 'Guest Experience Manager', description: 'Manages guest satisfaction and experience across properties' },
  { value: 'homeowner_success_manager', label: 'Homeowner Success Manager', description: 'Manages ongoing homeowner relationships and retention' },
  { value: 'head_of_property_operations', label: 'Head of Property Operations', description: 'Oversees all property operations, maintenance, and logistics' },
  { value: 'property_coordinator', label: 'Property Coordinator', description: 'Coordinates day-to-day property management tasks' },
  { value: 'revenue_manager', label: 'Revenue Manager', description: 'Manages pricing strategy and revenue optimization' },
];

export const INTERVIEW_SCRIPTS: Record<string, InterviewScript> = {
  homeowner_outreach_agent: {
    roleId: 'homeowner_outreach_agent',
    roleTitle: 'Homeowner Outreach Agent',
    shortTitle: 'Outreach Agent',
    description: 'Front-line outreach to prospective homeowner partners',
    totalDuration: '45–60 min',
    sections: [
      {
        id: 'intro', title: 'Introduction & Overview', duration: '5 min',
        questions: [
          { id: 'intro-1', category: 'Opening', question: "Thanks for joining today — I'm Jen, and I lead the team here at TRAVLR. Can you start by walking me through your background and what drew you to this role?", followUps: ['What specifically about TRAVLR caught your attention?', 'How did you hear about us?'] },
          { id: 'intro-2', category: 'Opening', question: 'What does a typical day look like for you in your current or most recent role?' },
        ],
      },
      {
        id: 'outreach-skills', title: 'Outreach & Communication Skills', duration: '15 min',
        questions: [
          { id: 'out-1', category: 'Cold Outreach', question: 'Walk me through how you approach a cold outreach campaign from scratch — how do you build your list, craft your message, and track results.', followUps: ['What open rates or response rates have you achieved?', 'How do you personalize at scale?'] },
          { id: 'out-2', category: 'Objection Handling', question: 'Tell me about a time a prospect pushed back hard on your pitch. What was the objection and how did you handle it?', followUps: ['Did you ultimately convert them?', 'What would you do differently now?'] },
          { id: 'out-3', category: 'Phone Skills', question: "How comfortable are you with high-volume phone outreach? Describe your approach to a cold call to a homeowner who has never heard of TRAVLR.", notes: 'Look for: confidence, warmth, ability to handle rejection, natural conversational style' },
          { id: 'out-4', category: 'Follow-Up', question: "How do you manage follow-up cadence without being annoying? What's your rule of thumb for when to persist vs. move on?" },
        ],
      },
      {
        id: 'real-estate', title: 'Real Estate & STR Knowledge', duration: '10 min',
        questions: [
          { id: 're-1', category: 'Industry Knowledge', question: "What do you know about the short-term rental market and how it differs from traditional long-term rentals from a homeowner's perspective?" },
          { id: 're-2', category: 'Value Proposition', question: 'If a homeowner asked you "Why should I partner with TRAVLR instead of just listing on Airbnb myself?" — what would you say?', notes: 'Look for: understanding of management value, revenue optimization, guest experience, hands-off ownership' },
          { id: 're-3', category: 'Market Awareness', question: 'Are you familiar with any STR regulations or compliance requirements in markets like Colorado, Maryland, or Florida?' },
        ],
      },
      {
        id: 'tools-process', title: 'Tools & Process', duration: '5 min',
        questions: [
          { id: 'tools-1', category: 'CRM & Tools', question: 'What CRM or outreach tools have you used? How do you stay organized when managing hundreds of leads?' },
          { id: 'tools-2', category: 'Metrics', question: 'How do you measure your own performance? What KPIs do you track and how do you hold yourself accountable?' },
        ],
      },
      {
        id: 'culture-fit', title: 'Culture & Fit', duration: '10 min',
        questions: [
          { id: 'culture-1', category: 'Work Style', question: 'This is a fast-moving startup environment. How do you handle ambiguity or shifting priorities?' },
          { id: 'culture-2', category: 'Motivation', question: 'What motivates you most in a sales or outreach role — the hunt, the close, the relationship, or the numbers?' },
          { id: 'culture-3', category: 'Remote Work', question: 'This role is remote. How do you stay productive and connected when working independently?' },
        ],
      },
      {
        id: 'close', title: 'Closing Questions', duration: '5 min',
        questions: [
          { id: 'close-1', category: 'Candidate Questions', question: 'What questions do you have for me about the role, the team, or TRAVLR?' },
          { id: 'close-2', category: 'Next Steps', question: "We're moving quickly on this. What does your timeline look like and when could you start if things move forward?" },
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
        id: 'intro', title: 'Introduction', duration: '5 min',
        questions: [
          { id: 'intro-1', category: 'Opening', question: "Thanks for being here — I'm Jen. Tell me about yourself and what brought you to hospitality or guest experience work." },
          { id: 'intro-2', category: 'Opening', question: 'What does exceptional guest experience mean to you in the context of short-term rentals?' },
        ],
      },
      {
        id: 'guest-skills', title: 'Guest Experience Skills', duration: '15 min',
        questions: [
          { id: 'guest-1', category: 'Problem Resolution', question: "Tell me about a time a guest had a serious complaint or emergency during their stay. How did you handle it?", followUps: ['What was the outcome?', 'What would you do differently?'] },
          { id: 'guest-2', category: 'Communication', question: 'How do you balance being responsive to guests while also setting appropriate boundaries and expectations?' },
          { id: 'guest-3', category: 'Reviews', question: "How do you proactively drive 5-star reviews? What's your strategy for turning a neutral guest into a raving fan?" },
          { id: 'guest-4', category: 'Difficult Guests', question: 'Describe a situation where a guest was being unreasonable or making demands outside your policies. How did you handle it?', notes: 'Look for: empathy, firmness, policy knowledge, de-escalation skills' },
        ],
      },
      {
        id: 'operations', title: 'Operations & Coordination', duration: '10 min',
        questions: [
          { id: 'ops-1', category: 'Turnover Management', question: 'How have you managed property turnovers at scale? What systems or processes did you put in place?' },
          { id: 'ops-2', category: 'Vendor Management', question: 'How do you manage cleaning crews, maintenance vendors, and other service providers to ensure quality and reliability?' },
          { id: 'ops-3', category: 'Multi-Property', question: 'Have you managed multiple properties simultaneously? How many, and how did you stay on top of everything?' },
        ],
      },
      {
        id: 'tools', title: 'Tools & Technology', duration: '5 min',
        questions: [
          { id: 'tools-1', category: 'PMS & Tools', question: 'What property management systems or guest communication tools have you used? (Guesty, Hostaway, Lodgify, etc.)' },
          { id: 'tools-2', category: 'Automation', question: 'How have you used automation to improve guest communication or operational efficiency?' },
        ],
      },
      {
        id: 'culture-fit', title: 'Culture & Fit', duration: '10 min',
        questions: [
          { id: 'culture-1', category: 'Pace', question: 'Guest experience can be 24/7 in nature. How do you manage your own time and energy while staying responsive?' },
          { id: 'culture-2', category: 'Ownership', question: 'Tell me about a time you identified a gap in the guest experience and took initiative to fix it without being asked.' },
        ],
      },
      {
        id: 'close', title: 'Closing', duration: '5 min',
        questions: [
          { id: 'close-1', category: 'Candidate Questions', question: 'What questions do you have for me about TRAVLR or this role?' },
          { id: 'close-2', category: 'Next Steps', question: "What's your availability and timeline if we move forward?" },
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
        id: 'intro', title: 'Introduction', duration: '5 min',
        questions: [
          { id: 'intro-1', category: 'Opening', question: "Hi, I'm Jen — thanks for joining. Walk me through your background in account management or customer success." },
          { id: 'intro-2', category: 'Opening', question: 'What does "homeowner success" mean to you in the context of a property management company?' },
        ],
      },
      {
        id: 'relationship', title: 'Relationship Management', duration: '15 min',
        questions: [
          { id: 'rel-1', category: 'Retention', question: 'Tell me about a time you saved a client relationship that was at risk of churning. What was the situation and what did you do?', followUps: ['What was the root cause of their dissatisfaction?', 'What did you learn from it?'] },
          { id: 'rel-2', category: 'Proactive Communication', question: 'How do you proactively communicate with clients to prevent problems before they escalate?' },
          { id: 'rel-3', category: 'Difficult Conversations', question: 'Describe a time you had to deliver bad news to a client — like lower-than-expected revenue or a property issue. How did you handle it?', notes: 'Look for: transparency, empathy, solution-orientation, ownership' },
          { id: 'rel-4', category: 'Upsell / Expansion', question: 'Have you ever identified opportunities to expand a client relationship or add services? How did you approach it?' },
        ],
      },
      {
        id: 'real-estate', title: 'Real Estate & STR Knowledge', duration: '10 min',
        questions: [
          { id: 're-1', category: 'Revenue', question: 'How comfortable are you discussing revenue performance, occupancy rates, and ADR with homeowners who may not be familiar with STR metrics?' },
          { id: 're-2', category: 'Property Knowledge', question: "What do you know about the factors that drive STR performance — location, seasonality, pricing strategy, listing quality?" },
          { id: 're-3', category: 'Compliance', question: "Are you familiar with STR regulations and how they might affect a homeowner's ability to rent their property?" },
        ],
      },
      {
        id: 'tools', title: 'Tools & Process', duration: '5 min',
        questions: [
          { id: 'tools-1', category: 'CRM', question: 'What CRM or customer success tools have you used? How do you track the health of your accounts?' },
          { id: 'tools-2', category: 'Reporting', question: "How do you create and present performance reports to clients in a way that's clear and builds confidence?" },
        ],
      },
      {
        id: 'culture-fit', title: 'Culture & Fit', duration: '10 min',
        questions: [
          { id: 'culture-1', category: 'Ownership', question: 'This role requires a high degree of ownership. Tell me about a time you went above and beyond for a client without being asked.' },
          { id: 'culture-2', category: 'Startup Mindset', question: "We're building processes as we go. How do you handle working in an environment where not everything is defined yet?" },
        ],
      },
      {
        id: 'close', title: 'Closing', duration: '5 min',
        questions: [
          { id: 'close-1', category: 'Candidate Questions', question: 'What questions do you have for me about the role or TRAVLR?' },
          { id: 'close-2', category: 'Next Steps', question: "What's your timeline and when could you start if things move forward?" },
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
        id: 'intro', title: 'Introduction', duration: '5 min',
        questions: [
          { id: 'intro-1', category: 'Opening', question: "Thanks for joining — I'm Jen. Walk me through your background in property operations or hospitality management." },
          { id: 'intro-2', category: 'Opening', question: "What's the largest portfolio or team you've managed, and what were your key responsibilities?" },
        ],
      },
      {
        id: 'operations', title: 'Operations Leadership', duration: '20 min',
        questions: [
          { id: 'ops-1', category: 'Scale', question: 'How have you built or scaled an operations function from scratch? What were the first systems you put in place?', followUps: ['What broke first as you scaled?', 'How did you fix it?'] },
          { id: 'ops-2', category: 'Vendor Management', question: 'How do you build and manage a reliable vendor network for cleaning, maintenance, and emergency services across multiple markets?' },
          { id: 'ops-3', category: 'Quality Control', question: 'What quality control systems have you implemented to ensure consistent property standards across a large portfolio?', notes: 'Look for: checklists, inspection processes, photo verification, scoring systems' },
          { id: 'ops-4', category: 'Crisis Management', question: "Tell me about a major operational crisis you've managed — a property emergency, a vendor failure, or a guest incident. How did you handle it?" },
          { id: 'ops-5', category: 'Cost Management', question: 'How do you balance operational quality with cost efficiency? Give me an example of a cost-saving initiative you led.' },
        ],
      },
      {
        id: 'team', title: 'Team & Leadership', duration: '10 min',
        questions: [
          { id: 'team-1', category: 'Team Building', question: 'How have you built and developed an operations team? What do you look for when hiring?' },
          { id: 'team-2', category: 'Performance Management', question: 'How do you hold your team accountable to performance standards while keeping morale high?' },
          { id: 'team-3', category: 'Cross-Functional', question: 'How do you work with guest experience, homeowner success, and revenue teams to ensure operations supports the broader business?' },
        ],
      },
      {
        id: 'technology', title: 'Technology & Systems', duration: '10 min',
        questions: [
          { id: 'tech-1', category: 'PMS & Tools', question: 'What property management systems, operations tools, or automation platforms have you implemented or used at scale?' },
          { id: 'tech-2', category: 'Data & Reporting', question: 'How do you use data to drive operational decisions? What metrics do you track and report on?' },
        ],
      },
      {
        id: 'strategy', title: 'Strategy & Vision', duration: '10 min',
        questions: [
          { id: 'strat-1', category: 'Vision', question: 'If you joined TRAVLR as Head of Property Operations, what would your first 90 days look like?' },
          { id: 'strat-2', category: 'Growth', question: 'What do you see as the biggest operational challenges for a fast-growing STR company expanding into new markets?' },
        ],
      },
      {
        id: 'close', title: 'Closing', duration: '5 min',
        questions: [
          { id: 'close-1', category: 'Candidate Questions', question: 'What questions do you have for me about TRAVLR, the team, or this role?' },
          { id: 'close-2', category: 'Next Steps', question: "What's your timeline and compensation expectations if we move forward?" },
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
        id: 'intro', title: 'Introduction', duration: '5 min',
        questions: [
          { id: 'intro-1', category: 'Opening', question: "Hi, I'm Jen — thanks for joining. Tell me about your background and what drew you to property coordination or management." },
        ],
      },
      {
        id: 'coordination', title: 'Coordination Skills', duration: '15 min',
        questions: [
          { id: 'coord-1', category: 'Organization', question: 'How do you manage multiple competing priorities and deadlines? Walk me through your organizational system.' },
          { id: 'coord-2', category: 'Vendor Coordination', question: 'Tell me about a time you had to coordinate multiple vendors for a property — cleaning, maintenance, inspection. How did you keep everything on track?' },
          { id: 'coord-3', category: 'Problem Solving', question: 'Describe a time something went wrong with a property and you had to solve it quickly. What happened and what did you do?' },
        ],
      },
      {
        id: 'communication', title: 'Communication', duration: '10 min',
        questions: [
          { id: 'comm-1', category: 'Stakeholder Communication', question: 'How do you communicate with homeowners, guests, and vendors simultaneously without things falling through the cracks?' },
          { id: 'comm-2', category: 'Written Communication', question: "How comfortable are you with written communication — emails, messages, reports? Can you give me an example of a message you'd send to a homeowner about a maintenance issue?" },
        ],
      },
      {
        id: 'tools', title: 'Tools & Tech', duration: '5 min',
        questions: [
          { id: 'tools-1', category: 'Tools', question: 'What tools or software have you used for property management, scheduling, or communication?' },
        ],
      },
      {
        id: 'close', title: 'Closing', duration: '10 min',
        questions: [
          { id: 'culture-1', category: 'Culture', question: 'What kind of work environment do you thrive in? How do you handle fast-paced, sometimes unpredictable days?' },
          { id: 'close-1', category: 'Candidate Questions', question: 'What questions do you have for me about TRAVLR or this role?' },
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
        id: 'intro', title: 'Introduction', duration: '5 min',
        questions: [
          { id: 'intro-1', category: 'Opening', question: "Hi, I'm Jen — thanks for joining. Walk me through your background in revenue management or pricing strategy." },
          { id: 'intro-2', category: 'Opening', question: 'What drew you to revenue management specifically, and what do you find most interesting about it?' },
        ],
      },
      {
        id: 'revenue-skills', title: 'Revenue Management Skills', duration: '20 min',
        questions: [
          { id: 'rev-1', category: 'Pricing Strategy', question: 'Walk me through your approach to dynamic pricing for short-term rentals. What factors do you consider and how do you balance occupancy vs. ADR?', notes: 'Look for: seasonality, events, comp set analysis, demand forecasting, minimum stays' },
          { id: 'rev-2', category: 'Tools', question: 'What revenue management or dynamic pricing tools have you used? (PriceLabs, Beyond, Wheelhouse, etc.) What are their strengths and limitations?' },
          { id: 'rev-3', category: 'Performance', question: 'Tell me about a pricing change or strategy you implemented that significantly improved revenue performance. What was the impact?' },
          { id: 'rev-4', category: 'Market Analysis', question: 'How do you analyze a new market to set initial pricing? What data sources do you use?' },
        ],
      },
      {
        id: 'analytics', title: 'Analytics & Reporting', duration: '10 min',
        questions: [
          { id: 'analytics-1', category: 'Metrics', question: 'What KPIs do you track to measure revenue performance? How do you report on them to stakeholders?' },
          { id: 'analytics-2', category: 'Data', question: 'How comfortable are you with data analysis? What tools do you use — Excel, SQL, BI tools?' },
        ],
      },
      {
        id: 'collaboration', title: 'Collaboration', duration: '10 min',
        questions: [
          { id: 'collab-1', category: 'Cross-Functional', question: "How do you work with operations and guest experience teams to ensure pricing decisions don't create operational problems?" },
          { id: 'collab-2', category: 'Homeowner Communication', question: 'How would you explain a pricing recommendation to a homeowner who is unhappy with their revenue performance?' },
        ],
      },
      {
        id: 'close', title: 'Closing', duration: '5 min',
        questions: [
          { id: 'close-1', category: 'Candidate Questions', question: 'What questions do you have for me about TRAVLR or this role?' },
          { id: 'close-2', category: 'Next Steps', question: "What's your timeline and when could you start if things move forward?" },
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