import 'server-only';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';

export interface LeadFill {
  adr: number; occupancy: number; grossMonthly: number; netMonthly: number; marketRent: number;
  basis: 'PROPERTY' | 'MARKET' | 'STATE'; basisLabel: string; assumedBeds: boolean;
}

/** The same revenue model the homeowner report uses, so an agent sees the numbers the homeowner would. Nothing is saved: it only fills blanks on screen. */
export async function estimateFill(lead: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }): Promise<LeadFill | null> {
  if (!lead.address || !lead.state) return null;
  const report = await buildHomeownerReport([lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')).catch(() => null);
  const exp = report?.scenarios.find(s => s.key === 'expected');
  if (!report || !exp) return null;
  return { adr: exp.adr, occupancy: exp.occupancy, grossMonthly: exp.grossMonthly, netMonthly: exp.netMonthly, marketRent: report.longTermRent, basis: report.basis, basisLabel: report.basisLabel, assumedBeds: report.property.assumedBeds };
}

/** Days on market as recorded, else counted from the listing date, else (for a lead that came from a listing) from when we first saw it. Null when the lead was never a listing. */
export function daysOnMarketOf(l: { days_on_market?: number | null; days_on_market_listing?: number | null; listing_date?: string | null; listing_url?: string | null; first_seen_at?: string | null; created_at?: string | null }): { days: number; basis: 'recorded' | 'listing_date' | 'first_seen' } | null {
  if (Number(l.days_on_market) > 0) return { days: Number(l.days_on_market), basis: 'recorded' };
  if (Number(l.days_on_market_listing) > 0) return { days: Number(l.days_on_market_listing), basis: 'recorded' };
  const since = (iso?: string | null) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) && t <= Date.now() ? Math.floor((Date.now() - t) / 86_400_000) : null; };
  const fromListing = since(l.listing_date); if (fromListing != null) return { days: fromListing, basis: 'listing_date' };
  const seen = l.listing_url ? since(l.first_seen_at ?? l.created_at) : null;
  return seen != null ? { days: seen, basis: 'first_seen' } : null;
}
