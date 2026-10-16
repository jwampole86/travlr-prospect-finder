export interface TraceCandidate {
  leadId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  legacyRegulationStatus: string | null;
  canonicalStatus: string;
  jurisdictionName: string | null;
  confidence: string | null;
  reviewRequired: boolean;
  evaluatedAt: string;
  sourceLastVerifiedAt: string | null;
}
