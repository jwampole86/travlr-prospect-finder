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

// Why a homeowner would partner with us rather than list on a booking site alone. Keep claims qualitative and true to how we operate.
export const WHY_TITLE = 'Why partner with TRAVLR instead of listing it yourself?';
export const WHY_INTRO = 'Booking sites are open to everyone, which is great for reach and hard on owners. With more than 10 years of experience, TRAVLR places your home in an exclusive collection of luxury rentals, so it attracts high-quality guests who respect your home.';
export interface WhyItem { key: 'guests' | 'time' | 'pricing' | 'protection' | 'compliance' | 'reputation'; title: string; alone: string; withUs: string }
export const WHY_ITEMS: WhyItem[] = [
  { key: 'guests', title: 'The right guests', alone: 'Anyone can book an open listing, including first-time renters and party bookings.', withUs: 'Your home joins a curated luxury collection, with guest screening and house rules we enforce, so stays come from guests who care for the home.' },
  { key: 'time', title: 'Your time', alone: 'Inquiries, check-ins, cleaner scheduling and problems all land on you, at any hour.', withUs: 'We handle guest messaging, check-in, cleaning and turnover, and a local team responds when something comes up.' },
  { key: 'pricing', title: 'Pricing that follows demand', alone: 'Guessing a nightly rate usually means under-pricing busy weeks or sitting empty.', withUs: 'We adjust rates for season, events and local demand, and market the home across the major booking channels.' },
  { key: 'protection', title: 'Protection when things go wrong', alone: 'Damage claims, cancellations and disputed reviews are yours to chase.', withUs: 'We manage guest issues and claim paperwork on your behalf and keep you informed.' },
  { key: 'compliance', title: 'Permits and taxes', alone: 'City permits, lodging tax registration and safety rules are easy to miss and costly to get wrong.', withUs: 'We guide you through local requirements before the first booking and keep the home compliant.' },
  { key: 'reputation', title: 'A track record guests trust', alone: 'A new listing starts with no reviews and little visibility.', withUs: 'You benefit from our 10+ years of experience and Superhost and Premier Host standing from day one.' },
];
