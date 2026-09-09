import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Candidate-specific expected focus areas for QA validation ────────────────
const CANDIDATE_EXPECTED_FOCUS: Record<string, string[]> = {
  'kelli winkel': ['vacation rental', 'homeowner', 'business development', 'consultative', 'owner relationship', 'portfolio', 'closing agreement', 'management agreement'],
  'brett allen': ['str operations', 'short-term rental', 'portfolio scaling', 'operational leadership', 'owner relationship', 'vendor', 'business development', 'outbound'],
  'gina l. mattivello': ['outbound call', 'phone closing', 'discovery', 'objection handling', 'crm pipeline', 'cold outreach', 'luxury homeowner', 'vacation rental'],
  'karissa crooks': ['vintory', 'owner lead', 'property onboarding', 'revenue management', 'str license', 'outbound prospecting', 'homeowner presentation'],
  'caitlyn sorrells': ['corporate housing', 'lead generation', 'b2b', 'multi-line phone', 'inventory', 'property management', 'closing', 'outbound'],
  'margo johnson': ['300', 'outbound call', 'real estate saas', 'business development', 'pipeline', 'full-cycle', 'luxury homeowner', 'crm'],
  'jessica thrasher': ['real estate', 'cold calling', 'client needs', 'property management', 'marketing', 'business development', 'closing'],
  'darlene ciao': ['inside sales', 'phone sales', 'lead qualification', 'appointment setting', 'prospecting', 'crm', 'luxury', 'vacation rental'],
};

interface QAResult {
  candidateId: string;
  candidateName: string;
  resumeParsed: boolean;
  specificQuestionsCount: number;
  evidenceBackedCount: number;
  missingEvidenceCount: number;
  nearDuplicateCount: number;
  crossCandidateLeakage: boolean;
  personalizationPct: number;
  qaStatus: 'PASS' | 'WARN' | 'FAIL';
  coreQuestionsCount: number;
  candidateSpecificQuestions: Array<{
    question: string;
    resumeBasis: string;
    hasEvidence: boolean;
    evidenceStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING';
  }>;
  duplicateMatches: Array<{ question: string; matchedWith: string; similarity: number }>;
  leakageDetails: string[];
  warnReasons: string[];
  failReasons: string[];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function calculateSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1.0;

  const wordsA = new Set(na.split(' ').filter(w => w.length > 4));
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 4));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function detectCrossLeakage(
  targetName: string,
  targetQuestions: string[],
  allCandidates: Array<{ name: string; specificQuestions: string[]; resumeText: string }>
): string[] {
  const leakage: string[] = [];
  const targetNorm = normalizeText(targetName);

  for (const other of allCandidates) {
    if (normalizeText(other.name) === targetNorm) continue;

    // Check if other candidate's resume-specific evidence appears in target's questions
    const otherResumeKeywords = extractResumeKeywords(other.resumeText, other.name);
    for (const keyword of otherResumeKeywords) {
      for (const q of targetQuestions) {
        if (normalizeText(q).includes(keyword) && keyword.length > 8) {
          leakage.push(`Question references "${keyword}" which is specific to ${other.name}'s resume, not ${targetName}'s`);
        }
      }
    }
  }

  return [...new Set(leakage)].slice(0, 5); // cap at 5 unique leakage items
}

function extractResumeKeywords(resumeText: string, candidateName: string): string[] {
  // Extract highly specific keywords that would only appear in one candidate's resume
  const specificKeywords: Record<string, string[]> = {
    'margo johnson': ['300+ outbound', 'qazzoo', 'bespoke cyber', 'squeaky ventures', 'wall street webcasting', 'umbrelli', 'vanillasoft', 'zoominfo'],
    'karissa crooks': ['vintory', 'esvr', 'jack lingo', 'seascape property', 'beyond pricing', 'key data', 'talbot county', 'dorchester county'],
    'kelli winkel': [], // will use resume text
    'brett allen': [],
    'gina l. mattivello': [],
    'caitlyn sorrells': [],
    'jessica thrasher': [],
    'darlene ciao': [],
  };

  const norm = candidateName.toLowerCase();
  return specificKeywords[norm] || [];
}

