import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

import type { TraceCandidate } from './components/types';

type EvaluationRow = {
  lead_id: string;
  city_regulation_status: string;
  confidence: string | null;
  review_required: boolean | null;
  evaluated_at: string;
  jurisdiction_name: string | null;
  source_last_verified_at: string | null;
};

type LeadRow = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  regulation_status: string | null;
};

export async function getRecentTraceCandidates(): Promise<TraceCandidate[]> {
  const db = getSupabaseAdmin();
  const { data: evaluationRows, error } = await db
    .from('property_regulation_evaluations')
    .select('lead_id, city_regulation_status, confidence, review_required, evaluated_at, jurisdiction_name, source_last_verified_at')
    .order('evaluated_at', { ascending: false })
    .limit(12);

  if (error) throw new Error(error.message);
  const evaluations = (evaluationRows ?? []) as EvaluationRow[];
  const leadIds = evaluations.map((row) => row.lead_id);

  const { data: leadRows, error: leadError } = leadIds.length
    ? await db.from('leads').select('id, address, city, state, regulation_status').in('id', leadIds)
    : { data: [], error: null };
  if (leadError) throw new Error(leadError.message);

  const leadsById = new Map(((leadRows ?? []) as LeadRow[]).map((row) => [row.id, row]));

  return evaluations.map((row) => {
    const lead = leadsById.get(row.lead_id);
    return {
      leadId: row.lead_id,
      address: lead?.address ?? null,
      city: lead?.city ?? null,
      state: lead?.state ?? null,
      legacyRegulationStatus: lead?.regulation_status ?? null,
      canonicalStatus: row.city_regulation_status,
      jurisdictionName: row.jurisdiction_name,
      confidence: row.confidence,
      reviewRequired: row.review_required ?? false,
      evaluatedAt: row.evaluated_at,
      sourceLastVerifiedAt: row.source_last_verified_at,
    };
  });
}
