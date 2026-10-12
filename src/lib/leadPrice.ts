import type { Lead } from '@/data/mockLeads';

export interface LeadPriceDisplay {
  /** Headline figure, always monthly when a monthly number exists. */
  primary: string;
  /** Context line, e.g. the sale price behind an estimated rent. */
  secondary: string | null;
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

function compactUsd(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000).toLocaleString('en-US') + 'K';
  return usd(n);
}

/** A sale price is a purchase price, never a monthly figure, so only rentals (or rent estimates) get "/mo". */
export function leadPriceDisplay(lead: Pick<Lead, 'price' | 'priceType' | 'estimatedMonthlyRent'>): LeadPriceDisplay {
  const price = Number(lead.price) || 0;
  const rent = Number(lead.estimatedMonthlyRent) || 0;

  if (lead.priceType !== 'sale') {
    return price > 0 ? { primary: `${usd(price)}/mo`, secondary: null } : { primary: '—', secondary: null };
  }
  if (rent > 0) {
    return { primary: `~${usd(rent)}/mo`, secondary: price > 0 ? `est. rent · listed ${compactUsd(price)}` : 'est. rent' };
  }
  return price > 0 ? { primary: usd(price), secondary: 'for sale' } : { primary: '—', secondary: null };
}
