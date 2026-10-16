import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const INTERVIEW_SCRIPT_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_ENV_VAR = 'ANTHROPIC_API_KEY';
const RESULTS_LIMIT = 250;

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

interface QAConfiguration {
  generationRoute: string;
  qaRoute: string;
  scriptModel: string;
  anthropicEnvVar: string;
  apiKeyConfigured: boolean;
  browserKeyExposed: boolean;
  qaRunsPaidCalls: boolean;
  totalCandidatesCount: number;
  scriptedCandidatesCount: number;
  latestAuditedCandidatesCount: number;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function calculateSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1.0;

  const wordsA = new Set(na.split(' ').filter((w) => w.length > 4));
  const wordsB = new Set(nb.split(' ').filter((w) => w.length > 4));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function extractResumeKeywords(_resumeText: string, candidateName: string): string[] {
  const specificKeywords: Record<string, string[]> = {
    'margo johnson': ['300+ outbound', 'qazzoo', 'bespoke cyber', 'squeaky ventures', 'wall street webcasting', 'umbrelli', 'vanillasoft', 'zoominfo'],
    'karissa crooks': ['vintory', 'esvr', 'jack lingo', 'seascape property', 'beyond pricing', 'key data', 'talbot county', 'dorchester county'],
    'kelli winkel': [],
    'brett allen': [],
    'gina l. mattivello': [],
    'caitlyn sorrells': [],
    'jessica thrasher': [],
    'darlene ciao': [],
  };

  return specificKeywords[candidateName.toLowerCase()] || [];
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

    const otherResumeKeywords = extractResumeKeywords(other.resumeText, other.name);
    for (const keyword of otherResumeKeywords) {
      for (const q of targetQuestions) {
        if (normalizeText(q).includes(keyword) && keyword.length > 8) {
          leakage.push(`Question references "${keyword}" which is specific to ${other.name}'s resume, not ${targetName}'s`);
        }
      }
    }
  }

  return [...new Set(leakage)].slice(0, 5);
}

function buildSummary(results: QAResult[] | null, runAt?: string | null) {
  if (!results || results.length === 0) return null;

  return {
    totalCandidates: results.length,
    pass: results.filter((r) => r.qaStatus === 'PASS').length,
    warn: results.filter((r) => r.qaStatus === 'WARN').length,
    fail: results.filter((r) => r.qaStatus === 'FAIL').length,
    crossCandidateLeakageDetected: results.some((r) => r.crossCandidateLeakage),
    averagePersonalizationPct: Math.round(results.reduce((sum, r) => sum + r.personalizationPct, 0) / results.length),
    runAt: runAt || new Date().toISOString(),
  };
}

function buildConfiguration(totalCandidatesCount: number, scriptedCandidatesCount: number, latestAuditedCandidatesCount: number): QAConfiguration {
  return {
    generationRoute: '/api/candidates/generate-script',
    qaRoute: '/api/candidates/batch-qa',
    scriptModel: INTERVIEW_SCRIPT_MODEL,
    anthropicEnvVar: ANTHROPIC_ENV_VAR,
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    browserKeyExposed: Boolean(process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY),
    qaRunsPaidCalls: false,
    totalCandidatesCount,
    scriptedCandidatesCount,
    latestAuditedCandidatesCount,
  };
}

