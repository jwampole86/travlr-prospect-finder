/**
 * National Airbnb and vacation-rental niche directory: 120 niches in 12 categories, plus the eight lead-scoring priority clusters.
 * A property can carry several niches. Tags are inferred from what a listing reveals (title, market, size and nightly rate), so they are
 * targeting hypotheses, not verified facts, and they say nothing about whether short-term rental is legal at that address.
 */

export const NICHE_CATEGORIES = [
  { id: 1, name: 'Beach, Coastal & Island' }, { id: 2, name: 'Mountain, Ski & Alpine' }, { id: 3, name: 'Lake, River & Waterfront' },
  { id: 4, name: 'Desert, Southwest & Wellness' }, { id: 5, name: 'Urban, Downtown & Business' }, { id: 6, name: 'Luxury, Estate & High-Value' },
  { id: 7, name: 'Nature, Forest & Adventure' }, { id: 8, name: 'Unique, Themed & Experiential' }, { id: 9, name: 'Family, Groups & Entertainment' },
  { id: 10, name: 'Lifestyle, Recreation & Special Interest' }, { id: 11, name: 'Mid-Term, Seasonal & Workforce' }, { id: 12, name: 'Specialized, Accessible & Emerging' },
] as const;

const NAMES = [
  'Oceanfront luxury villas', 'Beachfront single-family homes', 'Ocean-view vacation homes', 'Beach cottages', 'Coastal condominiums', 'Island vacation homes', 'Surfing destination rentals', 'Marina and harbor homes', 'Boardwalk-area rentals', 'Coastal group estates',
  'Ski-in/ski-out chalets', 'Ski resort condominiums', 'Luxury mountain estates', 'Alpine cabins', 'Mountain-view homes', 'Snowboarding destination rentals', 'Mountain lake retreats', 'Four-season mountain lodges', 'Secluded mountain hideaways', 'Mountain group cabins',
  'Lakefront luxury estates', 'Lake cabins', 'Private dock homes', 'Riverfront cottages', 'Fishing lodges', 'Boating vacation homes', 'Paddleboarding and kayaking retreats', 'Waterfront family homes', 'Houseboats and floating homes', 'Reservoir vacation rentals',
  'Desert luxury villas', 'Palm Springs-style modern homes', 'Joshua Tree-style retreats', 'Desert glamping domes', 'Private pool desert homes', 'Wellness and yoga retreats', 'Stargazing properties', 'Adobe and Southwestern homes', 'Off-grid desert cabins', 'Desert golf resort homes',
  'Downtown luxury penthouses', 'Urban studios', 'One-bedroom city apartments', 'Executive corporate apartments', 'Convention center rentals', 'Medical district rentals', 'University-area furnished rentals', 'Walkable downtown townhomes', 'High-rise condominiums', 'Business travel extended stays',
  'Ultra-luxury estates', 'Private gated mansions', 'Celebrity-style villas', 'Architect-designed homes', 'Waterfront luxury compounds', 'Luxury resort residences', 'Private chef and concierge villas', 'Luxury golf estates', 'Multi-building private compounds', 'High-end designer residences',
  'A-frame cabins', 'Forest cabins', 'National park gateway homes', 'Hiking basecamp rentals', 'Treehouses', 'Wildlife-viewing lodges', 'Off-grid wilderness cabins', 'Waterfall-area cottages', 'Mountain biking retreats', 'Outdoor adventure lodges',
  'Geodesic domes', 'Yurts', 'Tiny homes', 'Shipping container homes', 'Converted barns', 'Historic castles and manor homes', 'Retro-themed houses', 'Pop-culture themed homes', 'Glass cabins', 'Underground and earth-sheltered homes',
  'Large family vacation homes', 'Multi-generational homes', 'Reunion estates', 'Game room houses', 'Private pool family homes', 'Waterpark and splash-pad homes', 'Theme park destination rentals', 'Sports tournament group homes', 'Large bunk-room cabins', 'Private theater and entertainment homes',
  'Golf course homes', 'Equestrian and horse properties', 'Vineyard vacation homes', 'Farm stays', 'Ranch retreats', 'Hunting lodges', 'Fishing-focused vacation homes', 'Cycling destination homes', 'Spa and sauna retreats', 'Romantic couples retreats',
  'Digital nomad rentals', 'Travel nurse housing', 'Corporate relocation homes', 'Insurance displacement housing', 'Snowbird seasonal rentals', 'Temporary construction workforce housing', 'Military relocation housing', 'Visiting faculty and academic stays', 'Film production housing', 'Monthly furnished family homes',
  'Pet-friendly fenced-yard homes', 'Wheelchair-accessible vacation homes', 'Step-free senior-friendly rentals', 'EV-charger-equipped rentals', 'Eco-friendly sustainable homes', 'Solar-powered off-grid rentals', 'Remote-work optimized homes', 'Quiet and low-stimulation retreats', 'Legal event and retreat properties', 'Boutique multi-unit vacation properties',
];

export interface Niche { id: number; name: string; category: number; cluster: number | null }

