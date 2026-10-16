import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { OUTREACH_BIZDEV_JOB_DESCRIPTION } from '@/lib/roles/outreachBizDevRole';

const CONSISTENCY_MODEL = 'claude-sonnet-4-6';
const CONSISTENCY_PROMPT_VERSION = '1.0';
const ANTHROPIC_ENV_VAR = 'ANTHROPIC_API_KEY';

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

function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(`${ANTHROPIC_ENV_VAR} is not configured on the server`);
  }

  return new Anthropic({ apiKey });
}

function getErrorDetails(err: unknown) {
  if (err && typeof err === 'object') {
    const maybeMessage = 'message' in err ? err.message : null;
    const maybeCode = 'code' in err ? err.code : null;
    return { message: String(maybeMessage || 'Unknown error'), code: maybeCode ? String(maybeCode) : undefined };
  }
  return { message: String(err) };
}

function hasResumeEvidence(candidate: Record<string, unknown>) {
  const workExp = Array.isArray(candidate.work_experience) ? candidate.work_experience : [];
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const highlights = Array.isArray(candidate.resume_highlights) ? candidate.resume_highlights : [];
  return workExp.length > 0 || skills.length > 0 || highlights.length > 0 || Boolean(candidate.resume_raw_text);
}

function buildReadiness(args: {
  candidate: Record<string, unknown>;
  notesCount: number;
  interviewCount: number;
  latestScorecard: Record<string, unknown> | null;
  reportCount: number;
}) {
  const { candidate, notesCount, interviewCount, latestScorecard, reportCount } = args;
  const resumeReady = hasResumeEvidence(candidate);
  const hasInterviewerNotes = Boolean(String(latestScorecard?.interviewer_notes || '').trim());
  const hasScorecard = Boolean(latestScorecard);
  const hasInterviewEvidence = notesCount > 0 || hasInterviewerNotes;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!resumeReady) blockers.push('This candidate has no structured resume evidence yet.');
  if (!hasInterviewEvidence) blockers.push('No interview notes or interviewer summary are available yet.');
  if (!hasScorecard) warnings.push('No scorecard exists yet; the report can still run once interview notes are present.');
  if (!interviewCount) warnings.push('Interview count is still zero on the candidate record.');

  return {
    readyForAnalysis: resumeReady && hasInterviewEvidence,
    resumeReady,
    notesCount,
    interviewCount,
    hasScorecard,
    hasInterviewerNotes,
    reportCount,
    blockers,
    warnings,
  };
}

function buildStructuredInput(
  candidate: Record<string, unknown>,
  notes: Array<{ question_text?: string; note_text: string }>,
  scorecard: Record<string, unknown> | null
): string {
  const workExp = Array.isArray(candidate.work_experience) ? candidate.work_experience : [];
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];

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
    ? notes.map((n) => `Q: ${n.question_text || 'General note'}\nNote: ${n.note_text}`).join('\n\n')
    : 'No interview notes recorded.';

  const workExpText = workExp.map((job: Record<string, unknown>) =>
    `- ${job.title || 'Role'} at ${job.company || 'Company'} (${job.startDate || '?'} – ${job.endDate || 'Present'})\n  ${Array.isArray(job.responsibilities) ? job.responsibilities.join('; ') : ''}`
  ).join('\n');

  return `
CANDIDATE: ${candidate.full_name || 'Unknown'}

${OUTREACH_BIZDEV_JOB_DESCRIPTION}

RESUME WORK HISTORY:
${workExpText || candidate.resume_raw_text?.toString().slice(0, 3000) || 'Not available'}

RESUME SKILLS: ${skills.join(', ') || 'Not specified'}

RESUME HIGHLIGHTS:
${Array.isArray(candidate.resume_highlights) ? (candidate.resume_highlights as string[]).join('\n') : candidate.seed_fit_notes || 'Not specified'}

POTENTIAL CONCERNS FROM RESUME REVIEW:
${Array.isArray(candidate.concerns) ? (candidate.concerns as string[]).join('\n') : candidate.seed_concerns || 'Not specified'}

INTERVIEW NOTES:
${notesText}

${scorecardSummary}
`.trim();
}

