/**
 * Phase 2: Address validation utilities
 * Ensures listing IDs are never displayed as property addresses
 */

// Patterns that indicate a listing ID rather than a real address
const LISTING_ID_PATTERNS = [
  /^other listing #/i,
  /^hotpads listing #/i,
  /^apartments\.com listing #/i,
  /^zillow listing #/i,
  /^listing #/i,
  /^listing id:/i,
  /^#\d+$/,
  /^\d{7,}$/, // pure numeric IDs
];

export function isListingId(value: string): boolean {
  if (!value || value.trim() === '') return false;
  return LISTING_ID_PATTERNS.some(p => p.test(value.trim()));
}

export function isValidAddress(address: string): boolean {
  if (!address || address.trim() === '') return false;
  if (isListingId(address)) return false;
  // Must have at least a number and a street name
  return /\d/.test(address) && address.trim().length > 5;
}

export function getAddressDisplayValue(address: string): { display: string; isIncomplete: boolean } {
  if (!address || address.trim() === '') {
    return { display: 'Address not available', isIncomplete: true };
  }
  if (isListingId(address)) {
    return { display: 'Address incomplete', isIncomplete: true };
  }
  return { display: address, isIncomplete: false };
}

/**
 * Build a reliable, address-specific search URL for a given listing source.
 * Used as a fallback when listing_url is empty or a 404-prone stored URL.
 * Always returns a URL — worst case it's the source homepage.
 */
export function getPropertyListingUrl(
  listingUrl: string | undefined | null,
  address: string,
  city: string,
  state: string,
  zip: string,
  source: string
): string {
  // If we have a stored URL that looks like a real detail page (not a search page), use it
  if (listingUrl && listingUrl.trim() !== '') {
    const u = listingUrl.trim();
    const isSearchPage =
      u.includes('/search') ||
      u.includes('/for-rent') ||
      u.includes('/category/') ||
      u.includes('realestateandhomes-search') ||
      u.includes('?query=') ||
      u.includes('?sk=') ||
      u.includes('/apartments/?') ||
      u.includes('synthetic.travlr') ||
      u.includes('example.com');
    if (!isSearchPage) return u;
  }

  // Build address-specific search URL per source
  const fullAddress = [address, city, state, zip].filter(Boolean).join(' ').trim();
  const encodedAddress = encodeURIComponent(fullAddress);
  const encodedCity = encodeURIComponent((city || '').trim());
  const encodedState = encodeURIComponent((state || '').trim());
  const encodedZip = encodeURIComponent((zip || '').trim());
  const encodedStreet = encodeURIComponent((address || '').trim());

  const src = (source || '').toLowerCase();

  if (src.includes('zillow')) {
    return `https://www.zillow.com/homes/for_rent/${encodedAddress}_rb/`;
  }
  if (src.includes('trulia')) {
    return `https://www.trulia.com/for_rent/${encodedCity},${encodedState}/?search=${encodedAddress}`;
  }
  if (src.includes('realtor')) {
    return `https://www.realtor.com/realestateandhomes-search/${encodedCity}_${encodedState}?keywords=${encodedAddress}`;
  }
  if (src.includes('apartments.com') || src.includes('apartments')) {
    return `https://www.apartments.com/${encodedCity}-${encodedState}/?bb=${encodedAddress}`;
  }
  if (src.includes('hotpads')) {
    return `https://hotpads.com/${encodedCity}-${encodedState}/for-rent?q=${encodedAddress}`;
  }
  if (src.includes('craigslist')) {
    // Craigslist doesn't support address search well — link to local housing search
    const stateCode = (state || '').toLowerCase().trim();
    return `https://${stateCode}.craigslist.org/search/apa?query=${encodedAddress}`;
  }
  if (src.includes('facebook')) {
    return `https://www.facebook.com/marketplace/propertyrentals/?query=${encodedAddress}`;
  }
  if (src.includes('rent.com') || src === 'rent') {
    return `https://www.rent.com/search?q=${encodedAddress}`;
  }
  if (src.includes('padmapper')) {
    return `https://www.padmapper.com/apartments/${encodedCity}-${encodedState}?search=${encodedAddress}`;
  }
  if (src.includes('apartment list') || src.includes('apartmentlist')) {
    return `https://www.apartmentlist.com/${encodedState}/${encodedCity}?search=${encodedAddress}`;
  }
  if (src.includes('dwellsy')) {
    return `https://dwellsy.com/search/?q=${encodedAddress}`;
  }
  if (src.includes('redfin')) {
    return `https://www.redfin.com/search#for-rent/query=${encodedAddress}`;
  }
  if (src.includes('loopnet')) {
    return `https://www.loopnet.com/search/commercial-real-estate/${encodedCity}-${encodedState}/for-lease/?sk=${encodedAddress}`;
  }
  if (src.includes('airbnb')) {
    return `https://www.airbnb.com/s/${encodedAddress}/homes`;
  }
  if (src.includes('vrbo')) {
    return `https://www.vrbo.com/search?destination=${encodedAddress}`;
  }
  if (src.includes('mls') || src.includes('realtor') || src.includes('realty')) {
    return `https://www.realtor.com/realestateandhomes-search/${encodedCity}_${encodedState}?keywords=${encodedAddress}`;
  }

  // Generic Google fallback — always finds the property
  return `https://www.google.com/search?q=${encodeURIComponent(`"${fullAddress}" rental listing ${source}`)}`;
}