/** The eight national lead-scoring priorities, best first. A niche inherits the best rank of any cluster it belongs to. */
export const PRIORITY_CLUSTERS = [
  { rank: 1, name: 'Luxury estates and villas', opportunity: 'High potential contract value' },
  { rank: 2, name: 'Beachfront and resort homes', opportunity: 'Strong vacation-rental positioning' },
  { rank: 3, name: 'Ski chalets and mountain estates', opportunity: 'Destination-market management opportunities' },
  { rank: 4, name: 'Lakefront and waterfront estates', opportunity: 'Premium location differentiation' },
  { rank: 5, name: 'Large family and group properties', opportunity: 'Complex operations can create management demand' },
  { rank: 6, name: 'Desert pool villas and golf homes', opportunity: 'Strong fit for resort markets' },
  { rank: 7, name: 'Premium cabins and nature retreats', opportunity: 'Distinctive inventory and guest appeal' },
  { rank: 8, name: 'Urban executive and mid-term rentals', opportunity: 'Diversified owner-acquisition opportunities' },
] as const;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CLUSTER_MEMBERS: Record<number, number[]> = {
  1: [...range(51, 60), 1, 13, 21, 31], 2: [...range(1, 10), 56], 3: range(11, 20), 4: range(21, 30),
  5: [...range(81, 90), 10, 20], 6: [...range(31, 40), 91, 58], 7: [...range(61, 70), 14, 22], 8: [...range(41, 50), ...range(101, 110)],
};
const clusterOf = (id: number) => { for (const r of [1, 2, 3, 4, 5, 6, 7, 8]) if (CLUSTER_MEMBERS[r].includes(id)) return r; return null; };
/** Every niche id in a priority cluster (a niche can sit in more than one). */
export const clusterMembers = (rank: number) => [...(CLUSTER_MEMBERS[rank] ?? [])].sort((a, b) => a - b);

export const NICHES: Niche[] = NAMES.map((name, i) => ({ id: i + 1, name, category: Math.floor(i / 10) + 1, cluster: clusterOf(i + 1) }));
export const NICHE_BY_ID = new Map(NICHES.map(n => [n.id, n]));
export const nicheName = (id: number) => NICHE_BY_ID.get(id)?.name ?? `Niche ${id}`;

/** Lower is better; listings with no clustered niche sort last. */
export const nichePriority = (ids: number[] | null | undefined) => Math.min(99, ...((ids ?? []).map(i => NICHE_BY_ID.get(i)?.cluster ?? 99)));

// ---------------------------------------------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------------------------------------------

