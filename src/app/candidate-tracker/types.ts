export type PipelineStatus =
  | 'READY_TO_INTERVIEW'
  | 'INTERVIEWED'
  | 'FOLLOW_UP'
  | 'HOLD'
  | 'MOVE_FORWARD'
  | 'NOT_MOVING_FORWARD'
  | 'HIRED';

export interface PipelineCandidate {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  candidate_rank?: number | null;
  interview_priority?: string | null;
  candidate_status?: string | null;
  pipeline_status: PipelineStatus;
  current_title?: string | null;
  current_company?: string | null;
  city?: string | null;
  state?: string | null;
  latest_interview_at?: string | null;
  next_interview_at?: string | null;
  next_interview_type?: string | null;
  interview_count?: number | null;
  latest_scorecard_average?: number | null;
  average_score_across_interviews?: number | null;
  top_strength?: string | null;
  main_area_to_validate?: string | null;
  consistency_report_status?: string | null;
  next_action?: string | null;
  seed_fit_notes?: string | null;
  seed_concerns?: string | null;
  vacation_rental_experience?: boolean | null;
  outbound_calling_experience?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PipelineCounts {
  total: number;
  READY_TO_INTERVIEW: number;
  INTERVIEWED: number;
  FOLLOW_UP: number;
  HOLD: number;
  MOVE_FORWARD: number;
  HIRED: number;
  NOT_MOVING_FORWARD: number;
}

export interface PipelineResponse {
  candidates: PipelineCandidate[];
  counts: PipelineCounts;
}
