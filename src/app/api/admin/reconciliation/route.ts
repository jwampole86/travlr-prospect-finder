import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';

/**
 * GET /api/admin/reconciliation
 *
 * Returns a live reconciliation table comparing database counts against
 * the definitions used by the Dashboard and Lead Management.
 *
 * Every metric is computed directly from the production database using
 * COUNT(DISTINCT id) — no caching, no stale data, no hardcoded values.
 *
 * METRIC DEFINITIONS:
 *   Total Leads       — COUNT(DISTINCT id) WHERE is_synthetic IS NOT TRUE
 *   High Priority     — score >= 75 AND stage NOT IN ('Not a Fit','Closed','Archived')
 *   Avg Score         — ROUND(AVG(prospect_score)) WHERE score > 0
 *   Action Needed     — score >= 75 AND stage = 'New Lead'
 *   Fully Verified    — verified_owner=true AND verified_address IS NOT NULL AND verified_number=true
 *   Phone Available   — contact_phone IS NOT NULL AND contact_phone <> ''
 *   Unassigned Prio   — primary_agent_id IS NULL AND score >= 75 AND not terminal
 *   Assigned          — primary_agent_id IS NOT NULL
 *   STR Eligible      — regulation_status = 'Allowed' *   Active Pipeline   — stage IN ('Contacted','Interested','Proposal Sent','Under Contract')
 */
