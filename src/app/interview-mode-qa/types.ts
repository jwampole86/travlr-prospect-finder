export interface QAResult {
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

export interface QASummary {
  totalCandidates: number;
  pass: number;
  warn: number;
  fail: number;
  crossCandidateLeakageDetected: boolean;
  averagePersonalizationPct: number;
  runAt: string;
}

export interface QAConfiguration {
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

export interface QAResponse {
  results: QAResult[];
  summary: QASummary | null;
  configuration: QAConfiguration;
}