async function runQAForCandidate(
  candidate: Record<string, unknown>,
  allCandidates: Array<{ name: string; specificQuestions: string[]; resumeText: string }>
): Promise<QAResult> {
  const name = String(candidate.full_name || '');
  const script = candidate.interview_script as Record<string, unknown> | null;
  const resumeText = String(candidate.resume_raw_text || candidate.seed_fit_notes || '');

  const result: QAResult = {
    candidateId: String(candidate.id),
    candidateName: name,
    resumeParsed: !!(candidate.resume_raw_text || candidate.work_experience),
    specificQuestionsCount: 0,
    evidenceBackedCount: 0,
    missingEvidenceCount: 0,
    nearDuplicateCount: 0,
    crossCandidateLeakage: false,
    personalizationPct: 0,
    qaStatus: 'PASS',
    coreQuestionsCount: 0,
    candidateSpecificQuestions: [],
    duplicateMatches: [],
    leakageDetails: [],
    warnReasons: [],
    failReasons: [],
  };

  if (!script || !Array.isArray((script as Record<string, unknown>).sections)) {
    result.qaStatus = 'FAIL';
    result.failReasons.push('No interview script generated');
    return result;
  }

  const sections = (script as Record<string, unknown>).sections as Array<Record<string, unknown>>;
  const allQuestions: Array<{ question: string; isCore: boolean; resumeBasis: string }> = [];

  for (const section of sections) {
    if (!Array.isArray(section.questions)) continue;
    for (const q of section.questions as Array<Record<string, unknown>>) {
      allQuestions.push({
        question: String(q.questionText || ''),
        isCore: Boolean(q.isCore),
        resumeBasis: String(q.resumeBasis || ''),
      });
    }
  }

  const coreQuestions = allQuestions.filter(q => q.isCore);
  const specificQuestions = allQuestions.filter(q => !q.isCore);

  result.coreQuestionsCount = coreQuestions.length;
  result.specificQuestionsCount = specificQuestions.length;

  // Check evidence backing
  for (const sq of specificQuestions) {
    const hasBasis = sq.resumeBasis && sq.resumeBasis.length > 10 && sq.resumeBasis !== 'Not specified';
    const evidenceStrength: 'STRONG'| 'MODERATE' | 'WEAK' | 'MISSING' = !hasBasis ?'MISSING' :
      sq.resumeBasis.length > 50 ? 'STRONG' :
      sq.resumeBasis.length > 20 ? 'MODERATE' : 'WEAK';

    result.candidateSpecificQuestions.push({
      question: sq.question,
      resumeBasis: sq.resumeBasis,
      hasEvidence: hasBasis,
      evidenceStrength,
    });

    if (hasBasis) result.evidenceBackedCount++;
    else result.missingEvidenceCount++;
  }

  // Calculate personalization %
  result.personalizationPct = result.specificQuestionsCount > 0
    ? Math.round((result.evidenceBackedCount / result.specificQuestionsCount) * 100)
    : 0;

  // Check for near-duplicates across candidates
  const specificQTexts = specificQuestions.map(q => q.question);
  for (const other of allCandidates) {
    if (normalizeText(other.name) === normalizeText(name)) continue;
    for (const myQ of specificQTexts) {
      for (const otherQ of other.specificQuestions) {
        const sim = calculateSimilarity(myQ, otherQ);
        if (sim > 0.65) {
          result.nearDuplicateCount++;
          result.duplicateMatches.push({
            question: myQ,
            matchedWith: `${other.name}: "${otherQ.slice(0, 80)}..."`,
            similarity: Math.round(sim * 100),
          });
        }
      }
    }
  }

  // Cross-candidate leakage check
  const leakage = detectCrossLeakage(name, specificQTexts, allCandidates);
  if (leakage.length > 0) {
    result.crossCandidateLeakage = true;
    result.leakageDetails = leakage;
  }

  // Check expected focus areas
  const expectedFocus = CANDIDATE_EXPECTED_FOCUS[normalizeText(name)] || [];
  const allQText = allQuestions.map(q => normalizeText(q.question)).join(' ');
  const missingFocus = expectedFocus.filter(focus => !allQText.includes(focus));

  // Determine QA status
  if (
    result.crossCandidateLeakage ||
    result.specificQuestionsCount === 0 ||
    (result.specificQuestionsCount > 0 && result.evidenceBackedCount === 0)
  ) {
    result.qaStatus = 'FAIL';
    if (result.crossCandidateLeakage) result.failReasons.push('Cross-candidate context leakage detected');
    if (result.specificQuestionsCount === 0) result.failReasons.push('No candidate-specific questions generated');
    if (result.evidenceBackedCount === 0 && result.specificQuestionsCount > 0) result.failReasons.push('All candidate-specific questions lack resume evidence');
  } else if (
    result.specificQuestionsCount < 5 ||
    result.missingEvidenceCount > 2 ||
    result.nearDuplicateCount > 3 ||
    result.personalizationPct < 60 ||
    missingFocus.length > 3
  ) {
    result.qaStatus = 'WARN';
    if (result.specificQuestionsCount < 5) result.warnReasons.push(`Only ${result.specificQuestionsCount} candidate-specific questions (minimum 5 recommended)`);
    if (result.missingEvidenceCount > 2) result.warnReasons.push(`${result.missingEvidenceCount} questions lack resume evidence`);
    if (result.nearDuplicateCount > 3) result.warnReasons.push(`${result.nearDuplicateCount} near-duplicate questions detected across candidates`);
    if (result.personalizationPct < 60) result.warnReasons.push(`Personalization coverage only ${result.personalizationPct}% (target: 100%)`);
    if (missingFocus.length > 3) result.warnReasons.push(`Missing expected focus areas: ${missingFocus.slice(0, 3).join(', ')}`);
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { testExisting = true, candidateIds } = await req.json().catch(() => ({ testExisting: true }));

    // Fetch all candidates (or specified ones)
    let query = supabase
      .from('candidates')
      .select('id, full_name, interview_script, resume_raw_text, work_experience, seed_fit_notes, candidate_rank')
      .order('candidate_rank', { ascending: true, nullsFirst: false });

    if (candidateIds && Array.isArray(candidateIds) && candidateIds.length > 0) {
      query = query.in('id', candidateIds);
    }

    const { data: candidates, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates found' }, { status: 404 });
    }

    // Build cross-candidate comparison data
    const allCandidateData = candidates.map(c => {
      const script = c.interview_script as Record<string, unknown> | null;
      const specificQuestions: string[] = [];

      if (script && Array.isArray((script as Record<string, unknown>).sections)) {
        const sections = (script as Record<string, unknown>).sections as Array<Record<string, unknown>>;
        for (const section of sections) {
          if (!Array.isArray(section.questions)) continue;
          for (const q of section.questions as Array<Record<string, unknown>>) {
            if (!q.isCore) {
              specificQuestions.push(String(q.questionText || ''));
            }
          }
        }
      }

      return {
        name: String(c.full_name || ''),
        specificQuestions,
        resumeText: String(c.resume_raw_text || c.seed_fit_notes || ''),
      };
    });

    // Run QA for each candidate
    const qaResults: QAResult[] = [];
    for (const candidate of candidates) {
      const result = await runQAForCandidate(
        candidate as Record<string, unknown>,
        allCandidateData
      );
      qaResults.push(result);
    }

    // Save QA results to DB
    const now = new Date().toISOString();
    for (const result of qaResults) {
      await supabase.from('candidate_qa_results').insert({
        candidate_id: result.candidateId,
        run_at: now,
        resume_parsed: result.resumeParsed,
        specific_questions_count: result.specificQuestionsCount,
        evidence_backed_count: result.evidenceBackedCount,
        missing_evidence_count: result.missingEvidenceCount,
        near_duplicate_count: result.nearDuplicateCount,
        cross_candidate_leakage: result.crossCandidateLeakage,
        personalization_pct: result.personalizationPct,
        qa_status: result.qaStatus,
        core_questions_count: result.coreQuestionsCount,
        candidate_specific_questions: result.candidateSpecificQuestions,
        duplicate_matches: result.duplicateMatches,
        leakage_details: result.leakageDetails,
        warn_reasons: result.warnReasons,
        fail_reasons: result.failReasons,
      });
    }

    // Summary stats
    const summary = {
      totalCandidates: qaResults.length,
      pass: qaResults.filter(r => r.qaStatus === 'PASS').length,
      warn: qaResults.filter(r => r.qaStatus === 'WARN').length,
      fail: qaResults.filter(r => r.qaStatus === 'FAIL').length,
      crossCandidateLeakageDetected: qaResults.some(r => r.crossCandidateLeakage),
      averagePersonalizationPct: qaResults.length > 0
        ? Math.round(qaResults.reduce((sum, r) => sum + r.personalizationPct, 0) / qaResults.length)
        : 0,
      runAt: now,
    };

    return NextResponse.json({ results: qaResults, summary });
  } catch (err) {
    console.error('[batch-qa POST]', err);
    return NextResponse.json({ error: 'Failed to run batch QA' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');

    let query = supabase
      .from('candidate_qa_results')
      .select('*')
      .order('run_at', { ascending: false });

    if (candidateId) {
      query = query.eq('candidate_id', candidateId).limit(1);
    } else {
      // Get latest run per candidate
      query = query.limit(50);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ results: data || [] });
  } catch (err) {
    console.error('[batch-qa GET]', err);
    return NextResponse.json({ error: 'Failed to fetch QA results' }, { status: 500 });
  }
}
