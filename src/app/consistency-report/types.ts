export interface CandidateListItem {
  id: string;
  full_name: string;
  candidate_rank: number | null;
  interview_priority: string | null;
  candidate_status: string | null;
  pipeline_status: string | null;
  current_title: string | null;
  current_company: string | null;
  latest_interview_at: string | null;
  latest_scorecard_average: number | null;
  consistency_report_status: string | null;
}

export interface ConsistencyClaim {
  resumeClaim: string;
  resumeEvidence: string;
  interviewEvidence: string;
  status: 'VALIDATED' | 'PARTIALLY_VALIDATED' | 'NOT_YET_VALIDATED' | 'NEEDS_CLARIFICATION';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  analysis: string;
}

export interface NextStepTopic {
  topic: string;
  priority: 'HIGH' | 'MEDIUM' | 'OPTIONAL';
  reason: string;
}

export interface ConsistencyReportRecord {
  id: string;
  candidate_id: string;
  executive_summary: string | null;
  validated_claims: ConsistencyClaim[] | null;
  partially_validated_claims: ConsistencyClaim[] | null;
  not_yet_validated: ConsistencyClaim[] | null;
  needs_clarification: ConsistencyClaim[] | null;
  new_information: string[] | null;
  unanswered_questions: string[] | null;
  role_gaps: string[] | null;
  strongest_interview_evidence: string[] | null;
  next_step_topics: NextStepTopic[] | null;
  second_interview_questions: string[] | null;
  generation_status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  generation_error?: string | null;
  generated_at?: string | null;
  model?: string | null;
  prompt_version?: string | null;
}

export interface CandidateDetail {
  id: string;
  full_name: string;
  candidate_rank: number | null;
  interview_priority: string | null;
  pipeline_status: string | null;
  current_title: string | null;
  current_company: string | null;
  latest_interview_at: string | null;
  interview_count: number | null;
  latest_scorecard_average: number | null;
  top_strength: string | null;
  main_area_to_validate: string | null;
  consistency_report_status: string | null;
}

export interface ReadinessState {
  readyForAnalysis: boolean;
  resumeReady: boolean;
  notesCount: number;
  interviewCount: number;
  hasScorecard: boolean;
  hasInterviewerNotes: boolean;
  reportCount: number;
  blockers: string[];
  warnings: string[];
}

export interface ConsistencyReportResponse {
  report: ConsistencyReportRecord | null;
  candidate: CandidateDetail;
  readiness: ReadinessState;
  meta: {
    model: string;
    promptVersion: string;
    apiKeyConfigured: boolean;
    browserKeyExposed: boolean;
  };
}
