// Credentials taken from staytrvlr.com, each linked to its public source so homeowners can verify it themselves.
// Keep this list in sync with the website; remove anything that stops being true (for example Superhost status renews yearly).
export interface TrustItem { key: string; title: string; note: string; href: string }

export const TRUST_ITEMS: TrustItem[] = [
  { key: 'airbnb', title: 'Airbnb Superhost', note: 'See our host profile', href: 'https://www.airbnb.com/users/profile/1462768828819189174' },
  { key: 'vrbo', title: 'Vrbo Premier Host', note: 'See our Vrbo profile', href: 'https://www.vrbo.com/2756367' },
  { key: 'wsj', title: 'Featured in The Wall Street Journal', note: 'Read the article', href: 'https://www.wsj.com/real-estate/luxury-homes/luxury-short-term-rentals-005cb146' },
  { key: 'psl', title: 'Featured in Palm Springs Life', note: 'Read the article', href: 'https://www.palmspringslife.com/home-design/book-your-stay-at-this-geodome-in-palm-desert/' },
];

export const TRUST_AFFILIATIONS = 'VRMA, California Association of Realtors and CSA Travel Protection';
export const TRUST_STORY = 'A founder-led company that also runs its own luxury vacation homes, so we manage yours the way we manage ours.';
export const ABOUT_URL = 'https://staytrvlr.com/About';