const set = (...v: string[]) => new Set(v);
const SKI = set('aspen|CO', 'breckenridge|CO', 'vail|CO', 'keystone|CO', 'steamboat springs|CO', 'telluride|CO', 'winter park|CO', 'crested butte|CO', 'park city|UT', 'heber city|UT', 'midway|UT', 'killington|VT', 'stowe|VT', 'stratton|VT', 'warren|VT', 'manchester|VT', 'north conway|NH', 'lincoln|NH', 'big sky|MT', 'whitefish|MT', 'red lodge|MT', 'sun valley|ID', 'ketchum|ID', 'mccall|ID', 'driggs|ID', 'snowshoe|WV', 'davis|WV', 'banner elk|NC', 'hunter|NY', 'windham|NY', 'lake placid|NY', 'angel fire|NM', 'taos|NM', 'ruidoso|NM', 'lake harmony|PA', 'lutsen|MN', 'jackson|WY', 'wilson|WY');
const MOUNTAIN = set(...SKI, 'gatlinburg|TN', 'pigeon forge|TN', 'sevierville|TN', 'townsend|TN', 'blue ridge|GA', 'helen|GA', 'asheville|NC', 'boone|NC', 'blowing rock|NC', 'hendersonville|NC', 'kalispell|MT', 'bozeman|MT', 'missoula|MT', 'luray|VA', 'eureka springs|AR', 'hot springs|AR', 'broken bow|OK', 'flagstaff|AZ', 'pinetop|AZ', 'payson|AZ', 'sedona|AZ', 'hood river|OR', 'sunriver|OR', 'bend|OR', 'cody|WY', 'pinedale|WY', 'big bear|CA');
const COASTAL = set('gulf shores|AL', 'orange beach|AL', 'rehoboth beach|DE', 'bethany beach|DE', 'lewes|DE', 'fenwick island|DE', 'destin|FL', 'panama city beach|FL', 'key west|FL', 'naples|FL', 'marco island|FL', 'clearwater|FL', 'st petersburg|FL', 'fort myers beach|FL', 'cape coral|FL', 'st augustine|FL', 'jacksonville beach|FL', 'siesta key|FL', 'sarasota|FL', 'cocoa beach|FL', 'santa rosa beach|FL', 'key largo|FL', 'islamorada|FL', 'miami beach|FL', 'fort lauderdale|FL', 'miami|FL', 'tybee island|GA', 'saint simons island|GA', 'old orchard beach|ME', 'wells|ME', 'kennebunkport|ME', 'ocean city|MD', 'provincetown|MA', 'chatham|MA', 'falmouth|MA', 'nantucket|MA', 'edgartown|MA', 'oak bluffs|MA', 'dennis|MA', 'harwich|MA', 'biloxi|MS', 'gulfport|MS', 'bay saint louis|MS', 'ocean city|NJ', 'wildwood|NJ', 'cape may|NJ', 'atlantic city|NJ', 'seaside heights|NJ', 'beach haven|NJ', 'avalon|NJ', 'stone harbor|NJ', 'sea isle city|NJ', 'point pleasant beach|NJ', 'montauk|NY', 'southampton|NY', 'nags head|NC', 'kill devil hills|NC', 'corolla|NC', 'wrightsville beach|NC', 'oak island|NC', 'emerald isle|NC', 'sunset beach|NC', 'wilmington|NC', 'cannon beach|OR', 'seaside|OR', 'lincoln city|OR', 'newport|OR', 'manzanita|OR', 'depoe bay|OR', 'florence|OR', 'newport|RI', 'narragansett|RI', 'westerly|RI', 'myrtle beach|SC', 'north myrtle beach|SC', 'folly beach|SC', 'isle of palms|SC', 'kiawah island|SC', 'hilton head island|SC', 'murrells inlet|SC', 'edisto beach|SC', 'pawleys island|SC', 'beaufort|SC', 'galveston|TX', 'port aransas|TX', 'corpus christi|TX', 'south padre island|TX', 'virginia beach|VA', 'chincoteague|VA', 'seaside|CA');
const ISLAND = set('nantucket|MA', 'edgartown|MA', 'oak bluffs|MA', 'key west|FL', 'key largo|FL', 'islamorada|FL', 'marco island|FL', 'siesta key|FL', 'fort myers beach|FL', 'tybee island|GA', 'saint simons island|GA', 'kiawah island|SC', 'isle of palms|SC', 'hilton head island|SC', 'edisto beach|SC', 'folly beach|SC', 'put in bay|OH', 'chincoteague|VA', 'galveston|TX', 'port aransas|TX', 'south padre island|TX');
const SURF = set('haleiwa|HI', 'cocoa beach|FL', 'folly beach|SC', 'wrightsville beach|NC', 'montauk|NY', 'nags head|NC', 'oak island|NC', 'manzanita|OR', 'cannon beach|OR');
const DESERT = set('scottsdale|AZ', 'phoenix|AZ', 'tempe|AZ', 'mesa|AZ', 'chandler|AZ', 'tucson|AZ', 'sedona|AZ', 'lake havasu city|AZ', 'moab|UT', 'saint george|UT', 'springdale|UT', 'santa fe|NM', 'albuquerque|NM', 'las vegas|NV', 'henderson|NV', 'mesquite|NV', 'boulder city|NV', 'laughlin|NV', 'palm springs|CA', 'joshua tree|CA');
const PARK_GATEWAY = set('gatlinburg|TN', 'pigeon forge|TN', 'sevierville|TN', 'townsend|TN', 'jackson|WY', 'wilson|WY', 'cody|WY', 'moab|UT', 'springdale|UT', 'whitefish|MT', 'kalispell|MT', 'big sky|MT', 'bar harbor|ME', 'luray|VA', 'fayetteville|WV', 'medora|ND', 'estes park|CO');
const THEME_PARK = set('orlando|FL', 'kissimmee|FL', 'davenport|FL', 'pigeon forge|TN', 'sandusky|OH', 'williamsburg|VA');
const WATERPARK = set('wisconsin dells|WI', 'sandusky|OH');
const WINE = set('fredericksburg|TX', 'traverse city|MI', 'walla walla|WA', 'hood river|OR');
const COLLEGE = set('madison|WI', 'iowa city|IA', 'lawrence|KS', 'oxford|MS', 'charlottesville|VA', 'blacksburg|VA', 'athens|GA', 'columbus|OH', 'knoxville|TN');
const MILITARY = set('norfolk|VA', 'virginia beach|VA', 'fayetteville|NC', 'killeen|TX', 'colorado springs|CO');
const LAKE_MKT = set('lake ozark|MO', 'osage beach|MO', 'lake geneva|WI', 'minocqua|WI', 'brainerd|MN', 'alexandria|MN', 'lake george|NY', 'laconia|NH', 'wolfeboro|NH', 'grand haven|MI', 'canyon lake|TX', 'horseshoe bay|TX', 'lake havasu city|AZ', 'broken bow|OK', 'mccall|ID', 'sandpoint|ID', "coeur d'alene|ID", 'arnolds park|IA', 'cave city|KY', 'mchenry|MD');

