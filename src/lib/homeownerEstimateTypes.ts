export type RegulationTone = 'good' | 'caution' | 'bad' | 'unknown';

export interface RegulationRequirement {
  label: string;
  value: string;
  /** true = something the owner must do, false = explicitly not required, null = informational */
  required: boolean | null;
}

export interface RegulationReport {
  found: boolean;
  jurisdiction: string;
  status: string;
  tone: RegulationTone;
  headline: string;
  summary: string;
  requirements: RegulationRequirement[];
  taxes: string | null;
  additional: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  lastVerified: string | null;
  aiResearched: boolean;
  /** Shown only when the city's own rules are not on file yet. */
  typicalChecklist: string[];
  note: string | null;
}

export interface EstimateScenario {
  key: 'conservative' | 'expected' | 'optimistic';
  label: string;
  occupancy: number;
  adr: number;
  grossMonthly: number;
  netMonthly: number;
  annualNet: number;
}

export interface EstimateCostLine {
  label: string;
  pct: number;
  monthly: number;
}

export interface FiveYearPoint {
  year: number;
  net: number;
  longTerm: number;
}

export interface HomeownerReport {
  address: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  basis: 'PROPERTY' | 'MARKET' | 'STATE';
  basisLabel: string;
  property: { beds: number | null; baths: number | null; type: string | null; assumedBeds: boolean };
  longTermRent: number;
  scenarios: EstimateScenario[];
  costs: EstimateCostLine[];
  advantageMonthly: number;
  advantageAnnual: number;
  advantagePct: number;
  fiveYear: FiveYearPoint[];
  fiveYearTotal: number;
  fiveYearLongTermTotal: number;
  regulation: RegulationReport;
  generatedAt: string;
}

export interface HomeownerEstimate {
  estimatedADR: number;
  estimatedOccupancy: number;
  grossMonthly: number;
  netMonthly: number;
  annualNet: number;
  regulationSummary: string;
  regulationStatus: 'permitted' | 'restricted' | 'unknown';
  report: HomeownerReport;
}
