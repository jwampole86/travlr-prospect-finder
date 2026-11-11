import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';

type Db = ReturnType<typeof getSupabaseAdmin>;

/**
 * Gives a lead created without an estimate (a NAVEO form) the same figures the homeowner estimate page shows for its address, so what
 * AVYRO stores, recommends and shares with NAVEO matches what the owner was shown. Does nothing when the lead already has an estimate
 * or the address is not a real street address (the owner gave only an area), so a placeholder is never turned into a number.
 */
export async function fillEstimateForNewLead(db: Db, leadId: string, address: string | null | undefined, city?: string | null, state?: string | null): Promise<boolean> {
  if (!address || !/^\d/.test(address.trim()) || !state) return false;
  const { data: lead } = await db.from('leads').select('estimated_net_monthly,calculation_version').eq('id', leadId).maybeSingle();
  if (!lead || lead.calculation_version || Number(lead.estimated_net_monthly) > 0) return false;

  const report = await buildHomeownerReport([address, city, state].filter(Boolean).join(', ')).catch(() => null);
  const expected = report?.scenarios.find((s) => s.key === 'expected');
  if (!report || !expected) return false;
  const now = new Date().toISOString();
  const { error } = await db.from('leads').update({
    estimated_adr: expected.adr, estimated_occupancy: expected.occupancy, estimated_gross_monthly: expected.grossMonthly, estimated_net_monthly: expected.netMonthly,
    estimated_monthly_rent_ai: report.longTermRent, estimated_monthly_rent_ai_source: 'HOMEOWNER_ESTIMATE', estimated_monthly_rent_ai_confidence: report.basis === 'PROPERTY' ? 'MEDIUM' : 'LOW', estimated_monthly_rent_ai_at: now,
    calculation_version: 'homeowner-estimate', calculated_at: now,
  }).eq('id', leadId);
  return !error;
}
