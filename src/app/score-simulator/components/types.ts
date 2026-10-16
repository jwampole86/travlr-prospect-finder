import type {
  ProspectScoringInput,
  ProspectScoringWeights,
  ProspectScoreResult,
} from '@/lib/scoring/prospectScoring';

export interface LeadSimulationSample {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  stage: string | null;
  createdAt: string | null;
  storedScore: number;
  scoreModelVersion: string | null;
  input: ProspectScoringInput;
  baseline: ProspectScoreResult;
}

export interface SimulatedLeadRow extends LeadSimulationSample {
  simulated: ProspectScoreResult;
  delta: number;
  storedDelta: number;
  primaryFactor: string;
}

export interface RegionalSignalRow {
  region: string;
  property_type: string;
  conversion_rate: number;
  avg_converted_score: number;
  avg_lost_score: number;
  suggested_threshold: number;
  sample_count: number;
  last_updated: string;
}

export interface ScoreSimulatorSummary {
  totalActiveLeads: number;
  currentModelLeads: number;
  feedbackCount: number;
  signalCount: number;
}

export type SortKey = 'simulated' | 'delta-desc' | 'delta-asc' | 'baseline' | 'newest';
export type SimulatorTab = 'weights' | 'signals' | 'preview';
export type WeightConfig = ProspectScoringWeights;