export interface NicheInput { title?: string | null; market: string; bedrooms?: number | null; bathrooms?: number | null; accommodates?: number | null; adr?: number | null; is_luxury?: boolean | null; is_elite?: boolean | null }
export interface NicheResult { niches: number[]; primary: number | null }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const W = (...words: string[]) => new RegExp(`(?:^|[^a-z0-9])(?:${words.map(esc).join('|')})(?:$|[^a-z0-9])`, 'i');
const RX = {
  oceanfront: W('oceanfront', 'ocean front', 'ocean-front', 'direct ocean'), beachfront: W('beachfront', 'beach front', 'beach-front', 'on the beach', 'private beach', 'beach access'), oceanView: W('ocean view', 'ocean-view', 'ocean views', 'sea view', 'gulf view', 'gulf views', 'bay view', 'water view', 'water views'),
  cottage: W('cottage', 'bungalow', 'beach house', 'beach home'), condo: W('condo', 'condominium', 'condos'), surf: W('surf', 'surfing', 'surfer'), marina: W('marina', 'yacht', 'boat slip', 'harbor view', 'harbor front', 'harborfront', 'harbour view'), boardwalk: W('boardwalk'), island: W('island'),
  skiInOut: W('ski-in', 'ski in', 'ski-out', 'ski out', 'slopeside', 'slope side', 'on the slopes', 'ski lift'), ski: W('ski', 'skiing', 'snowboard', 'snowboarding', 'slopes'), chalet: W('chalet'), lodge: W('lodge'), cabin: W('cabin', 'cabins', 'log home', 'log cabin'),
  mountain: W('mountain', 'mountains', 'mtn', 'alpine', 'summit', 'peak', 'ridge', 'smoky', 'smokies', 'blue ridge', 'rocky'), mtnView: W('mountain view', 'mountain views', 'mtn view', 'mtn views', 'views of the mountains'), lake: W('lake', 'lakefront', 'lakeside', 'lake front', 'lake view'), lakefront: W('lakefront', 'lake front', 'on the lake', 'lakeside', 'waterfront'),
  secluded: W('secluded', 'hideaway', 'hide away', 'private retreat', 'secluded retreat', 'off the beaten'), dock: W('dock', 'boat dock', 'private dock', 'boat house', 'boathouse'), river: W('river', 'riverfront', 'riverside', 'creek'), fishing: W('fishing', 'angler', 'trout', 'fly fishing'),
  boat: W('boat', 'boating', 'pontoon', 'jet ski', 'wakeboard'), paddle: W('paddle', 'paddleboard', 'kayak', 'canoe'), waterfront: W('waterfront', 'water front', 'bayfront', 'bay front', 'sound front', 'canal'), houseboat: W('houseboat', 'floating home', 'floating house'), reservoir: W('reservoir'),
  modern: W('modern', 'mid-century', 'mid century', 'midcentury', 'contemporary'), pool: W('pool', 'heated pool', 'private pool', 'saltwater pool', 'swimming pool'), yoga: W('yoga', 'wellness', 'meditation', 'healing', 'spiritual'), stargaz: W('stargaz', 'dark sky', 'observatory', 'telescope', 'night sky'),
  adobe: W('adobe', 'southwestern', 'southwest', 'pueblo', 'santa fe style', 'hacienda'), offgrid: W('off-grid', 'off grid', 'offgrid'), golf: W('golf', 'golfer', 'golfing', 'fairway', 'country club', 'tee time'), dome: W('dome', 'geodesic', 'bubble'),
  penthouse: W('penthouse', 'sky home', 'sky villa'), executive: W('executive', 'corporate', 'business'), convention: W('convention', 'conference', 'expo'), medical: W('medical', 'hospital', 'clinic', 'mayo', 'md anderson', 'nurse'), campus: W('campus', 'university', 'college', 'stadium', 'student'),
  townhome: W('townhome', 'townhouse', 'town house', 'town home', 'brownstone'), downtown: W('downtown', 'walkable', 'walk to', 'steps from', 'old town', 'historic district'), highrise: W('high-rise', 'high rise', 'tower', 'skyline', 'sky rise'), extended: W('extended stay', 'extended', 'long stay', 'long-term'),
  mansion: W('mansion', 'estate', 'gated', 'manor', 'castle', 'chateau', 'château', 'palatial'), celebrity: W('celebrity', 'hollywood', 'resort-style', 'resort style', 'rockstar'), architect: W('architect', 'architectural', 'architect-designed', 'designed by', 'masterpiece'), resort: W('resort', 'residences', 'four seasons', 'ritz', 'montage'),
  chef: W('private chef', 'personal chef', 'chef service', 'concierge', 'butler'), compound: W('compound', 'guest house', 'guesthouse', 'casita', 'main house', 'two homes', '2 homes', 'two houses', 'multiple homes', 'carriage house', 'detached'), designer: W('designer', 'luxury', 'upscale', 'high-end', 'high end', 'custom', 'luxe'),
  aframe: W('a-frame', 'a frame', 'aframe'), forest: W('woods', 'wooded', 'pines', 'treetop', 'tree top', 'redwood', 'in the forest'), forestWord: W('forest'), national: W('national park', 'gateway', 'near the park', 'yellowstone', 'grand teton', 'zion', 'arches', 'smokies', 'glacier', 'acadia', 'shenandoah'), hike: W('hike', 'hiking', 'hikers', 'trail', 'trails', 'trailhead'),
  treehouse: W('treehouse', 'tree house', 'tree-house'), wildlife: W('wildlife', 'safari', 'bird', 'birding', 'elk', 'deer', 'bison'), wilderness: W('wilderness', 'backcountry'), waterfall: W('waterfall', 'waterfalls', 'falls', 'cascade'), bike: W('bike', 'biking', 'mtb', 'bikes', 'cycling', 'cyclist'),
  adventure: W('adventure', 'basecamp', 'base camp'), yurt: W('yurt'), tiny: W('tiny home', 'tiny house', 'tiny', 'micro'), container: W('container', 'shipping container'), barn: W('barn', 'converted barn', 'silo'), historic: W('castle', 'manor', 'historic', 'victorian', 'chateau', 'château', 'mansion historic', 'antebellum', 'colonial'),
  retro: W('retro', 'vintage', 'mid-century', 'mid century', '70s', '60s', 'throwback', 'groovy', 'art deco'), popCulture: W('disney', 'harry potter', 'star wars', 'jedi', 'marvel', 'barbie', 'themed', 'movie', 'elvis', 'dolly', 'wizard', 'hobbit', 'fairy tale', 'fairytale', 'pirate', 'mermaid', 'dinosaur', 'western saloon'), glass: W('glass house', 'glass cabin', 'glass', 'skylight house', 'sky house'),
  underground: W('underground', 'earth-sheltered', 'earth sheltered', 'earthship', 'hobbit', 'cave'), multiGen: W('multi-generational', 'multigenerational', 'multi generational', 'in-law', 'in law', 'inlaw', 'two master', 'dual master', '2 master', 'two primary', 'dual primary', 'two kitchens'),
  reunion: W('reunion', 'reunions', 'family gathering', 'big group', 'large group', 'groups'), game: W('game room', 'gameroom', 'arcade', 'game-room', 'pool table', 'ping pong', 'foosball', 'billiards', 'shuffleboard'), splash: W('waterpark', 'water park', 'splash pad', 'splash', 'lazy river', 'water slide'),
  tournament: W('tournament', 'tournaments', 'baseball', 'soccer', 'volleyball', 'travel team'), bunk: W('bunk', 'bunks', 'bunkroom', 'bunk room', 'bunkhouse', 'bunk house'), theater: W('theater', 'theatre', 'cinema', 'movie room', 'media room', 'home theater'),
  equestrian: W('equestrian', 'horse', 'horses', 'stable', 'stables', 'barn', 'pasture', 'paddock'), vineyard: W('vineyard', 'vineyards', 'winery', 'wine', 'wine country', 'cellar'), farm: W('farm', 'farm stay', 'working farm', 'homestead', 'orchard', 'barnyard'), farmhouse: W('farmhouse', 'farmhouse style'),
  ranch: W('ranch', 'ranches', 'rancho'), hunting: W('hunting', 'hunting lodge', 'deer camp', 'duck blind'), spa: W('sauna', 'spa', 'cold plunge', 'steam room', 'hot tub spa', 'wellness spa'), romantic: W('romantic', 'couples', 'couple', 'honeymoon', 'getaway for two', 'anniversary', 'elopement'),
  nomad: W('nomad', 'remote work', 'wfh', 'work from home', 'digital nomad'), nurse: W('travel nurse', 'nurse', 'nurses', 'healthcare', 'medical'), relocation: W('relocation', 'relocating', 'corporate housing', 'corporate'), insurance: W('insurance', 'displaced', 'displacement', 'fire victims'),
  snowbird: W('snowbird', 'snowbirds'), workforce: W('contractor', 'contractors', 'workforce', 'crew', 'construction', 'worker', 'workers', 'trade', 'oilfield'), military: W('military', 'navy', 'army', 'air force', 'pcs', 'veteran'),
  faculty: W('faculty', 'academic', 'professor', 'sabbatical', 'visiting', 'scholar'), film: W('film', 'filming', 'production', 'movie set', 'photoshoot', 'photo shoot', 'location shoot'), monthly: W('monthly', '30 day', '30-day', '30+', 'month-to-month', 'mid-term', 'midterm'),
  pet: W('pet', 'pets', 'dog', 'dogs', 'dog-friendly', 'pet-friendly', 'fenced', 'fenced yard', 'fenced-in'), accessible: W('wheelchair', 'accessible', 'ada', 'handicap', 'handicapped', 'roll-in', 'barrier-free', 'barrier free'), stepFree: W('step-free', 'step free', 'no stairs', 'one level', 'single level', 'single story', 'single-story', 'one story', 'one-story', 'ranch style', 'senior', 'seniors'),
  ev: W('ev charger', 'ev charging', 'tesla', 'electric vehicle', 'ev-charger', 'level 2 charger'), eco: W('eco', 'eco-friendly', 'sustainable', 'net zero', 'passive house'), solar: W('solar', 'solar-powered', 'solar powered', 'battery'), remote: W('remote work', 'workspace', 'home office', 'dedicated office', 'work from home', 'wfh', 'work-friendly'),
  quiet: W('quiet', 'peaceful', 'serene', 'tranquil', 'calm', 'sensory', 'zen'), event: W('event', 'events', 'wedding', 'weddings', 'venue', 'corporate retreat', 'retreat center'), multiUnit: W('duplex', 'triplex', 'fourplex', 'quadplex', 'multi-unit', 'multi unit', 'units', 'bungalows', 'cottages', 'villas', 'suites'),
  luxuryWord: W('luxury', 'luxurious', 'luxe', 'upscale', 'high-end', 'high end', 'exquisite', 'opulent', 'stunning estate'), mountainCtx: W('mountain', 'mountains', 'mtn', 'alpine', 'chalet', 'ski', 'lodge', 'summit', 'peak', 'ridge', 'smoky', 'smokies', 'blue ridge', 'rocky'),
};