export async function GET() {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Use the reconciliation view if available, otherwise run individual queries
    const { data: viewData, error: viewError } = await supabase
      .from('v_dashboard_reconciliation')
      .select('*')
      .single();

    if (!viewError && viewData) {
      const d = viewData as Record<string, number | string>;

      // Build reconciliation table
      const metrics = [
        {
          metric: 'Total Leads',
          database: Number(d.total_leads),
          definition: 'COUNT(DISTINCT id) WHERE is_synthetic IS NOT TRUE',
          dashboard_field: 'totalLeads',
          lead_management_filter: '/lead-management (no filter)',
        },
        {
          metric: 'High Priority',
          database: Number(d.high_priority),
          definition: 'prospect_score >= 75 AND stage NOT IN (Not a Fit, Closed, Archived)',
          dashboard_field: 'highPriority',
          lead_management_filter: '/lead-management?scoreMin=75',
        },
        {
          metric: 'Avg Score',
          database: Number(d.avg_score),
          definition: 'ROUND(AVG(prospect_score)) WHERE prospect_score > 0',
          dashboard_field: 'avgScore',
          lead_management_filter: 'N/A (aggregate)',
        },
        {
          metric: 'Action Needed',
          database: Number(d.action_needed),
          definition: 'prospect_score >= 75 AND stage = New Lead',
          dashboard_field: 'actionNeededLeads',
          lead_management_filter: '/lead-management?actionNeeded=true',
        },
        {
          metric: 'Fully Verified',
          database: Number(d.fully_verified),
          definition: 'verified_owner=true AND verified_address IS NOT NULL AND verified_number=true',
          dashboard_field: 'fullyVerified',
          lead_management_filter: '/lead-management?fullyVerified=true',
        },
        {
          metric: 'Phone Available',
          database: Number(d.phone_available),
          definition: 'contact_phone IS NOT NULL AND contact_phone <> empty',
          dashboard_field: 'phoneAvailable',
          lead_management_filter: '/lead-management?phoneAvailableOnly=true',
        },
        {
          metric: 'Unassigned Priority',
          database: Number(d.unassigned_priority),
          definition: 'primary_agent_id IS NULL AND score >= 75 AND not terminal',
          dashboard_field: 'unassignedPriority',
          lead_management_filter: '/lead-management?view=verified-priority&assignmentStatus=unassigned',
        },
        {
          metric: 'Assigned',
          database: Number(d.assigned_leads),
          definition: 'primary_agent_id IS NOT NULL',
          dashboard_field: 'assignedLeads',
          lead_management_filter: '/lead-management?assignmentStatus=assigned',
        },
        {
          metric: 'STR Eligible',
          database: Number(d.str_eligible),
          definition: 'regulation_status = Allowed (strict, not Allowed+Restricted)',
          dashboard_field: 'strEligible (via regulationFriendly)',
          lead_management_filter: '/lead-management?regulation=Allowed',
        },
        {
          metric: 'Active Pipeline',
          database: Number(d.active_pipeline),
          definition: 'stage IN (Contacted, Interested, Proposal Sent, Under Contract)',
          dashboard_field: 'activeLeads',
          lead_management_filter: '/lead-management?stages=Contacted&stages=Interested&stages=Proposal+Sent&stages=Under+Contract',
          note: 'Pipeline by Stage shows ALL stages including New Lead. Active Pipeline excludes New Lead (not yet worked) and terminal stages.',
        },
      ];

      // Stage breakdown
      const stageBreakdown = [
        { stage: 'New Lead', count: Number(d.stage_new_lead) },
        { stage: 'Contacted', count: Number(d.stage_contacted) },
        { stage: 'Interested', count: Number(d.stage_interested) },
        { stage: 'Proposal Sent', count: Number(d.stage_proposal_sent) },
        { stage: 'Under Contract', count: Number(d.stage_under_contract) },
        { stage: 'Live', count: Number(d.stage_live) },
        { stage: 'Not a Fit', count: Number(d.stage_not_a_fit) },
        { stage: 'Archived', count: Number(d.stage_archived) },
        { stage: 'Closed', count: Number(d.stage_closed) },
      ].filter(s => s.count > 0);

      const stageTotal = stageBreakdown.reduce((sum, s) => sum + s.count, 0);

      // Regulation breakdown
      const regulationBreakdown = [
        { status: 'Allowed', count: Number(d.reg_allowed) },
        { status: 'Restricted', count: Number(d.reg_restricted) },
        { status: 'Prohibited', count: Number(d.reg_prohibited) },
        { status: 'Unknown', count: Number(d.reg_unknown) },
      ].filter(r => r.count > 0);

      const regulationTotal = regulationBreakdown.reduce((sum, r) => sum + r.count, 0);

      return NextResponse.json({
        computed_at: d.computed_at,
        reconciliation_table: metrics,
        stage_breakdown: {
          stages: stageBreakdown,
          total: stageTotal,
          pipeline_total_note: `Pipeline by Stage total (${stageTotal}) = Total Leads (${Number(d.total_leads)}) — all stages shown`,
          active_pipeline_note: `Active Pipeline (${Number(d.active_pipeline)}) = only in-progress stages (Contacted → Under Contract)`,
        },
        regulation_breakdown: {
          statuses: regulationBreakdown,
          total: regulationTotal,
          str_eligible_note: `STR Eligible (${Number(d.str_eligible)}) uses regulation_status = 'Allowed' only. Regulation Status chart shows all ${regulationTotal} prospects.`,
        },
        definitions: {
          high_priority_threshold: 'prospect_score >= 75',
          terminal_stages: ['Not a Fit', 'Closed', 'Archived'],
          active_pipeline_stages: ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract'],
          action_needed_criteria: 'prospect_score >= 75 AND stage = New Lead',
          fully_verified_criteria: 'verified_owner=true AND verified_address IS NOT NULL/empty AND verified_number=true',
          phone_available_field: 'contact_phone (canonical phone field)',
          assignment_field: 'primary_agent_id (canonical, not agent_name text)',
          score_field: 'prospect_score (single field used for all score-based KPIs)',
          avg_score_population: 'All real prospects with prospect_score > 0 (full population, no sampling)',
          source_sync_protection: 'CSV-imported phone/verification data is protected from sync overwrites by trg_protect_csv_contact_data trigger',
        },
      });
    }

    // Fallback: run individual queries if view not available
    const base = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true);

    const [
      totalRes,
      highPriRes,
      actionNeededRes,
      fullyVerifiedRes,
      phoneAvailableRes,
      unassignedPriRes,
      assignedRes,
      strEligibleRes,
      activePipelineRes,
    ] = await Promise.all([
      base,
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).gte('prospect_score', 75).not('stage', 'in', '("Not a Fit","Closed","Archived")'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).gte('prospect_score', 75).eq('stage', 'New Lead'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('verified_owner', true).eq('verified_number', true).not('verified_address', 'is', null).neq('verified_address', '').neq('verified_address', 'false'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).not('contact_phone', 'is', null).neq('contact_phone', ''),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).is('primary_agent_id', null).gte('prospect_score', 75).not('stage', 'in', '("Not a Fit","Closed","Archived")'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).not('primary_agent_id', 'is', null),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('regulation_status', 'Allowed'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).in('stage', ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract']),
    ]);

    // Avg score from full population
    const { data: scoreData } = await supabase.from('leads').select('prospect_score').neq('is_synthetic', true).gt('prospect_score', 0);
    const scores = (scoreData as { prospect_score: number }[] | null) ?? [];
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, r) => s + r.prospect_score, 0) / scores.length) : 0;

    return NextResponse.json({
      computed_at: new Date().toISOString(),
      reconciliation_table: [
        { metric: 'Total Leads', database: totalRes.count ?? 0 },
        { metric: 'High Priority', database: highPriRes.count ?? 0 },
        { metric: 'Avg Score', database: avgScore },
        { metric: 'Action Needed', database: actionNeededRes.count ?? 0 },
        { metric: 'Fully Verified', database: fullyVerifiedRes.count ?? 0 },
        { metric: 'Phone Available', database: phoneAvailableRes.count ?? 0 },
        { metric: 'Unassigned Priority', database: unassignedPriRes.count ?? 0 },
        { metric: 'Assigned', database: assignedRes.count ?? 0 },
        { metric: 'STR Eligible', database: strEligibleRes.count ?? 0 },
        { metric: 'Active Pipeline', database: activePipelineRes.count ?? 0 },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[reconciliation] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
