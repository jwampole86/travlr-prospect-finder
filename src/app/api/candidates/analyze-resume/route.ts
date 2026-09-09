import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateId } = await req.json() as { candidateId: string };

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId required' }, { status: 400 });
    }

    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('id, full_name, resume_raw_text, seed_fit_notes, seed_concerns')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate || !candidate.resume_raw_text) {
      return NextResponse.json({ error: 'Candidate or resume text not found' }, { status: 404 });
    }

    const systemPrompt = `You are an expert resume analyst for TRAVLR Vacation Homes, a boutique luxury vacation-rental brand.
Analyze resumes for the role of Homeowner Outreach & Business Development Agent.

CRITICAL RULES:
1. Extract ONLY information explicitly stated in the resume. NEVER fabricate or infer.
2. If something is not stated, use null or empty array.
3. Do NOT infer protected characteristics (age, race, gender, religion, disability, etc.).
4. Do NOT analyze any photos.
5. Return ONLY valid JSON.
6. For years of experience, only count what is explicitly stated or clearly calculable from dates.
7. Mark evidence with exact resume quotes where possible.

Experience categories to classify:
VACATION_RENTAL, PROPERTY_MANAGEMENT, LUXURY_HOSPITALITY, REAL_ESTATE, BUSINESS_DEVELOPMENT,
OUTBOUND_SALES, INSIDE_SALES, PHONE_SALES, CONSULTATIVE_SALES, FULL_CYCLE_SALES,
LEAD_GENERATION, OWNER_RELATIONS, CLIENT_RELATIONS, CRM, OPERATIONS, TEAM_LEADERSHIP,
REVENUE_MANAGEMENT, MARKETING, CUSTOMER_SERVICE`;

    const userMessage = `Analyze this resume for candidate: ${candidate.full_name}

RESUME TEXT:
${candidate.resume_raw_text.slice(0, 6000)}

${candidate.seed_fit_notes ? `SEED FIT CONTEXT (for reference only, do not fabricate from this): ${candidate.seed_fit_notes}` : ''}

Return a JSON object with this exact structure:
{
  "professionalSummary": string | null,
  "currentTitle": string | null,
  "currentCompany": string | null,
  "city": string | null,
  "state": string | null,
  "email": string | null,
  "phone": string | null,
  "workExperience": [
    {
      "company": string,
      "title": string,
      "location": string | null,
      "startDate": string | null,
      "endDate": string | null,
      "currentRole": boolean,
      "duration": string | null,
      "responsibilities": string[],
      "achievements": string[],
      "relevantSkills": string[]
    }
  ],
  "education": [
    { "institution": string, "degree": string | null, "field": string | null, "year": string | null }
  ],
  "skills": string[],
  "certifications": string[],
  "relevantSystems": string[],
  "yearsTotalExperience": number | null,
  "yearsSalesExperience": number | null,
  "yearsPropertyManagementExperience": number | null,
  "yearsVacationRentalExperience": number | null,
  "yearsBusinessDevelopmentExperience": number | null,
  "yearsPhoneSalesExperience": number | null,
  "experienceClassifications": [
    {
      "category": string,
      "strength": "HIGH" | "MEDIUM" | "LOW" | "NONE" | "UNKNOWN",
      "evidence": [
        { "employer": string, "role": string, "resumeEvidence": string }
      ]
    }
  ],
  "strengths": string[],
  "concerns": string[],
  "resumeHighlights": string[],
  "vacationRentalExperience": boolean,
  "propertyManagementExperience": boolean,
  "luxuryExperience": boolean,
  "homeownerFacingExperience": boolean,
  "outboundCallingExperience": boolean,
  "closingExperience": boolean,
  "crmExperience": boolean,
  "leadGenerationExperience": boolean,
  "operationsExperience": boolean,
  "leadershipExperience": boolean
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Anthropic response');

    const analysis = JSON.parse(jsonMatch[0]);
    const now = new Date().toISOString();

    // Map camelCase to snake_case for DB
    const updatePayload: Record<string, unknown> = {
      professional_summary: analysis.professionalSummary || null,
      current_title: analysis.currentTitle || null,
      current_company: analysis.currentCompany || null,
      city: analysis.city || null,
      state: analysis.state || null,
      email: analysis.email || null,
      phone: analysis.phone || null,
      work_experience: analysis.workExperience || [],
      education: analysis.education || [],
      skills: analysis.skills || [],
      certifications: analysis.certifications || [],
      relevant_systems: analysis.relevantSystems || [],
      years_total_experience: analysis.yearsTotalExperience || null,
      years_sales_experience: analysis.yearsSalesExperience || null,
      years_property_management_experience: analysis.yearsPropertyManagementExperience || null,
      years_vacation_rental_experience: analysis.yearsVacationRentalExperience || null,
      years_business_development_experience: analysis.yearsBusinessDevelopmentExperience || null,
      years_phone_sales_experience: analysis.yearsPhoneSalesExperience || null,
      experience_classifications: analysis.experienceClassifications || [],
      strengths: analysis.strengths || [],
      concerns: analysis.concerns || [],
      resume_highlights: analysis.resumeHighlights || [],
      vacation_rental_experience: analysis.vacationRentalExperience || false,
      property_management_experience: analysis.propertyManagementExperience || false,
      luxury_experience: analysis.luxuryExperience || false,
      homeowner_facing_experience: analysis.homeownerFacingExperience || false,
      outbound_calling_experience: analysis.outboundCallingExperience || false,
      closing_experience: analysis.closingExperience || false,
      crm_experience: analysis.crmExperience || false,
      lead_generation_experience: analysis.leadGenerationExperience || false,
      operations_experience: analysis.operationsExperience || false,
      leadership_experience: analysis.leadershipExperience || false,
      anthropic_analysis: analysis,
      analysis_version: (candidate as Record<string, unknown>).analysis_version ? Number((candidate as Record<string, unknown>).analysis_version) + 1 : 1,
      analysis_generated_at: now,
      candidate_status: 'PROCESSING',
      updated_at: now,
    };

    await supabase.from('candidates').update(updatePayload).eq('id', candidateId);

    await supabase.from('candidate_audit_events').insert({
      candidate_id: candidateId,
      event_type: 'CANDIDATE_ANALYSIS_GENERATED',
      event_data: { model: 'claude-sonnet-4-6', version: updatePayload.analysis_version },
    });

    return NextResponse.json({ analysis, candidateId });
  } catch (err) {
    console.error('[analyze-resume] error:', err);
    return NextResponse.json({
      error: 'Analysis failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
