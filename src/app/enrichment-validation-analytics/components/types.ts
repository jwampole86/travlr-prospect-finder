export type Timeframe = '24h' | '7d' | '30d';

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  cacheHits: number;
  passRate: number;
  avgOverallConfidence: number;
  avgOwnershipConfidence: number;
  avgMarketCompConfidence: number;
}

export interface SourceBreakdown {
  source: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgConfidence: number;
  cacheHits: number;
  lastValidated: string | null;
}

export interface FieldConfidenceDist {
  field: string;
  avgConfidence: number;
  low: number;
  medium: number;
  high: number;
  total: number;
}

export interface AnomalyEntry {
  anomaly: string;
  count: number;
}

export interface TrendPoint {
  date: string;
  passed: number;
  failed: number;
  passRate: number;
  avgConfidence: number;
}

export interface RecentEvent {
  id: string;
  lead_id: string;
  source: string | null;
  passed: boolean;
  overall_confidence: number | null;
  ownership_confidence: number | null;
  market_comp_confidence: number | null;
  recommendation: string | null;
  cache_hit: boolean;
  field_confidence_scores?: Array<{ field?: string; confidence?: number }>;
  anomalies: string[] | null;
  created_at: string;
}
