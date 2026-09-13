// Keeps the candidates table's pipeline/aggregate fields (used by the Candidate
// Pipeline kanban/table view) in sync whenever a scorecard is saved — manually
// via the teleprompter, or automatically from an AI-conducted Vapi interview.

export const SCORECARD_COMPETENCY_KEYS = [
  'vacation_rental_knowledge', 'property_management_knowledge', 'luxury_homeowner_communication',
  'outbound_calling_ability', 'consultative_sales', 'discovery_questioning', 'objection_handling',
  'closing_ability', 'follow_up_discipline', 'crm_pipeline_management', 'relationship_building',
  'professional_communication', 'self_motivation', 'remote_work_discipline', 'coachability',
  'operational_understanding', 'business_development', 'judgment', 'organization', 'overall_fit',
] as const;

const COMPETENCY_LABELS: Record<string, string> = {
  vacation_rental_knowledge: 'Vacation Rental Knowledge',
  property_management_knowledge: 'Property Management',
  luxury_homeowner_communication: 'Luxury Homeowner Communication',
  outbound_calling_ability: 'Outbound Calling',
  consultative_sales: 'Consultative Sales',
  discovery_questioning: 'Discovery / Questioning',
  objection_handling: 'Objection Handling',
  closing_ability: 'Closing Ability',
  follow_up_discipline: 'Follow-Up Discipline',
  crm_pipeline_management: 'CRM / Pipeline Management',
  relationship_building: 'Relationship Building',
  professional_communication: 'Professional Communication',
  self_motivation: 'Self-Motivation',
  remote_work_discipline: 'Remote Work Discipline',
  coachability: 'Coachability',
  operational_understanding: 'Operational Understanding',
  business_development: 'Business Development',
  judgment: 'Judgment',
  organization: 'Organization',
  overall_fit: 'Overall Fit',
};

function averageOf(scorecard: Record<string, unknown>): number | null {
  const values = SCORECARD_COMPETENCY_KEYS
    .map((key) => Number(scorecard[key]))
    .filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function topStrengthOf(scorecard: Record<string, unknown>): string | null {
  let bestKey: string | null = null;
  let bestValue = -Infinity;
  for (const key of SCORECARD_COMPETENCY_KEYS) {
    if (key === 'overall_fit') continue;
    const value = Number(scorecard[key]);
    if (Number.isFinite(value) && value > bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }
  return bestKey ? COMPETENCY_LABELS[bestKey] : null;
}

// Minimal shape shared by both the admin client (supabase-js) and the server/user client.
type MinimalSupabaseClient = {
  from: (table: string) => any;
};

export async function syncCandidatePipelineFields(supabase: MinimalSupabaseClient, candidateId: string) {
  const { data: scorecards } = await supabase
    .from('candidate_scorecards')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: true });

  if (!scorecards || scorecards.length === 0) return;

  const latest = scorecards[scorecards.length - 1];
  const averages = scorecards.map(averageOf).filter((n): n is number => n !== null);
  const latestAverage = averageOf(latest);
  const overallAverage = averages.length > 0 ? averages.reduce((sum, n) => sum + n, 0) / averages.length : null;

  const { data: candidate } = await supabase
    .from('candidates')
    .select('pipeline_status, first_interview_at')
    .eq('id', candidateId)
    .maybeSingle();

  // Only auto-advance candidates still sitting at the default stage — never override a human's manual drag/drop.
  const shouldAdvanceStage = !candidate?.pipeline_status || candidate.pipeline_status === 'READY_TO_INTERVIEW';

  await supabase
    .from('candidates')
    .update({
      ...(shouldAdvanceStage ? { pipeline_status: 'INTERVIEWED' } : {}),
      interview_count: scorecards.length,
      first_interview_at: candidate?.first_interview_at || latest.created_at,
      latest_interview_at: latest.created_at,
      latest_scorecard_average: latestAverage,
      average_score_across_interviews: overallAverage,
      top_strength: topStrengthOf(latest),
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);
}
