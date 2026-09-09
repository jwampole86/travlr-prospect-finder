import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { OUTREACH_BIZDEV_JOB_DESCRIPTION } from '@/lib/roles/outreachBizDevRole';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TARGET_ROLE = OUTREACH_BIZDEV_JOB_DESCRIPTION;

const CORE_COMPETENCIES = [
  'Vacation Rental Knowledge', 'Property Management Knowledge', 'Luxury Homeowner Communication',
  'Warm-Lead Phone Communication', 'Consultative Sales', 'Discovery / Questioning', 'Objection Handling',
  'Closing Ability', 'Follow-Up Discipline', 'CRM / Pipeline Management', 'Relationship Building',
  'Professional Communication', 'Self-Motivation', 'Remote Work Discipline', 'Coachability',
  'Operational Understanding', 'Business Development', 'Judgment', 'Organization', 'Culture / Role Fit',
];

const TRAVLR_COMPANY_POSITIONING = `TRAVLR Vacation Homes has spent the past 10 years as a premier partner for homeowners of ultra-luxury properties in California, managing multi-million-dollar vacation homes with high-touch care. The California desert portfolio has shown that TRAVLR can protect and elevate property value while producing substantial passive income for owners. TRAVLR is now bringing that approach to Aspen, Vail, Las Vegas, Miami, and Seattle. The operating model combines full-service property management, 5-star guest hospitality, dynamic revenue optimization, smart-home technology, compliance and permit support, robust marketing, weekly inspections, and transparent owner-portal reporting.`;

// ─── Candidate-specific resume intelligence (source of truth from actual resumes) ───