type Strength = 0 | 1 | 2 | 3;
interface F { t: string; key: string; st: string; beds: number; baths: number; guests: number; adr: number; lux: boolean; elite: boolean; coastal: boolean; island: boolean; ski: boolean; mountain: boolean; desert: boolean; lakeMkt: boolean; mountainCtx: boolean; waterCtx: boolean; any: (r: RegExp) => boolean }

const RULES: Array<(f: F) => Strength> = (() => {
  const r: Array<(f: F) => Strength> = new Array(121).fill(() => 0);
  const rule = (id: number, fn: (f: F) => Strength) => { r[id] = fn; };
  const m = (f: F, re: RegExp) => f.any(re);
  // Beach, coastal and island
  rule(1, f => (m(f, RX.oceanfront) && (f.lux || m(f, RX.luxuryWord) || f.beds >= 5) ? 3 : f.coastal && f.elite ? 2 : 0));
  rule(2, f => (m(f, RX.beachfront) || m(f, RX.oceanfront) ? 3 : 0));
  rule(3, f => (m(f, RX.oceanView) ? 3 : 0));
  rule(4, f => (m(f, RX.cottage) && (f.coastal || m(f, RX.beachfront)) ? 3 : m(f, RX.cottage) && /beach|bay|sea|ocean|shore|coast/i.test(f.t) ? 2 : 0));
  rule(5, f => (m(f, RX.condo) && (f.coastal || m(f, RX.oceanView) || m(f, RX.beachfront)) ? 3 : 0));
  rule(6, f => (f.island ? 2 : m(f, RX.island) && f.coastal ? 1 : 0));
  rule(7, f => (m(f, RX.surf) ? 3 : SURF.has(f.key) ? 1 : 0));
  rule(8, f => (m(f, RX.marina) && f.waterCtx ? 3 : m(f, RX.marina) ? 2 : 0));
  rule(9, f => (m(f, RX.boardwalk) ? 3 : 0));
  rule(10, f => (f.coastal && (f.beds >= 6 || f.guests >= 14) ? 2 : 0));
  // Mountain, ski and alpine
  rule(11, f => (m(f, RX.skiInOut) ? 3 : 0));
  rule(12, f => (m(f, RX.condo) && (m(f, RX.ski) || f.ski) && f.mountain ? 3 : m(f, RX.condo) && f.ski ? 2 : 0));
  rule(13, f => (f.mountainCtx && (f.elite || (f.lux && f.beds >= 5) || m(f, RX.mansion)) ? (m(f, RX.mansion) || f.elite ? 3 : 2) : 0));
  rule(14, f => (m(f, RX.cabin) && f.mountainCtx ? 3 : m(f, RX.cabin) && f.mountain ? 2 : 0));
  rule(15, f => (m(f, RX.mtnView) ? 3 : 0));
  rule(16, f => (m(f, RX.ski) && !m(f, RX.skiInOut) && /ski|snowboard|slopes/i.test(f.t) ? 3 : f.ski && /ski|snow/i.test(f.t) ? 2 : 0));
  rule(17, f => (m(f, RX.lake) && f.mountainCtx ? 3 : f.lakeMkt && f.mountain ? 1 : 0));
  rule(18, f => (m(f, RX.lodge) && f.mountainCtx ? 3 : m(f, RX.lodge) && f.mountain ? 2 : 0));
  rule(19, f => (m(f, RX.secluded) && (f.mountainCtx || f.mountain) ? 3 : 0));
  rule(20, f => (f.mountainCtx && m(f, RX.cabin) && (f.guests >= 12 || f.beds >= 5) ? 3 : f.mountain && (m(f, RX.cabin) || m(f, RX.lodge)) && (f.guests >= 12 || f.beds >= 5) ? 2 : 0));
  // Lake, river and waterfront
  rule(21, f => (m(f, RX.lakefront) && f.waterCtx && (f.lux || f.elite || m(f, RX.luxuryWord)) ? 3 : 0));
  rule(22, f => (m(f, RX.cabin) && m(f, RX.lake) ? 3 : m(f, RX.cabin) && f.lakeMkt ? 2 : 0));
  rule(23, f => (m(f, RX.dock) ? 3 : 0));
  rule(24, f => (m(f, RX.river) && (m(f, RX.cottage) || m(f, RX.cabin)) ? 3 : 0));
  rule(25, f => (m(f, RX.fishing) && m(f, RX.lodge) ? 3 : 0));
  rule(26, f => (m(f, RX.boat) ? 3 : 0));
  rule(27, f => (m(f, RX.paddle) ? 3 : 0));
  rule(28, f => (m(f, RX.lakefront) && f.beds >= 4 ? 2 : m(f, RX.lake) && f.beds >= 4 ? 1 : 0));
  rule(29, f => (m(f, RX.houseboat) ? 3 : 0));
  rule(30, f => (m(f, RX.reservoir) ? 3 : 0));
  // Desert, southwest and wellness
  rule(31, f => (f.desert && (f.elite || (f.lux && f.beds >= 4) || m(f, RX.luxuryWord) || m(f, RX.mansion)) ? (f.elite ? 3 : 2) : 0));
  rule(32, f => (m(f, RX.modern) && f.desert ? 3 : 0));
  rule(33, f => (/joshua tree/i.test(f.t) || (f.desert && /oasis|desert retreat/i.test(f.t)) ? 3 : 0));
  rule(34, f => (m(f, RX.dome) && f.desert ? 3 : 0));
  rule(35, f => (f.desert && m(f, RX.pool) ? 3 : f.desert && f.beds >= 4 ? 1 : 0));
  rule(36, f => (m(f, RX.yoga) ? 3 : f.key === 'sedona|AZ' ? 1 : 0));
  rule(37, f => (m(f, RX.stargaz) ? 3 : 0));
  rule(38, f => (m(f, RX.adobe) ? 3 : f.st === 'NM' && /casa|rancho/i.test(f.t) ? 2 : 0));
  rule(39, f => (f.desert && m(f, RX.offgrid) ? 3 : 0));
  rule(40, f => (f.desert && m(f, RX.golf) ? 3 : 0));
  // Urban, downtown and business
  rule(41, f => (m(f, RX.penthouse) ? 3 : 0));
  rule(42, f => (/studio/i.test(f.t) ? 3 : 0));
  rule(43, f => (/1 ?br\b|one[- ]bedroom|1[- ]bedroom/i.test(f.t) ? 3 : 0));
  rule(44, f => (m(f, /executive/i) ? 3 : 0));
  rule(45, f => (m(f, RX.convention) ? 3 : 0));
  rule(46, f => (m(f, RX.medical) ? 3 : f.key === 'rochester|MN' ? 1 : 0));
  rule(47, f => (m(f, RX.campus) ? 3 : COLLEGE.has(f.key) ? 1 : 0));
  rule(48, f => (m(f, RX.townhome) && m(f, RX.downtown) ? 3 : m(f, RX.townhome) ? 2 : 0));
  rule(49, f => (m(f, RX.condo) && m(f, RX.highrise) ? 3 : m(f, RX.highrise) ? 2 : 0));
  rule(50, f => (m(f, RX.extended) ? 3 : 0));
  // Luxury, estate and high-value
  rule(51, f => (f.elite ? 3 : 0));
  rule(52, f => (m(f, RX.mansion) && (f.lux || f.beds >= 5 || /gated|mansion/i.test(f.t)) ? 3 : 0));
  rule(53, f => (m(f, RX.celebrity) && (f.lux || /celebrity|hollywood|resort-style|resort style/i.test(f.t)) ? 3 : 0));
  rule(54, f => (m(f, RX.architect) ? 3 : 0));
  rule(55, f => (f.waterCtx && (f.elite || (f.lux && f.beds >= 6) || m(f, RX.compound)) && (f.lux || f.elite) ? (m(f, RX.compound) ? 3 : 2) : 0));
  rule(56, f => (m(f, RX.resort) && (f.lux || f.elite) ? 3 : 0));
  rule(57, f => (m(f, RX.chef) ? 3 : 0));
  rule(58, f => (m(f, RX.golf) && (f.lux || f.elite) ? 3 : 0));
  rule(59, f => (m(f, RX.compound) ? 3 : 0));
  rule(60, f => (m(f, RX.designer) && (f.lux || f.elite || m(f, /designer|custom/)) ? 3 : 0));
  // Nature, forest and adventure
  rule(61, f => (m(f, RX.aframe) ? 3 : 0));
  rule(62, f => (m(f, RX.cabin) && (m(f, RX.forest) || m(f, RX.forestWord)) ? 3 : m(f, RX.forest) ? 2 : m(f, RX.cabin) ? 1 : 0));
  rule(63, f => (m(f, RX.national) ? 3 : PARK_GATEWAY.has(f.key) ? 1 : 0));
  rule(64, f => (m(f, RX.hike) ? 3 : 0));
  rule(65, f => (m(f, RX.treehouse) ? 3 : 0));
  rule(66, f => (m(f, RX.wildlife) ? 3 : 0));
  rule(67, f => (m(f, RX.offgrid) || m(f, RX.wilderness) && m(f, RX.cabin) ? 3 : 0));
  rule(68, f => (m(f, RX.waterfall) ? 3 : 0));
  rule(69, f => (m(f, RX.bike) ? 3 : 0));
  rule(70, f => (m(f, RX.adventure) ? 3 : 0));
  // Unique, themed and experiential
  rule(71, f => (m(f, RX.dome) ? 3 : 0));
  rule(72, f => (m(f, RX.yurt) ? 3 : 0));
  rule(73, f => (m(f, RX.tiny) ? 3 : 0));
  rule(74, f => (m(f, RX.container) ? 3 : 0));
  rule(75, f => (m(f, RX.barn) && !m(f, RX.equestrian) ? 3 : 0));
  rule(76, f => (m(f, RX.historic) ? 3 : 0));
  rule(77, f => (m(f, RX.retro) ? 3 : 0));
  rule(78, f => (m(f, RX.popCulture) ? 3 : 0));
  rule(79, f => (m(f, RX.glass) ? 3 : 0));
  rule(80, f => (m(f, RX.underground) ? 3 : 0));
  // Family, groups and entertainment
  rule(81, f => (/family/i.test(f.t) && f.beds >= 4 ? 3 : f.beds >= 5 || f.guests >= 12 ? 1 : 0));
  rule(82, f => (m(f, RX.multiGen) ? 3 : 0));
  rule(83, f => (m(f, RX.reunion) ? 3 : f.guests >= 20 ? 2 : 0));
  rule(84, f => (m(f, RX.game) ? 3 : 0));
  rule(85, f => (m(f, RX.pool) && f.beds >= 3 && !f.desert ? 3 : m(f, RX.pool) && f.beds >= 3 ? 2 : 0));
  rule(86, f => (m(f, RX.splash) ? 3 : WATERPARK.has(f.key) ? 1 : 0));
  rule(87, f => (m(f, /disney|universal|seaworld|theme park|dollywood|cedar point|busch/i) ? 3 : THEME_PARK.has(f.key) ? 2 : 0));
  rule(88, f => (m(f, RX.tournament) ? 3 : 0));
  rule(89, f => (m(f, RX.bunk) ? 3 : 0));
  rule(90, f => (m(f, RX.theater) ? 3 : 0));
  // Lifestyle, recreation and special interest
  rule(91, f => (m(f, RX.golf) ? 3 : 0));
  rule(92, f => (m(f, RX.equestrian) ? 3 : 0));
  rule(93, f => (m(f, RX.vineyard) ? 3 : WINE.has(f.key) ? 1 : 0));
  rule(94, f => (m(f, RX.farm) && !m(f, RX.farmhouse) ? 3 : 0));
  rule(95, f => (m(f, RX.ranch) && !/ranch[- ]style/i.test(f.t) ? 3 : 0));
  rule(96, f => (m(f, RX.hunting) ? 3 : 0));
  rule(97, f => (m(f, RX.fishing) ? 3 : 0));
  rule(98, f => (m(f, RX.bike) ? 3 : 0));
  rule(99, f => (m(f, RX.spa) && !/space|spacious/i.test(f.t) ? 3 : 0));
  rule(100, f => (m(f, RX.romantic) ? 3 : 0));
  // Mid-term, seasonal and workforce
  rule(101, f => (m(f, RX.nomad) ? 3 : 0));
  rule(102, f => (m(f, RX.nurse) ? 3 : 0));
  rule(103, f => (m(f, RX.relocation) ? 3 : 0));
  rule(104, f => (m(f, /insurance|displac|\bale\b/i) ? 3 : 0));
  rule(105, f => (m(f, RX.snowbird) ? 3 : 0));
  rule(106, f => (m(f, RX.workforce) ? 3 : 0));
  rule(107, f => (m(f, RX.military) ? 3 : MILITARY.has(f.key) ? 1 : 0));
  rule(108, f => (m(f, RX.faculty) ? 3 : 0));
  rule(109, f => (m(f, RX.film) ? 3 : 0));
  rule(110, f => (m(f, RX.monthly) ? 3 : 0));
  // Specialized, accessible and emerging
  rule(111, f => (m(f, RX.pet) ? 3 : 0));
  rule(112, f => (m(f, RX.accessible) ? 3 : 0));
  rule(113, f => (m(f, RX.stepFree) ? 3 : 0));
  rule(114, f => (m(f, RX.ev) ? 3 : 0));
  rule(115, f => (m(f, RX.eco) ? 3 : 0));
  rule(116, f => (m(f, RX.solar) ? 3 : 0));
  rule(117, f => (m(f, RX.remote) ? 3 : 0));
  rule(118, f => (m(f, RX.quiet) ? 2 : 0));
  rule(119, f => (m(f, RX.event) ? 3 : 0));
  rule(120, f => (m(f, RX.multiUnit) ? 3 : 0));
  return r;
})();

