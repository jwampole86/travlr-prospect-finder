export interface ReviewItem {
  id: string;
  lead_id: string;
  job_id: string | null;
  match_id: string | null;
  current_owner_name: string | null;
  suggested_owner_name: string | null;
  current_phone: string | null;
  suggested_phone: string | null;
  confidence: string | null;
  match_score: number | null;
  evidence: Record<string, unknown>;
  provider: string | null;
  reason: string | null;
  review_status: string;
  created_at: string;
  canonical_address?: string;
}
