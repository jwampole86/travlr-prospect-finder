import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { SellerIntent } from './sellerIntent';
import type { ServiceLine } from './types';

type Db = ReturnType<typeof getSupabaseAdmin>;

export type LeadFacts = {
  id: string;
  city: string | null;
  state: string | null;
  price_type: string | null;
  regulation_status: string | null;
  estimated_net_monthly: number | null;
};

export type FitSuggestion = { serviceLine: ServiceLine; score: number; reasons: string[]; cautions: string[] };

const LICENSING_CAUTION: Partial<Record<string, string>> = {
  CO: 'Colorado can require a broker license for property management and leasing done for compensation. Confirm licensing before offering this.',
};

/**
 * Suggests which services might fit. These are starting points for a person to review: nothing here approves a service,
 * decides eligibility or sets compensation.
 */
export function suggestFit(lead: LeadFacts, intent: SellerIntent): FitSuggestion[] {
  const out: FitSuggestion[] = [];
  const state = (lead.state || '').toUpperCase();
  const licensing = LICENSING_CAUTION[state];
  const strRestricted = lead.regulation_status === 'Prohibited' || lead.regulation_status === 'Restricted';
  const strOk = lead.regulation_status === 'Allowed';
  const months = Number((intent.timeline || '').match(/(\d+)\s*month/)?.[1] ?? NaN);

  if (intent.level !== 'none') {
    out.push({
      serviceLine: 'sale_partner',
      score: intent.level === 'explicit' ? 85 : 45,
      reasons: intent.signals,
      cautions: ['Sale representation and referral fees need a licensed partner and a lawful fee structure.'],
    });
  }

  const ltReasons: string[] = [];
  if (intent.keepsRental) ltReasons.push('The owner mentioned keeping or renting the property.');
  if (lead.price_type === 'rent') ltReasons.push('The property is listed for rent.');
  out.push({
    serviceLine: 'long_term_management',
    score: ltReasons.length ? 60 : 30,
    reasons: ltReasons.length ? ltReasons : ['Possible if the owner decides to keep the property.'],
    cautions: licensing ? [licensing] : [],
  });

  const strReasons: string[] = [];
  if (strOk) strReasons.push('The local short-term rental status reads Allowed.');
  if ((lead.estimated_net_monthly ?? 0) > 0) strReasons.push(`Estimated net about $${Math.round(lead.estimated_net_monthly as number).toLocaleString()} a month.`);
  const strCautions: string[] = [];
  if (strRestricted) strCautions.push(`Short-term rentals are ${String(lead.regulation_status).toLowerCase()} here.`);
  if (lead.regulation_status === 'Unknown' || !lead.regulation_status) strCautions.push('Short-term rental rules are not confirmed for this address.');
  out.push({ serviceLine: 'str_management', score: strOk ? 65 : strRestricted ? 10 : 35, reasons: strReasons, cautions: strCautions });

  if (intent.level !== 'none' && Number.isFinite(months) && months >= 3 && months <= 8) {
    out.push({
      serviceLine: 'interim_rental',
      score: strRestricted ? 10 : 55,
      reasons: [`Plans to sell in about ${months} months.`],
      cautions: [
        'A short-term rental is not a universal bridge: local rules, financing, insurance and the owner\'s occupancy all matter.',
        ...(strRestricted ? [`Short-term rentals are ${String(lead.regulation_status).toLowerCase()} here.`] : []),
        ...(licensing ? [licensing] : []),
      ],
    });
  }

  out.push({
    serviceLine: 'readiness_services',
    score: intent.level === 'none' ? 20 : 40,
    reasons: ['Cleaning, photos, landscaping or repairs before a sale or rental.'],
    cautions: ['Price services separately, use qualified vendors, and do not imply NAVEO performs licensed inspection, appraisal or construction work.'],
  });
  return out;
}

export function fitScore(suggestions: FitSuggestion[]): number {
  return suggestions.reduce((best, s) => Math.max(best, s.score), 0);
}

export async function loadLeadFacts(db: Db, leadId: string): Promise<LeadFacts | null> {
  const { data } = await db.from('leads').select('id, city, state, price_type, regulation_status, estimated_net_monthly').eq('id', leadId).maybeSingle();
  return (data as LeadFacts | null) ?? null;
}
