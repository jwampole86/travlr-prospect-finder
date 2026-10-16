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
  travlr: { key: 'travlr', name: 'TRAVLR Vacation Homes', siteUrl: 'https://staytrvlr.com', enabled: true },
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
