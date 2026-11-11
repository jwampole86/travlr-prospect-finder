// Brands that share the TRAVLR estimate engine. TRAVLR is the default and is never replaced.
// Naveo is prepped but inactive: its public estimate link is switched on once `enabled` is true.

export type BrandKey = 'travlr' | 'naveo';

export interface Brand {
  key: BrandKey;
  name: string;
  siteUrl: string;
  enabled: boolean;
}

export const BRANDS: Record<BrandKey, Brand> = {
  travlr: { key: 'travlr', name: 'TRAVLR Vacation Homes', siteUrl: 'https://avyropro.ai', enabled: true },
  naveo: { key: 'naveo', name: 'NAVEO', siteUrl: 'https://staynaveo.com', enabled: false },
};

export const DEFAULT_BRAND: BrandKey = 'travlr';

/** Unknown, missing or not-yet-enabled brands fall back to TRAVLR so existing links keep working. */
export function resolveBrand(value: string | null | undefined): Brand {
  const brand = BRANDS[String(value ?? '').toLowerCase() as BrandKey];
  return brand?.enabled ? brand : BRANDS[DEFAULT_BRAND];
}

/** Estimate link for a brand. The engine stays on the TRAVLR app; `brand` tags the lead's origin. */
export function estimateLinkFor(brand: BrandKey, address: string, engineUrl: string = BRANDS.travlr.siteUrl): string {
  const url = `${engineUrl.replace(/\/$/, '')}/estimate?address=${encodeURIComponent(address).replace(/%20/g, '+').replace(/%2C/g, ',')}`;
  return brand === DEFAULT_BRAND ? url : `${url}&brand=${brand}`;
}

// ─── What homeowners and sellers are told we are called ──────────────────────────────────────────────────────────────────────────────
// Every text and email to an owner names NAVEO, never TRAVLR. Which NAVEO depends on the property: a home for rent is a NAVEO Stays
// conversation (vacation / short-term rental management), a home for sale is a NAVEO Homes conversation (seller solutions, long-term
// rental, and an options chat). Change the names or the rule here and every message follows.

export type OutreachBrandKey = 'stays' | 'homes';

export interface OutreachBrand {
  key: OutreachBrandKey;
  /** What we call ourselves in a message. */
  name: string;
  /** The brand's own website. */
  siteUrl: string | null;
  /** The one-line sign-off for emails. */
  signature: string;
  /** Logos in /public/brand: the full icon (with the name), and the symbol alone for small spaces and favicons. */
  logo: string;
  symbol: string;
}

export const OUTREACH_BRANDS: Record<OutreachBrandKey, OutreachBrand> = {
  stays: { key: 'stays', name: 'NAVEO Stays', siteUrl: 'https://staynaveo.com', signature: 'NAVEO Stays | staynaveo.com', logo: '/brand/naveo-stays-512.png', symbol: '/brand/naveo-stays-symbol-256.png' },
  homes: { key: 'homes', name: 'NAVEO Homes', siteUrl: 'https://naveohomes.com', signature: 'NAVEO Homes | naveohomes.com', logo: '/brand/naveo-homes-512.png', symbol: '/brand/naveo-homes-symbol-256.png' },
};

/** For rent (or unknown) -> NAVEO Stays; for sale -> NAVEO Homes. Unknown goes to Stays because that is what the existing owner campaigns are. */
export function outreachBrandFor(priceType: string | null | undefined): OutreachBrand {
  return String(priceType ?? '').toLowerCase() === 'sale' ? OUTREACH_BRANDS.homes : OUTREACH_BRANDS.stays;
}

/** Fills {brand} / {{brand}} and {brand_site} / {{brand_site}} in a message. */
export function applyOutreachBrand(text: string, brand: OutreachBrand): string {
  return text
    .replace(/\{\{?\s*brand\s*\}?\}/g, brand.name)
    .replace(/\{\{?\s*brand_signature\s*\}?\}/g, brand.signature)
    .replace(/\{\{?\s*brand_site\s*\}?\}/g, brand.siteUrl ? brand.siteUrl.replace(/^https?:\/\//, '') : '');
}