function getErrorDetails(err: unknown) {
  if (err && typeof err === 'object') {
    const maybeMessage = 'message' in err ? err.message : null;
    const maybeCode = 'code' in err ? err.code : null;
    return { message: String(maybeMessage || 'Unknown error'), code: maybeCode ? String(maybeCode) : undefined };
  }
  return { message: String(err) };
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
    resumeParsed: Boolean(candidate.resume_raw_text || candidate.work_experience),
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

  if (!script || !Array.isArray(script.sections)) {
    result.qaStatus = 'FAIL';
    result.failReasons.push('No interview script generated');
    return result;
  }

  const sections = script.sections as Array<Record<string, unknown>>;
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

  const coreQuestions = allQuestions.filter((q) => q.isCore);
  const specificQuestions = allQuestions.filter((q) => !q.isCore);

  result.coreQuestionsCount = coreQuestions.length;
  result.specificQuestionsCount = specificQuestions.length;

  for (const sq of specificQuestions) {
    const hasBasis = sq.resumeBasis.length > 10 && sq.resumeBasis !== 'Not specified';
    const evidenceStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'MISSING' = !hasBasis
      ? 'MISSING'
      : sq.resumeBasis.length > 50
        ? 'STRONG'
        : sq.resumeBasis.length > 20
          ? 'MODERATE'
          : 'WEAK';

    result.candidateSpecificQuestions.push({
      question: sq.question,
      resumeBasis: sq.resumeBasis,
      hasEvidence: hasBasis,
      evidenceStrength,
    });

    if (hasBasis) result.evidenceBackedCount++;
    else result.missingEvidenceCount++;
  }

  result.personalizationPct = result.specificQuestionsCount > 0
    ? Math.round((result.evidenceBackedCount / result.specificQuestionsCount) * 100)
    : 0;

  const specificQTexts = specificQuestions.map((q) => q.question);
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

  const leakage = detectCrossLeakage(name, specificQTexts, allCandidates);
  if (leakage.length > 0) {
    result.crossCandidateLeakage = true;
    result.leakageDetails = leakage;
  }

  const expectedFocus = CANDIDATE_EXPECTED_FOCUS[normalizeText(name)] || [];
  const allQText = allQuestions.map((q) => normalizeText(q.question)).join(' ');
  const missingFocus = expectedFocus.filter((focus) => !allQText.includes(focus));

  if (
    result.crossCandidateLeakage ||
    result.specificQuestionsCount === 0 ||
    (result.specificQuestionsCount > 0 && result.evidenceBackedCount === 0)
  ) {
    result.qaStatus = 'FAIL';
    if (result.crossCandidateLeakage) result.failReasons.push('Cross-candidate context leakage detected');
    if (result.specificQuestionsCount === 0) result.failReasons.push('No candidate-specific questions generated');
    if (result.evidenceBackedCount === 0 && result.specificQuestionsCount > 0) {
      result.failReasons.push('All candidate-specific questions lack resume evidence');
    }
  } else if (
    result.specificQuestionsCount < 5 ||
    result.missingEvidenceCount > 2 ||
    result.nearDuplicateCount > 3 ||
    result.personalizationPct < 60 ||
    missingFocus.length > 3
  ) {
    result.qaStatus = 'WARN';
    if (result.specificQuestionsCount < 5) {
      result.warnReasons.push(`Only ${result.specificQuestionsCount} candidate-specific questions (minimum 5 recommended)`);
    }
    if (result.missingEvidenceCount > 2) result.warnReasons.push(`${result.missingEvidenceCount} questions lack resume evidence`);
    if (result.nearDuplicateCount > 3) {
      result.warnReasons.push(`${result.nearDuplicateCount} near-duplicate questions detected across candidates`);
    }
    if (result.personalizationPct < 60) {
      result.warnReasons.push(`Personalization coverage only ${result.personalizationPct}% (target: 100%)`);
    }
    if (missingFocus.length > 3) {
      result.warnReasons.push(`Missing expected focus areas: ${missingFocus.slice(0, 3).join(', ')}`);
    }
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateIds } = await req.json().catch(() => ({}));

    let query = supabase
      .from('candidates')
      .select('id, full_name, interview_script, resume_raw_text, work_experience, seed_fit_notes, candidate_rank')
      .not('interview_script', 'is', null)
      .order('candidate_rank', { ascending: true, nullsFirst: false });

    if (candidateIds && Array.isArray(candidateIds) && candidateIds.length > 0) {
      query = query.in('id', candidateIds);
    }

    const [{ data: candidates, error: fetchErr }, { count: totalCandidatesCount }, { count: scriptedCandidatesCount }] = await Promise.all([
      query,
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('candidates').select('id', { count: 'exact', head: true }).not('interview_script', 'is', null),
    ]);

    if (fetchErr) throw fetchErr;

    const configuration = buildConfiguration(totalCandidatesCount || 0, scriptedCandidatesCount || 0, 0);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        {
          error: 'No saved interview scripts were found. Generate candidate scripts first, then run the offline QA audit.',
          configuration,
        },
        { status: 409 }
      );
    }

    const allCandidateData = candidates.map((c) => {
      const script = c.interview_script as Record<string, unknown> | null;
      const specificQuestions: string[] = [];

      if (script && Array.isArray(script.sections)) {
        for (const section of script.sections as Array<Record<string, unknown>>) {
          if (!Array.isArray(section.questions)) continue;
          for (const q of section.questions as Array<Record<string, unknown>>) {
            if (!q.isCore) specificQuestions.push(String(q.questionText || ''));
          }
        }
      }

      return {
        name: String(c.full_name || ''),
        specificQuestions,
        resumeText: String(c.resume_raw_text || c.seed_fit_notes || ''),
      };
    });

    const qaResults: QAResult[] = [];
    for (const candidate of candidates) {
      qaResults.push(await runQAForCandidate(candidate as Record<string, unknown>, allCandidateData));
    }

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
        model: INTERVIEW_SCRIPT_MODEL,
      });
    }

    const summary = {
      totalCandidates: qaResults.length,
      pass: qaResults.filter((r) => r.qaStatus === 'PASS').length,
      warn: qaResults.filter((r) => r.qaStatus === 'WARN').length,
      fail: qaResults.filter((r) => r.qaStatus === 'FAIL').length,
      crossCandidateLeakageDetected: qaResults.some((r) => r.crossCandidateLeakage),
      averagePersonalizationPct: qaResults.length > 0
        ? Math.round(qaResults.reduce((sum, r) => sum + r.personalizationPct, 0) / qaResults.length)
        : 0,
      runAt: now,
    };

    return NextResponse.json({
      results: qaResults,
      summary,
      configuration: buildConfiguration(totalCandidatesCount || 0, scriptedCandidatesCount || 0, qaResults.length),
    });
  } catch (err) {
    console.error('[batch-qa POST]', err);
    return NextResponse.json(
      { error: 'Failed to run batch QA', details: getErrorDetails(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');

    let resultsQuery = supabase
      .from('candidate_qa_results')
      .select(`
        id,
        candidate_id,
        run_at,
        resume_parsed,
        specific_questions_count,
        evidence_backed_count,
        missing_evidence_count,
        near_duplicate_count,
        cross_candidate_leakage,
        personalization_pct,
        qa_status,
        core_questions_count,
        candidate_specific_questions,
        duplicate_matches,
        leakage_details,
        warn_reasons,
        fail_reasons,
        model,
        candidates(full_name)
      `)
      .order('run_at', { ascending: false })
      .limit(RESULTS_LIMIT);

    if (candidateId) {
      resultsQuery = resultsQuery.eq('candidate_id', candidateId);
    }

    const [{ data, error }, { count: totalCandidatesCount }, { count: scriptedCandidatesCount }] = await Promise.all([
      resultsQuery,
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('candidates').select('id', { count: 'exact', head: true }).not('interview_script', 'is', null),
    ]);

    if (error) throw error;

    const latestByCandidate = new Map<string, QAResult>();
    for (const row of data || []) {
      if (latestByCandidate.has(row.candidate_id)) continue;
      const relation = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates;
      latestByCandidate.set(row.candidate_id, {
        candidateId: row.candidate_id,
        candidateName: relation?.full_name || 'Unknown candidate',
        resumeParsed: row.resume_parsed,
        specificQuestionsCount: row.specific_questions_count,
        evidenceBackedCount: row.evidence_backed_count,
        missingEvidenceCount: row.missing_evidence_count,
        nearDuplicateCount: row.near_duplicate_count,
        crossCandidateLeakage: row.cross_candidate_leakage,
        personalizationPct: Number(row.personalization_pct) || 0,
        qaStatus: row.qa_status,
        coreQuestionsCount: row.core_questions_count,
        candidateSpecificQuestions: row.candidate_specific_questions || [],
        duplicateMatches: row.duplicate_matches || [],
        leakageDetails: row.leakage_details || [],
        warnReasons: row.warn_reasons || [],
        failReasons: row.fail_reasons || [],
      });
    }

    const results = Array.from(latestByCandidate.values());
    const summary = buildSummary(results, data?.[0]?.run_at || null);

    return NextResponse.json({
      results,
      summary,
      configuration: buildConfiguration(totalCandidatesCount || 0, scriptedCandidatesCount || 0, results.length),
    });
  } catch (err) {
    console.error('[batch-qa GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch QA results', details: getErrorDetails(err) },
      { status: 500 }
    );
  }
}