const CANDIDATE_RESUME_INTELLIGENCE: Record<string, {
  resumeSummary: string;
  keyExperiences: string[];
  specificSystems: string[];
  measurableAchievements: string[];
  personalizedDeepDiveAreas: string[];
  personalizedDeepDiveRationale: string;
  primaryConcern: string;
  concernProbeAreas: string[];
}> = {
  'karissa crooks': {
    resumeSummary: `Karissa Crooks has 10+ years of direct vacation rental and property management experience across multiple companies. 
    At ESVR Vacation Rentals (Nov 2020–Aug 2023) as AGM/Property Manager: managed owner leads in Vintory CRM, handled STR license applications with Talbot and Dorchester County, onboarded new properties working with Owner Relations and Marketing, set occupancy revenue goals by property, adjusted pricing, determined minimum stays, provided owner performance reports, listed homes on Airbnb/Vrbo/Track.
    At Jack Lingo Realtor (Mar 2018–Mar 2020): managed vacation rental homes in Delaware beach area, managed all new listings on Airbnb, handled lease agreements, pricing on multiple websites.
    At Keller Williams Realty (Apr 2017–Mar 2018): managed STR operations, acquired signed leases, listed and priced new properties, met with new homeowners to present listing homes for rent.
    At Seascape Property Management (Mar 2013–Apr 2017): AGM for two clubhouse properties, toured clubhouse with potential buyers, registered guests and owners.
    Currently at Brookfield Residential (Aug 2023–present) as New Home Sales Manager: sells new construction homes, builds relationships with realtors and local businesses, follows up with prospective buyers daily/weekly/monthly, provides sales presentations including community tours.
    Systems: Salesforce, Vintory, Track, StayNTouch, Breezeway, Barefoot, Signal, Beyond Pricing, Key Data, DocuSign, Newstar Sales, QuickBooks.`,
    keyExperiences: [
      'Owner lead management in Vintory CRM at ESVR Vacation Rentals',
      'STR licensing process with Talbot and Dorchester County',
      'Property onboarding working with Owner Relations and Marketing teams',
      'Revenue management: setting occupancy goals, adjusting pricing, minimum stays, owner performance reports',
      'Listing homes on Airbnb, Vrbo, and Track CRM',
      'Meeting with new homeowners to present listing homes for rent (Keller Williams)',
      'New home sales with daily/weekly/monthly follow-up discipline (Brookfield Residential)',
      'Lease acquisition and property management across Delaware beach markets',
    ],
    specificSystems: ['Vintory', 'Track CRM', 'Salesforce', 'Beyond Pricing', 'Key Data', 'Breezeway', 'Barefoot', 'StayNTouch', 'Signal', 'DocuSign'],
    measurableAchievements: [
      'No specific revenue or portfolio size metrics stated in resume — validate during interview',
      'Managed multiple properties across Airbnb, Vrbo, Track simultaneously',
      'Supervised guest relations and reservations team at ESVR',
    ],
    personalizedDeepDiveAreas: [
      'Vintory CRM and owner lead pipeline management',
      'STR licensing process — how she navigated county-level regulations',
      'Property onboarding — what her personal role was from first owner conversation to signed agreement',
      'Revenue management — how she set pricing, minimum stays, and communicated performance to owners',
      'Homeowner presentations at Keller Williams — what her pitch looked like',
      'Transition from operations/management to outbound prospecting at Brookfield',
    ],
    personalizedDeepDiveRationale: `Karissa's resume documents deep STR operations, owner lead management via Vintory, STR licensing, property onboarding, and revenue management. 
    The personalized 30% should go deep on these specifics — not ask whether she has the experience (she clearly does), but probe the depth, ownership, and metrics behind each claim. 
    The key concern is whether she can sustain high-volume outbound prospecting, since her background is more operations/management than pure outbound BD.`,
    primaryConcern: 'Validate comfort with sustained high-volume outbound prospecting — her background is operations-heavy and new-home sales, not pure outbound homeowner acquisition at scale',
    concernProbeAreas: [
      'Daily outbound call volume in current and past roles',
      'How she personally generated new owner leads vs. received inbound/referral leads',
      'Comfort with cold outreach to homeowners who did not request contact',
      'Pipeline metrics — how many owner conversations did she personally initiate per week',
    ],
  },
  'margo johnson': {
    resumeSummary: `Margo Johnson is a high-volume outbound business development specialist with documented 300+ cold calls/day experience.
    At Heavy Hammer/Qazzoo.com (via Squeaky Ventures): placed 300+ outbound cold calls per day to introduce a SaaS marketing platform to real estate businesses and professionals, qualified leads, ran product demos, partnered with Senior AEs to close 6+ deals per week, consistently ranked in top 3 BDRs, which led to training and mentoring new hires.
    At Bespoke Cyber/RedAccess.io (via Squeaky Ventures): first BD hire at a startup, created messaging strategies, executed multi-channel cold outreach, built and managed a qualified pipeline exceeding $300K in the first 90 days, introductions to C-level executives.
    At Investor/Entrepreneur client (via Squeaky Ventures): managed full-cycle B2B sales (prospecting, pipeline management, closing), achieved 3x increase in account volume within six months, secured direct sales and a distributor partnership.
    At MPB (via Squeaky Ventures): Senior Account Manager for first dedicated outbound growth effort, developed scalable segment-specific frameworks and outbound messaging, coordinated with Seller Experience and Marketing teams.
    At Wall Street Webcasting: managed 20+ investment bank accounts, maintained 100% account retention, secured enterprise partnership contributing to 10% monthly sales lift, promoted to Conference Director within first year, led recruitment and training of 30+ client-facing consultants per quarter.
    Founded Umbrelli: developed inside sales process that secured Neiman Marcus as first client, PR strategy led to NYT and Vogue Japan mentions within first year.
    Systems: HubSpot, Salesforce, VanillaSoft, Pipedrive, ZoomInfo, Jira, Monday, Microsoft Office, Google Workspace, Adobe Creative Suite.
    Certifications: PMP, Google Cybersecurity Professional Certificate, Palo Alto Networks Cloud Security Fundamentals, Kennesaw State cybersecurity management certificate.`,
    keyExperiences: [
      '300+ outbound cold calls per day at Heavy Hammer/Qazzoo (real estate SaaS)',
      '6+ deals closed per week at Heavy Hammer/Qazzoo',
      'Consistently ranked top 3 BDR — led to training and mentoring new hires',
      '$300K+ qualified pipeline built in first 90 days at Bespoke Cyber',
      '3x account volume increase within 6 months for investor/consumer goods client',
      '100% account retention at Wall Street Webcasting across 20+ investment bank accounts',
      'Promoted to Conference Director within first year at Wall Street Webcasting',
      'Full-cycle B2B sales: prospecting, pipeline management, closing',
      'Secured Neiman Marcus as first client for Umbrelli through inside sales process',
    ],
    specificSystems: ['HubSpot', 'Salesforce', 'VanillaSoft', 'Pipedrive', 'ZoomInfo'],
    measurableAchievements: [
      '300+ outbound cold calls per day (Heavy Hammer/Qazzoo)',
      '6+ deals closed per week (Heavy Hammer/Qazzoo)',
      '$300K+ pipeline in 90 days (Bespoke Cyber)',
      '3x account volume in 6 months (investor client)',
      '100% account retention (Wall Street Webcasting)',
      '10% monthly sales lift from enterprise partnership (Wall Street Webcasting)',
      'Top 3 BDR ranking (Heavy Hammer/Qazzoo)',
    ],
    personalizedDeepDiveAreas: [
      'The 300+ calls/day environment — how she structured her day, maintained quality at volume',
      'Real estate SaaS prospecting at Qazzoo — what the pitch was, how she qualified real estate professionals',
      'Full-cycle B2B pipeline at Bespoke Cyber — from cold outreach to C-level close',
      'Account management and retention at Wall Street Webcasting — relationship-based selling',
      'Transition from B2B SaaS/tech to luxury homeowner relationship selling',
      'How she would establish credibility with a luxury homeowner given limited direct STR experience',
    ],
    personalizedDeepDiveRationale: `Margo's resume documents exceptional outbound volume, full-cycle B2B sales, and real estate industry exposure — but in a SaaS/tech context, not luxury homeowner/STR management. 
    The personalized 30% should go in a completely different direction from Karissa: probe the mechanics of her high-volume outbound operation, her real estate SaaS experience, and specifically test her ability to translate pure sales skill into the relationship-based, luxury homeowner context TRAVLR requires. 
    Do NOT ask whether she can make calls — she clearly can. Ask how she would adapt her approach.`,
    primaryConcern: 'Less luxury vacation-rental and homeowner-specific experience — validate ability to establish credibility with high-value homeowners and learn the STR/property management value proposition',
    concernProbeAreas: [
      'How she would approach a luxury homeowner differently than a real estate business owner',
      'What she knows about vacation rental management and how she would learn the industry quickly',
      'Whether her high-volume approach can adapt to the longer, relationship-based sales cycle of homeowner acquisition',
      'How she would handle a homeowner who asks detailed questions about property management she cannot yet answer',
    ],
  },
};

