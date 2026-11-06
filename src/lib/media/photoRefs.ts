/**
 * Property photo references taken from listing-provider responses. Pure functions: no I/O.
 *
 * A photo found on a source site is a REFERENCE (a URL plus where it came from), never proof that we may republish it. Rights are
 * recorded separately (see rights.ts), and nothing is shown in a NAVEO gallery until a person has cleared it.
 */

export interface PhotoRef {
  url: string;
  /** Stable id of the image file itself, so the same photo found in several sizes or several pulls is stored once. */
  key: string;
  position: number;
}

/**
 * Hosts photos may be fetched from. Anything else is refused: a listing provider's response is untrusted input, and fetching an
 * arbitrary URL from the server would let a crafted listing point it at internal addresses.
 */
export const ALLOWED_IMAGE_HOSTS: readonly RegExp[] = [
  /^photos\.zillowstatic\.com$/i,
  /^www\.trulia\.com$/i,
  /^[a-z0-9-]+\.zillowstatic\.com$/i,
];

export const MAX_PHOTOS_PER_LISTING = 40;

export function isAllowedImageUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 600) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  if (!ALLOWED_IMAGE_HOSTS.some((re) => re.test(u.hostname))) return false;
  if (u.hostname.toLowerCase() === 'www.trulia.com' && !u.pathname.startsWith('/pictures/')) return false;
  return /\.(jpe?g|png|webp)$/i.test(u.pathname);
}

/**
 * The id of the image file: Zillow's CDN names files by a hash plus a size suffix ("…/fp/<hash>-p_e.jpg", "…/fp/<hash>-full.jpg"),
 * and Trulia mirrors those names under /pictures/thumbs_N/zillowstatic/fp/. Both give the same key.
 */
export function imageKey(url: string): string {
  const file = new URL(url).pathname.split('/').pop() ?? url;
  return file.replace(/\.(jpe?g|png|webp)$/i, '').replace(/-(?:p_[a-z]|full|cc_ft_\d+|uncropped_scaled_within_\d+_\d+)$/i, '').toLowerCase();
}

type Sized = { small?: string; medium?: string; large?: string } | string | null | undefined;
const biggest = (u: Sized): string | undefined => (typeof u === 'string' ? u : u?.large || u?.medium || u?.small);

/** Trulia: `media.photos[]` with small/medium/large urls, largest preferred. */
export function truliaPhotoRefs(media: { photos?: Array<{ url?: Sized }>; heroImage?: { url?: Sized } } | null | undefined): PhotoRef[] {
  const urls = [...(media?.photos ?? []).map((p) => biggest(p?.url)), biggest(media?.heroImage?.url)];
  return toRefs(urls);
}

/** Zillow search: one cover image. */
export function zillowPhotoRefs(imageUrl: unknown): PhotoRef[] {
  return toRefs([imageUrl]);
}

export function toRefs(urls: unknown[]): PhotoRef[] {
  const seen = new Set<string>();
  const out: PhotoRef[] = [];
  for (const raw of urls) {
    if (!isAllowedImageUrl(raw)) continue;
    const key = imageKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ url: raw, key, position: out.length });
    if (out.length >= MAX_PHOTOS_PER_LISTING) break;
  }
  return out;
}