async function loadCandidateContext(supabase: Awaited<ReturnType<typeof createClient>>, candidateId: string, scorecardId?: string | null) {
  const [{ data: candidate, error: candErr }, { data: notes, error: notesErr }, { count: reportCount, error: reportCountErr }] = await Promise.all([
    supabase
      .from('candidates')
      .select(`
        id, full_name, candidate_rank, interview_priority, pipeline_status,
        current_title, current_company, work_experience, skills, resume_highlights,
        resume_raw_text, seed_fit_notes, seed_concerns, concerns,
        latest_interview_at, interview_count, latest_scorecard_average, top_strength,
        main_area_to_validate, consistency_report_status, resume_version
      `)
      .eq('id', candidateId)
      .single(),
    supabase
      .from('candidate_interview_notes')
      .select('question_text, note_text')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true }),
    supabase
      .from('candidate_consistency_reports')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId),
  ]);

  if (candErr || !candidate) throw candErr || new Error('Candidate not found');
  if (notesErr) throw notesErr;
  if (reportCountErr) throw reportCountErr;

  let latestScorecardQuery = supabase
    .from('candidate_scorecards')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (scorecardId) latestScorecardQuery = latestScorecardQuery.eq('id', scorecardId);

  const { data: latestScorecard, error: scorecardErr } = await latestScorecardQuery.maybeSingle();
  if (scorecardErr) throw scorecardErr;

  const { data: latestReport, error: latestReportErr } = await supabase
    .from('candidate_consistency_reports')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestReportErr) throw latestReportErr;

  const readiness = buildReadiness({
    candidate: candidate as Record<string, unknown>,
    notesCount: notes?.length || 0,
    interviewCount: Number(candidate.interview_count) || 0,
    latestScorecard: latestScorecard as Record<string, unknown> | null,
    reportCount: reportCount || 0,
  });

  return {
    candidate,
    notes: notes || [],
    latestScorecard,
    latestReport,
    readiness,
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId required' }, { status: 400 });
    }

    const context = await loadCandidateContext(supabase, candidateId);

    return NextResponse.json({
      report: context.latestReport || null,
      candidate: context.candidate,
      readiness: context.readiness,
      meta: {
        model: context.latestReport?.model || CONSISTENCY_MODEL,
        promptVersion: context.latestReport?.prompt_version || CONSISTENCY_PROMPT_VERSION,
        apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
        browserKeyExposed: Boolean(process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY),
      },
    });
  } catch (err) {
    console.error('[consistency-report GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch report context', details: getErrorDetails(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const anthropic = createAnthropicClient();
    const { candidateId, interviewId, scorecardId } = await req.json();

    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    const context = await loadCandidateContext(supabase, candidateId, scorecardId);

    if (!context.readiness.readyForAnalysis) {
      return NextResponse.json(
        {
          error: 'This candidate does not have enough real interview evidence for a consistency report yet.',
          readiness: context.readiness,
          meta: {
            model: CONSISTENCY_MODEL,
            promptVersion: CONSISTENCY_PROMPT_VERSION,
            apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
          },
        },
        { status: 409 }
      );
    }

    const { candidate, notes, latestScorecard } = context;

    const { data: reportRecord, error: insertErr } = await supabase
      .from('candidate_consistency_reports')
      .insert({
        candidate_id: candidateId,
        interview_id: interviewId || null,
        scorecard_id: scorecardId || latestScorecard?.id || null,
        resume_version: candidate.resume_version || 1,
        generation_status: 'GENERATING',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    const structuredInput = buildStructuredInput(
      candidate as Record<string, unknown>,
      notes,
      latestScorecard as Record<string, unknown> | null
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
        model: CONSISTENCY_MODEL,
        max_tokens: 6000,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      });

      const rawText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Anthropic did not return valid JSON');

      report = JSON.parse(jsonMatch[0]) as ConsistencyReport;
      if (!report.executiveSummary || !Array.isArray(report.validatedClaims)) {
        throw new Error('Invalid report structure from Anthropic');
      }
    } catch (genErr) {
      generationError = genErr instanceof Error ? genErr.message : String(genErr);
      console.error('[consistency-report] Generation error:', genErr);
    }

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
      model: CONSISTENCY_MODEL,
      prompt_version: CONSISTENCY_PROMPT_VERSION,
    } : {
      generation_status: 'FAILED',
      generation_error: generationError,
    };

    await supabase
      .from('candidate_consistency_reports')
      .update(updateData)
      .eq('id', reportRecord.id);

    await supabase
      .from('candidates')
      .update({
        consistency_report_status: report ? 'COMPLETED' : 'FAILED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId);

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

    return NextResponse.json({
      report: finalReport,
      readiness: context.readiness,
      meta: {
        model: CONSISTENCY_MODEL,
        promptVersion: CONSISTENCY_PROMPT_VERSION,
      },
    });
  } catch (err) {
    console.error('[consistency-report POST]', err);
    const details = getErrorDetails(err);
    const status = details.message.includes(ANTHROPIC_ENV_VAR) ? 503 : 500;
    return NextResponse.json(
      {
        error: status === 503 ? 'Consistency report generation is unavailable until the server AI key is configured.' : 'Failed to generate consistency report',
        details,
      },
      { status }
    );
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
    return NextResponse.json(
      { error: 'Failed to update report', details: getErrorDetails(err) },
      { status: 500 }
    );
  }
}
