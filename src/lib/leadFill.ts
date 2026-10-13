import 'server-only';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';

export interface LeadFill {
  adr: number; occupancy: number; grossMonthly: number; netMonthly: number; marketRent: number;
  basis: 'PROPERTY' | 'MARKET' | 'STATE'; basisLabel: string; assumedBeds: boolean;
  /** airdna: AirDNA's own figures for this address. model: the bedroom model, calibrated to AirDNA. */
  source: 'airdna' | 'airdna_area' | 'model';
}

/** The same revenue model the homeowner report uses, so an agent sees the numbers the homeowner would. Nothing is saved: it only fills blanks on screen. */
export async function estimateFill(lead: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }): Promise<LeadFill | null> {
  if (!lead.address || !lead.state) return null;
  const report = await buildHomeownerReport([lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')).catch(() => null);
  const exp = report?.scenarios.find(s => s.key === 'expected');
  if (!report || !exp) return null;
  return { adr: exp.adr, occupancy: exp.occupancy, grossMonthly: exp.grossMonthly, netMonthly: exp.netMonthly, marketRent: report.longTermRent, basis: report.basis, basisLabel: report.basisLabel, assumedBeds: report.property.assumedBeds, source: report.basisLabel.startsWith('Built from AirDNA data for similar') ? 'airdna_area' : report.basisLabel.startsWith('Built from AirDNA') ? 'airdna' : 'model' };
}

/** Live days on market, with a one-line basis. A recorded count is a snapshot from the day the listing was last checked, so the days since are added. Null when no date is on file. */
export function daysOnMarketOf(l: { days_on_market?: number | null; days_on_market_listing?: number | null; listing_date?: string | null; listing_url?: string | null; first_seen_at?: string | null; created_at?: string | null; last_checked?: string | null }): { days: number; basis: 'listing_date' | 'recorded' | 'first_seen'; note: string } | null {
  const dayMs = 86_400_000;
  const ts = (iso?: string | null) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) && t <= Date.now() ? t : null; };
  const since = (iso?: string | null) => { const t = ts(iso); return t == null ? null : Math.floor((Date.now() - t) / dayMs); };
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const listed = since(l.listing_date);
  if (listed != null) return { days: listed, basis: 'listing_date', note: `counted from the listing date, ${fmt(l.listing_date!)}` };

  const recorded = Number(l.days_on_market) > 0 ? Number(l.days_on_market) : Number(l.days_on_market_listing) > 0 ? Number(l.days_on_market_listing) : 0;
  if (recorded > 0) {
    const age = since(l.last_checked);
    if (age != null && age > 0) return { days: recorded + age, basis: 'recorded', note: `${recorded} days when last checked ${fmt(l.last_checked!)}, plus the days since` };
    return { days: recorded, basis: 'recorded', note: 'as recorded on the listing' };
  }

  const seen = l.listing_url ? since(l.first_seen_at ?? l.created_at) : null;
  return seen != null ? { days: seen, basis: 'first_seen', note: 'counted from when we first saw this listing; its own listing date is not on file' } : null;
}
