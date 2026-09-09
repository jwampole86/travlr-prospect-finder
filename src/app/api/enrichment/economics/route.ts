import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/enrichment/economics
 * Returns enrichment economics: monthly spend, cost per outcome, coverage metrics.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const monthStart = new Date();
    monthStart?.setDate(1);
    monthStart?.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart?.toISOString();

    const [costRes, jobsRes, leadsRes, settingsRes] = await Promise.all([
      supabase?.from('enrichment_cost_records')?.select('estimated_cost_cents, success, result_type, provider')?.gte('created_at', monthStartStr),
      supabase?.from('enrichment_jobs')?.select('job_status, match_confidence')?.gte('created_at', monthStartStr),
      supabase?.from('leads')?.select('verified_owner, verified_address, verified_number, contact_phone, fully_verified')?.eq('is_synthetic', false),
      supabase?.from('enrichment_settings')?.select('setting_key, setting_value')?.in('setting_key', ['monthly_budget_cents', 'budget_warn_pct']),
    ]);

    const costs = costRes?.data || [];
    const jobs = jobsRes?.data || [];
    const leads = leadsRes?.data || [];
    const settings = Object.fromEntries((settingsRes?.data || [])?.map(s => [s?.setting_key, s?.setting_value]));

    const monthlyBudgetCents = parseInt(settings?.monthly_budget_cents || '50000');
    const budgetWarnPct = parseInt(settings?.budget_warn_pct || '80');

    // Cost calculations
    const totalCostCents = costs?.reduce((sum, c) => sum + (c?.estimated_cost_cents || 0), 0);
    const requestsThisMonth = costs?.length;
    const successfulCosts = costs?.filter(c => c?.success);

    const ownersFound = costs?.filter(c => c?.result_type === 'OWNER_FOUND' || c?.result_type === 'BOTH_FOUND')?.length;
    const phonesFound = costs?.filter(c => c?.result_type === 'PHONE_FOUND' || c?.result_type === 'BOTH_FOUND')?.length;
    const emailsFound = costs?.filter(c => c?.result_type === 'EMAIL_FOUND')?.length;

    // Job outcomes
    const fullyVerifiedNew = jobs?.filter(j => j?.job_status === 'FOUND' && j?.match_confidence === 'VERIFIED')?.length;
    const reviewRequired = jobs?.filter(j => j?.job_status === 'REVIEW_REQUIRED')?.length;
    const noMatch = jobs?.filter(j => j?.job_status === 'NO_MATCH')?.length;
    const propertiesProcessed = jobs?.filter(j => j?.job_status !== 'PENDING' && j?.job_status !== 'RUNNING')?.length;

    // Coverage metrics (canonical DB)
    const totalLeads = leads?.length;
    const ownerVerified = leads?.filter(l => l?.verified_owner)?.length;
    const addressVerified = leads?.filter(l => l?.verified_address)?.length;
    const phoneVerified = leads?.filter(l => l?.verified_number)?.length;
    const fullyVerified = leads?.filter(l => l?.fully_verified)?.length;
    const missingOwner = leads?.filter(l => !l?.verified_owner)?.length;
    const missingPhone = leads?.filter(l => !l?.contact_phone)?.length;

    // Cost per outcome
    const costPerProperty = propertiesProcessed > 0 ? totalCostCents / propertiesProcessed : 0;
    const costPerOwner = ownersFound > 0 ? totalCostCents / ownersFound : 0;
    const costPerPhone = phonesFound > 0 ? totalCostCents / phonesFound : 0;
    const costPerFullyVerified = fullyVerifiedNew > 0 ? totalCostCents / fullyVerifiedNew : 0;

    // Budget status
    const budgetUsedPct = monthlyBudgetCents > 0 ? (totalCostCents / monthlyBudgetCents) * 100 : 0;
    const budgetStatus = budgetUsedPct >= 100 ? 'EXCEEDED' : budgetUsedPct >= budgetWarnPct ? 'WARNING' : 'OK';

    return NextResponse?.json({
      // Monthly spend
      requestsThisMonth,
      estimatedSpendCents: totalCostCents,
      estimatedSpendDollars: (totalCostCents / 100)?.toFixed(2),
      monthlyBudgetCents,
      monthlyBudgetDollars: (monthlyBudgetCents / 100)?.toFixed(2),
      budgetUsedPct: parseFloat(budgetUsedPct?.toFixed(1)),
      budgetStatus,

      // Outcomes
      propertiesProcessed,
      ownersFound,
      phonesFound,
      emailsFound,
      fullyVerifiedNew,
      reviewRequired,
      noMatch,

      // Cost per outcome (in cents)
      costPerPropertyCents: Math.round(costPerProperty),
      costPerOwnerCents: Math.round(costPerOwner),
      costPerPhoneCents: Math.round(costPerPhone),
      costPerFullyVerifiedCents: Math.round(costPerFullyVerified),

      // Coverage (canonical DB)
      coverage: {
        totalLeads,
        ownerVerified,
        addressVerified,
        phoneVerified,
        fullyVerified,
        missingOwner,
        missingPhone,
        ownerVerifiedPct: totalLeads > 0 ? parseFloat(((ownerVerified / totalLeads) * 100)?.toFixed(1)) : 0,
        phoneVerifiedPct: totalLeads > 0 ? parseFloat(((phoneVerified / totalLeads) * 100)?.toFixed(1)) : 0,
        fullyVerifiedPct: totalLeads > 0 ? parseFloat(((fullyVerified / totalLeads) * 100)?.toFixed(1)) : 0,
      },
    });
  } catch (err) {
    console.error('[Enrichment Economics] GET error:', err);
    return NextResponse?.json({ error: 'Internal server error' }, { status: 500 });
  }
}
