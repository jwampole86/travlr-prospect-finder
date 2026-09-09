import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsistencyClaim {
  resumeClaim: string;
  resumeEvidence: string;
  interviewEvidence: string;
  status: 'VALIDATED' | 'PARTIALLY_VALIDATED' | 'NOT_YET_VALIDATED' | 'NEEDS_CLARIFICATION';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  analysis: string;
}

interface NextStepTopic {
  topic: string;
  priority: 'HIGH' | 'MEDIUM' | 'OPTIONAL';
  reason: string;
}

interface ConsistencyReport {
  executiveSummary: string;
  validatedClaims: ConsistencyClaim[];
  partiallyValidatedClaims: ConsistencyClaim[];
  notYetValidated: ConsistencyClaim[];
  needsClarification: ConsistencyClaim[];
  newInformation: string[];
  unansweredQuestions: string[];
  roleGaps: string[];
  strongestInterviewEvidence: string[];
  nextStepTopics: NextStepTopic[];
  secondInterviewQuestions: string[];
}

function buildStructuredInput(
  candidate: Record<string, unknown>,
  notes: Array<{ question_text?: string; note_text: string }>,
  scorecard: Record<string, unknown> | null
): string {
  const workExp = Array.isArray(candidate.work_experience) ? candidate.work_experience : [];
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];

  // Build safe scorecard summary (no PII, job-relevant only)
  const scorecardSummary = scorecard ? `
SCORECARD RESULTS:
Vacation Rental Knowledge: ${scorecard.vacation_rental_knowledge ?? 'Not rated'}/10
Property Management: ${scorecard.property_management_knowledge ?? 'Not rated'}/10
Luxury Homeowner Communication: ${scorecard.luxury_homeowner_communication ?? 'Not rated'}/10
Outbound Calling: ${scorecard.outbound_calling_ability ?? 'Not rated'}/10
Consultative Sales: ${scorecard.consultative_sales ?? 'Not rated'}/10
Discovery/Questioning: ${scorecard.discovery_questioning ?? 'Not rated'}/10
Objection Handling: ${scorecard.objection_handling ?? 'Not rated'}/10
Closing Ability: ${scorecard.closing_ability ?? 'Not rated'}/10
Follow-Up Discipline: ${scorecard.follow_up_discipline ?? 'Not rated'}/10
CRM/Pipeline: ${scorecard.crm_pipeline_management ?? 'Not rated'}/10
Relationship Building: ${scorecard.relationship_building ?? 'Not rated'}/10
Communication: ${scorecard.professional_communication ?? 'Not rated'}/10
Self-Motivation: ${scorecard.self_motivation ?? 'Not rated'}/10
Remote Work: ${scorecard.remote_work_discipline ?? 'Not rated'}/10
Coachability: ${scorecard.coachability ?? 'Not rated'}/10
Overall Fit: ${scorecard.overall_fit ?? 'Not rated'}/10

Interviewer Notes: ${scorecard.interviewer_notes || 'None recorded'}
` : 'No scorecard completed yet.';

  const notesText = notes.length > 0
    ? notes.map(n => `Q: ${n.question_text || 'General note'}\nNote: ${n.note_text}`).join('\n\n')
    : 'No interview notes recorded.';

  const workExpText = workExp.map((job: Record<string, unknown>) =>
    `- ${job.title || 'Role'} at ${job.company || 'Company'} (${job.startDate || '?'} – ${job.endDate || 'Present'})\n  ${Array.isArray(job.responsibilities) ? job.responsibilities.join('; ') : ''}`
  ).join('\n');

  return `
CANDIDATE: ${candidate.full_name || 'Unknown'}
TARGET ROLE: Homeowner Outreach & Business Development Agent at TRAVLR Vacation Homes

RESUME WORK HISTORY:
${workExpText || candidate.resume_raw_text?.toString().slice(0, 3000) || 'Not available'}

RESUME SKILLS: ${Array.isArray(skills) ? skills.join(', ') : 'Not specified'}

RESUME HIGHLIGHTS:
${Array.isArray(candidate.resume_highlights) ? (candidate.resume_highlights as string[]).join('\n') : candidate.seed_fit_notes || 'Not specified'}

POTENTIAL CONCERNS FROM RESUME REVIEW:
${Array.isArray(candidate.concerns) ? (candidate.concerns as string[]).join('\n') : candidate.seed_concerns || 'Not specified'}

INTERVIEW NOTES:
${notesText}

${scorecardSummary}
`.trim();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');

    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('candidate_consistency_reports')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({ report: data || null });
  } catch (err) {
    console.error('[consistency-report GET]', err);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateId, interviewId, scorecardId } = await req.json();

    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    // Fetch candidate (job-relevant fields only — no unnecessary PII)
    const { data: candidate, error: candErr } = await supabase
      .from('candidates')
      .select(`
        id, full_name, first_name, current_title, current_company,
        work_experience, skills, resume_highlights, resume_raw_text,
        seed_fit_notes, seed_concerns, strengths, concerns,
        vacation_rental_experience, property_management_experience,
        outbound_calling_experience, closing_experience, crm_experience,
        resume_version
      `)
      .eq('id', candidateId)
      .single();

    if (candErr || !candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    // Fetch interview notes
    const { data: notes } = await supabase
      .from('candidate_interview_notes')
      .select('question_text, note_text')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });

    // Fetch scorecard
    let scorecard = null;
    if (scorecardId) {
      const { data: sc } = await supabase
        .from('candidate_scorecards')
        .select('*')
        .eq('id', scorecardId)
        .single();
      scorecard = sc;
    } else {
      const { data: sc } = await supabase
        .from('candidate_scorecards')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      scorecard = sc;
    }

    // Create pending report record
    const { data: reportRecord, error: insertErr } = await supabase
      .from('candidate_consistency_reports')
      .insert({
        candidate_id: candidateId,
        interview_id: interviewId || null,
        scorecard_id: scorecardId || scorecard?.id || null,
        resume_version: candidate.resume_version || 1,
        generation_status: 'GENERATING',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Build structured input (no unnecessary PII)
    const structuredInput = buildStructuredInput(
      candidate as Record<string, unknown>,
      notes || [],
      scorecard as Record<string, unknown> | null
    );

    const systemPrompt = `You are an expert interview analyst for TRAVLR Vacation Homes, a boutique luxury vacation-rental brand.
Your task is to generate a RESUME VS. INTERVIEW CONSISTENCY REPORT.

CRITICAL RULES:
1. Use ONLY information from the provided resume evidence and interview notes. NEVER fabricate evidence.
2. If a claim was not explored in the interview, use NOT_YET_VALIDATED — not FALSE.
3. Use neutral language for inconsistencies: "Needs clarification", "Potential inconsistency", "Interview response differed from resume wording".
4. Do NOT infer protected characteristics (age, race, gender, religion, disability, etc.).
5. Do NOT make a hire/reject recommendation. Final decision is human-only.
6. Confidence reflects strength of available professional evidence, NOT candidate quality.
7. Return ONLY valid JSON matching the schema below.

ALLOWED STATUSES: VALIDATED, PARTIALLY_VALIDATED, NOT_YET_VALIDATED, NEEDS_CLARIFICATION
ALLOWED CONFIDENCE: HIGH, MEDIUM, LOW

Return this exact JSON structure:
{
  "executiveSummary": "string",
  "validatedClaims": [{"resumeClaim":"","resumeEvidence":"","interviewEvidence":"","status":"VALIDATED","confidence":"HIGH","analysis":""}],
  "partiallyValidatedClaims": [{"resumeClaim":"","resumeEvidence":"","interviewEvidence":"","status":"PARTIALLY_VALIDATED","confidence":"MEDIUM","analysis":""}],
  "notYetValidated": [{"resumeClaim":"","resumeEvidence":"","interviewEvidence":"Not explored in interview","status":"NOT_YET_VALIDATED","confidence":"LOW","analysis":""}],
  "needsClarification": [{"resumeClaim":"","resumeEvidence":"","interviewEvidence":"","status":"NEEDS_CLARIFICATION","confidence":"LOW","analysis":""}],
  "newInformation": ["string"],
  "unansweredQuestions": ["string"],
  "roleGaps": ["string"],
  "strongestInterviewEvidence": ["string"],
  "nextStepTopics": [{"topic":"","priority":"HIGH","reason":""}],
  "secondInterviewQuestions": ["string"]
}`;

    const userMessage = `Generate a complete Resume vs. Interview Consistency Report for this candidate:

${structuredInput}

REPORT REQUIREMENTS:
A. EXECUTIVE SUMMARY — 2-3 sentences summarizing overall consistency between resume and interview
B. VALIDATED CLAIMS — Resume claims clearly supported by interview evidence
C. PARTIALLY VALIDATED — Partially supported but full scope unclear
D. NOT YET VALIDATED — Claims not explored in interview (NOT false — just not yet tested)
E. NEEDS CLARIFICATION — Potential inconsistencies requiring follow-up (use neutral language)
F. NEW INFORMATION — Job-relevant information learned in interview not obvious from resume
G. UNANSWERED QUESTIONS — Important areas still unresolved, prioritized by hiring relevance
H. ROLE GAPS — Areas where candidate may need development for this specific role
I. STRONGEST INTERVIEW EVIDENCE — Most compelling evidence from the interview
J. NEXT-STEP TOPICS — Prioritized HIGH/MEDIUM/OPTIONAL list for follow-up
K. SECOND INTERVIEW QUESTIONS — 5-10 targeted questions based on remaining uncertainty

For secondInterviewQuestions: generate questions that derive from resume evidence + first interview evidence + remaining uncertainty. Do NOT simply regenerate the first interview.`;

    let report: ConsistencyReport | null = null;
    let generationError: string | null = null;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      });

      const rawText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Anthropic did not return valid JSON');

      report = JSON.parse(jsonMatch[0]) as ConsistencyReport;

      // Validate required fields
      if (!report.executiveSummary || !Array.isArray(report.validatedClaims)) {
        throw new Error('Invalid report structure from Anthropic');
      }
    } catch (genErr) {
      generationError = String(genErr);
      console.error('[consistency-report] Generation error:', genErr);
    }

    // Save report (success or failure)
    const updateData = report ? {
      executive_summary: report.executiveSummary,
      validated_claims: report.validatedClaims,
      partially_validated_claims: report.partiallyValidatedClaims,
      not_yet_validated: report.notYetValidated,
      needs_clarification: report.needsClarification,
      new_information: report.newInformation,
      unanswered_questions: report.unansweredQuestions,
      role_gaps: report.roleGaps,
      strongest_interview_evidence: report.strongestInterviewEvidence,
      next_step_topics: report.nextStepTopics,
      second_interview_questions: report.secondInterviewQuestions,
      generation_status: 'COMPLETED',
      generated_at: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      prompt_version: '1.0',
    } : {
      generation_status: 'FAILED',
      generation_error: generationError,
    };

    await supabase
      .from('candidate_consistency_reports')
      .update(updateData)
      .eq('id', reportRecord.id);

    // Update candidate consistency_report_status
    await supabase
      .from('candidates')
      .update({
        consistency_report_status: report ? 'COMPLETED' : 'FAILED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId);

    // Audit event
    await supabase.from('candidate_audit_events').insert({
      candidate_id: candidateId,
      event_type: 'CONSISTENCY_REPORT_GENERATED',
      event_data: { report_id: reportRecord.id, status: report ? 'COMPLETED' : 'FAILED' },
    });

    if (!report) {
      return NextResponse.json({
        error: 'Report generation failed',
        reportId: reportRecord.id,
        details: generationError,
      }, { status: 500 });
    }

    const { data: finalReport } = await supabase
      .from('candidate_consistency_reports')
      .select('*')
      .eq('id', reportRecord.id)
      .single();

    return NextResponse.json({ report: finalReport });
  } catch (err) {
    console.error('[consistency-report POST]', err);
    return NextResponse.json({ error: 'Failed to generate consistency report' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { reportId, adminEdits } = await req.json();

    if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('candidate_consistency_reports')
      .update({ admin_edits: adminEdits, updated_at: new Date().toISOString() })
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ report: data });
  } catch (err) {
    console.error('[consistency-report PATCH]', err);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}