function getCandidateIntelligence(fullName: string) {
  const normalized = fullName.toLowerCase().trim();
  return CANDIDATE_RESUME_INTELLIGENCE[normalized] || null;
}

function buildCandidateProfile(candidate: Record<string, unknown>): string {
  const workExp = Array.isArray(candidate.work_experience) ? candidate.work_experience : [];
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const strengths = Array.isArray(candidate.strengths) ? candidate.strengths : [];
  const concerns = Array.isArray(candidate.concerns) ? candidate.concerns : [];
  const classifications = Array.isArray(candidate.experience_classifications) ? candidate.experience_classifications : [];

  const fullName = String(candidate.full_name || '');
  const intelligence = getCandidateIntelligence(fullName);

  const workExpText = workExp.map((job: Record<string, unknown>) =>
    `- ${job.title || 'Role'} at ${job.company || 'Company'} (${job.startDate || '?'} - ${job.endDate || 'Present'})
   Responsibilities: ${Array.isArray(job.responsibilities) ? job.responsibilities.join('; ') : job.responsibilities || 'Not specified'}
   Achievements: ${Array.isArray(job.achievements) ? job.achievements.join('; ') : job.achievements || 'Not specified'}`
  ).join('\n');

  const classText = classifications.map((c: Record<string, unknown>) =>
    `${c.category}: ${c.strength} - ${Array.isArray(c.evidence) ? c.evidence.map((e: Record<string, unknown>) => e.resumeEvidence).join('; ') : 'See resume'}`
  ).join('\n');

  let intelligenceSection = '';
  if (intelligence) {
    intelligenceSection = `
=== VERIFIED RESUME INTELLIGENCE (USE THIS AS PRIMARY SOURCE) ===
${intelligence.resumeSummary}

KEY EXPERIENCES TO PROBE DEEPLY:
${intelligence.keyExperiences.map(e => `• ${e}`).join('\n')}

SPECIFIC SYSTEMS DOCUMENTED IN RESUME:
${intelligence.specificSystems.join(', ')}

MEASURABLE ACHIEVEMENTS FROM RESUME:
${intelligence.measurableAchievements.map(a => `• ${a}`).join('\n')}

PERSONALIZED DEEP DIVE AREAS (for the 30% candidate-specific questions):
${intelligence.personalizedDeepDiveAreas.map(a => `• ${a}`).join('\n')}

PERSONALIZATION RATIONALE:
${intelligence.personalizedDeepDiveRationale}

PRIMARY CONCERN TO VALIDATE:
${intelligence.primaryConcern}

CONCERN PROBE AREAS:
${intelligence.concernProbeAreas.map(a => `• ${a}`).join('\n')}
=== END VERIFIED RESUME INTELLIGENCE ===
`;
  }

  return `
CANDIDATE: ${fullName}
TARGET ROLE: ${TARGET_ROLE}

PROFESSIONAL SUMMARY:
${candidate.professional_summary || candidate.seed_fit_notes || 'Not yet parsed from resume'}

CURRENT/MOST RECENT ROLE: ${candidate.current_title || 'Not specified'} at ${candidate.current_company || 'Not specified'}

RELEVANT WORK EXPERIENCE:
${workExpText || (candidate.resume_raw_text ? 'See raw resume text below' : 'Not yet extracted')}

EXPERIENCE CLASSIFICATIONS:
${classText || 'Not yet classified'}

KEY SKILLS: ${Array.isArray(skills) ? skills.join(', ') : skills || 'Not specified'}

VACATION RENTAL EXPERIENCE: ${candidate.vacation_rental_experience ? 'YES' : 'NO/UNKNOWN'}
PROPERTY MANAGEMENT: ${candidate.property_management_experience ? 'YES' : 'NO/UNKNOWN'}
LUXURY EXPERIENCE: ${candidate.luxury_experience ? 'YES' : 'NO/UNKNOWN'}
HOMEOWNER-FACING: ${candidate.homeowner_facing_experience ? 'YES' : 'NO/UNKNOWN'}
OUTBOUND CALLING: ${candidate.outbound_calling_experience ? 'YES' : 'NO/UNKNOWN'}
CLOSING EXPERIENCE: ${candidate.closing_experience ? 'YES' : 'NO/UNKNOWN'}
CRM EXPERIENCE: ${candidate.crm_experience ? 'YES' : 'NO/UNKNOWN'}
LEADERSHIP: ${candidate.leadership_experience ? 'YES' : 'NO/UNKNOWN'}
OPERATIONS: ${candidate.operations_experience ? 'YES' : 'NO/UNKNOWN'}

YEARS TOTAL EXPERIENCE: ${candidate.years_total_experience || 'Not specified'}
YEARS SALES: ${candidate.years_sales_experience || 'Not specified'}
YEARS VACATION RENTAL: ${candidate.years_vacation_rental_experience || 'Not specified'}
YEARS PROPERTY MANAGEMENT: ${candidate.years_property_management_experience || 'Not specified'}

STRENGTHS (from seed/analysis):
${Array.isArray(strengths) ? strengths.join('\n') : candidate.seed_fit_notes || 'Not yet analyzed'}

POTENTIAL CONCERNS:
${Array.isArray(concerns) ? concerns.join('\n') : candidate.seed_concerns || 'Not yet analyzed'}

RESUME HIGHLIGHTS:
${Array.isArray(candidate.resume_highlights) ? (candidate.resume_highlights as string[]).join('\n') : 'Not yet extracted'}

${intelligenceSection}

${candidate.resume_raw_text ? `RAW RESUME TEXT (first 3000 chars):\n${String(candidate.resume_raw_text).slice(0, 3000)}` : ''}
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateId, forceRegenerate } = await req.json() as { candidateId: string; forceRegenerate?: boolean };

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId required' }, { status: 400 });
    }

    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Return cached script if available and not forcing regeneration
    if (candidate.interview_script && !forceRegenerate) {
      return NextResponse.json({
        script: candidate.interview_script,
        cached: true,
        generatedAt: candidate.script_generated_at,
      });
    }

    const candidateProfile = buildCandidateProfile(candidate as Record<string, unknown>);
    const fullName = String(candidate.full_name || '');
    const intelligence = getCandidateIntelligence(fullName);

    const systemPrompt = `You are an expert interview coach for TRAVLR Vacation Homes, a boutique luxury vacation-rental brand.
You generate highly personalized, evidence-based interview teleprompter scripts for the following role:

${TARGET_ROLE}

TRAVLR COMPANY POSITIONING FOR INTERVIEW CONTEXT:
${TRAVLR_COMPANY_POSITIONING}

CRITICAL RULES:
1. Use ONLY information from the candidate's actual resume/profile. NEVER fabricate employers, metrics, or experience.
2. If something is not stated, use "Not specified" or "Needs validation during interview".
3. STRUCTURE: Exactly 70% STANDARD TRAVLR questions (isCore: true, same for all candidates) and 30% CANDIDATE-SPECIFIC questions (isCore: false, based on actual resume evidence).
4. Do NOT infer protected characteristics (age, race, gender, religion, disability, etc.).
5. Do NOT use resume photos for any evaluation.
6. Return ONLY valid JSON matching the schema below.
7. Personalization must NOT eliminate comparability between candidates — all 20 core competencies must be covered.
8. CRITICAL: Sections with sectionType "CONTEXT" are PRIVATE INTERVIEWER INTELLIGENCE — they are shown to the interviewer only and NEVER read aloud to the candidate. Use these for candidate analysis, resume highlights, and strategic notes.
9. Sections with sectionType "SCRIPT" contain the actual teleprompter text the interviewer reads aloud.
10. The Candidate Intelligence section (CONTEXT type) must be visually and structurally separate from the teleprompter script.
11. Since leads are warm and pre-qualified (not cold-outbound), do not penalize candidates for lacking cold-prospecting experience — instead weight consultative phone communication, relationship building with high-net-worth homeowners, and follow-up/CRM discipline.
12. Include the company positioning above in a private CONTEXT section and use it to frame at least one role-fit question about explaining TRAVLR's value to an ultra-luxury homeowner.

CORE COMPETENCIES TO EVALUATE: ${CORE_COMPETENCIES.join(', ')}

Return a JSON object with this exact structure:
{
  "candidateSnapshot": {
    "name": string,
    "rank": number | null,
    "priority": string,
    "currentRole": string,
    "location": string,
    "yearsRelevantExperience": string,
    "vacationRentalExperience": boolean,
    "propertyManagement": boolean,
    "outboundSales": boolean,
    "phoneSales": boolean,
    "closing": boolean,
    "crm": boolean,
    "leadership": boolean,
    "top3Strengths": string[],
    "top3ToValidate": string[]
  },
  "interviewStrategy": string,
  "sections": [
    {
      "id": string,
      "sectionLabel": string,
      "sectionType": "CONTEXT" | "SCRIPT",
      "questions": [
        {
          "id": string,
          "questionText": string,
          "resumeBasis": string,
          "isCore": boolean,
          "isLocked": boolean,
          "followUps": string[],
          "listenFor": string[],
          "interviewerNote": string | null
        }
      ]
    }
  ],
  "rolePlays": [
    {
      "id": string,
      "scenario": string,
      "homeownerLine": string,
      "watchFor": string[]
    }
  ],
  "scorecard": {
    "competencies": [
      { "name": string, "description": string }
    ]
  },
  "postInterviewPrompts": string[]
}`;

    const personalizedInstructions = intelligence ? `
PERSONALIZATION INSTRUCTIONS FOR THIS CANDIDATE:
${intelligence.personalizedDeepDiveRationale}

The 30% candidate-specific questions MUST cover these specific areas from their actual resume:
${intelligence.personalizedDeepDiveAreas.map((a, i) => `${i + 1}. ${a}`).join('\n')}

The concern validation questions MUST probe:
${intelligence.concernProbeAreas.map((a, i) => `${i + 1}. ${a}`).join('\n')}

IMPORTANT: Do NOT ask generic questions about whether this candidate has experience in areas their resume clearly documents. Instead, go DEEPER — ask about the specifics, metrics, ownership, and outcomes of experiences they have already demonstrated.
` : '';

    const userMessage = `Generate a complete personalized interview teleprompter script for this candidate:

${candidateProfile}

${personalizedInstructions}

The script must follow the 18-section TRAVLR structure:

A. CANDIDATE INTELLIGENCE (sectionType: "CONTEXT") — Private interviewer-only context. Include:
   - Resume highlights and key evidence
   - Experience classification summary  
   - What makes this candidate unique vs. other candidates
   - Specific resume claims to probe
   - Strategic interview approach for this person
   This section is NEVER read aloud. It is shown privately to the interviewer only.

B. INTERVIEW STRATEGY (sectionType: "CONTEXT") — Private strategic notes for the interviewer

C. TRAVLR COMPANY POSITIONING (sectionType: "CONTEXT") — Private interviewer-only context. Include the 10-year California ultra-luxury proof story, expansion markets, and the TRAVLR Difference. This section is NEVER read aloud verbatim.

D. OPENING (sectionType: "SCRIPT", isCore: true) — Standard TRAVLR opening

E. CAREER OVERVIEW (sectionType: "SCRIPT", isCore: true) — Standard career question, lightly personalized

F. TRAVLR ROLE FIT (sectionType: "SCRIPT", isCore: true) — Standard role fit questions. Include one question that asks how the candidate would explain TRAVLR's decade of California ultra-luxury credibility and expansion into Aspen, Vail, Las Vegas, Miami, and Seattle to a homeowner.

G. CANDIDATE-SPECIFIC DEEP DIVE (sectionType: "SCRIPT", isCore: false) — 30% personalized questions based on ACTUAL resume evidence. These must be meaningfully different for each candidate based on their specific work history.

H. OUTBOUND SALES (sectionType: "SCRIPT", isCore: true) — Standard outbound questions

I. HOMEOWNER CONVERSATION (sectionType: "SCRIPT", isCore: true) — Standard homeowner questions

J. VACATION RENTAL / PROPERTY MANAGEMENT (sectionType: "SCRIPT", isCore: true) — Standard VR/PM questions

K. OBJECTION HANDLING (sectionType: "SCRIPT", isCore: true) — Standard objection questions

L. ROLE-PLAY (sectionType: "SCRIPT", isCore: true) — Standard homeowner scenario

M. CRM + FOLLOW-UP (sectionType: "SCRIPT", isCore: true) — Standard CRM questions, personalized with their actual CRM systems

N. REMOTE WORK / SELF-MANAGEMENT (sectionType: "SCRIPT", isCore: true) — Standard remote work questions

O. POTENTIAL CONCERNS TO VALIDATE (sectionType: "SCRIPT", isCore: false) — At least 2 questions specifically designed to test the identified concern

P. CANDIDATE QUESTIONS (sectionType: "SCRIPT", isCore: true) — Standard candidate questions section

Q. CLOSE (sectionType: "SCRIPT", isCore: true) — Standard close

R. INTERVIEWER SCORECARD NOTES (sectionType: "CONTEXT") — Private post-interview prompts

For section F (Candidate-Specific Deep Dive), generate questions DIRECTLY tied to this candidate's actual resume evidence. These must be meaningfully different from what you would generate for a different candidate.
For section N, generate at least 2 questions specifically designed to test each identified concern.
Every role-play must include INTERVIEWER WATCH-FOR items, not scripted answers.
Mark isCore: true for standard TRAVLR questions that must not be removed.
Mark isLocked: true for questions that should not be substantially rewritten.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [
        { role: 'user', content: userMessage },
      ],
      system: systemPrompt,
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

    // Extract JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Anthropic did not return valid JSON');
    }

    const script = JSON.parse(jsonMatch[0]);

    // Validate basic structure
    if (!script.sections || !Array.isArray(script.sections)) {
      throw new Error('Invalid script structure from Anthropic');
    }

    const now = new Date().toISOString();

    // Save script to candidate
    await supabase
      .from('candidates')
      .update({
        interview_script: script,
        interview_script_version: (candidate.interview_script_version || 0) + 1,
        script_generated_at: now,
        script_model: 'claude-sonnet-4-6',
        script_prompt_version: '2.0',
        candidate_status: 'READY_TO_INTERVIEW',
        updated_at: now,
      })
      .eq('id', candidateId);

    return NextResponse.json({ script, cached: false, generatedAt: now });
  } catch (err) {
    console.error('[generate-script]', err);
    return NextResponse.json(
      { error: 'Failed to generate interview script', details: String(err) },
      { status: 500 }
    );
  }
}