/** Tags a listing with every niche it plausibly belongs to and picks the most specific one as its primary niche. */
export function classifyNiches(i: NicheInput): NicheResult {
  const title = String(i.title ?? ''); const parts = i.market.split(','); const city = parts[0].trim().toLowerCase(); const st = (parts[1] ?? '').trim().toUpperCase(); const key = `${city}|${st}`;
  const t = title.toLowerCase();
  const f: F = {
    t, key, st, beds: Number(i.bedrooms ?? 0), baths: Number(i.bathrooms ?? 0), guests: Number(i.accommodates ?? 0), adr: Number(i.adr ?? 0), lux: !!i.is_luxury, elite: !!i.is_elite,
    coastal: COASTAL.has(key) || st === 'HI', island: ISLAND.has(key) || st === 'HI', ski: SKI.has(key), mountain: MOUNTAIN.has(key), desert: DESERT.has(key), lakeMkt: LAKE_MKT.has(key),
    mountainCtx: RX.mountainCtx.test(t) || SKI.has(key), waterCtx: RX.waterfront.test(t) || RX.lakefront.test(t) || RX.oceanfront.test(t) || RX.beachfront.test(t) || RX.dock.test(t) || RX.marina.test(t) || RX.lake.test(t),
    any: re => re.test(t),
  };
  const hits: Array<{ id: number; s: number }> = [];
  for (let id = 1; id <= 120; id++) { const s = RULES[id](f); if (s > 0) hits.push({ id, s }); }
  if (!hits.length) return { niches: [], primary: null };
  hits.sort((a, b) => b.s - a.s || (NICHE_BY_ID.get(a.id)!.cluster ?? 99) - (NICHE_BY_ID.get(b.id)!.cluster ?? 99) || a.id - b.id);
  return { niches: hits.map(h => h.id).sort((a, b) => a - b), primary: hits[0].id };
}
