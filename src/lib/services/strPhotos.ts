import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchListingsPage } from '@/lib/services/strPull';

export const PHOTO_MODEL = process.env.PHOTO_SCORE_MODEL || 'claude-sonnet-4-6';
/** The Messages API accepts at most 100 images per request, so a bigger listing is read in several requests. */
const MAX_IMAGES_PER_REQUEST = 100;

export interface PhotoVerdict { score: number; hero: 'strong' | 'ok' | 'weak'; lighting: string; staging: string; angles: string; missingShots: string[]; strengths: string[]; fixes: string[]; looksDated: boolean; confidence: 'high' | 'medium' | 'low' }
export interface PhotoResult { verdict: PhotoVerdict | null; reviewed: number; total: number; unreachable: number; inputTokens: number; outputTokens: number; reason?: string }

export interface PhotoListing { property_id: string; market: string; title: string | null; bedrooms?: number | null; bathrooms?: number | null; photo_urls_all: string[] | null; photo_count: number | null }
/** The stored list is complete only when it holds every photo the listing has (photo_urls keeps just the first twelve of each listing). */
export const hasAllPhotos = (l: Pick<PhotoListing, 'photo_urls_all' | 'photo_count'>) => (l.photo_urls_all?.length ?? 0) > 0 && (l.photo_urls_all?.length ?? 0) >= (l.photo_count ?? 0);

async function reachable(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 403) return false;
    const get = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(10_000) });
    return get.ok || get.status === 206;
  } catch { return false; }
}

async function filterReachable(urls: string[]): Promise<string[]> {
  const ok: boolean[] = new Array(urls.length).fill(false); let next = 0;
  await Promise.all(Array.from({ length: 10 }, async () => { while (next < urls.length) { const i = next++; ok[i] = await reachable(urls[i]); } }));
  return urls.filter((_, i) => ok[i]);
}

const system = (n: number, total: number) => `You review vacation-rental listing photos for a property-management company deciding how to help the owner earn more. Judge only what is visible in the photos. Be specific and fair: name what you see, not generalities. Never insult the owner or the home.
You are given EVERY photo in the listing${n < total ? ` that could be loaded (${n} of ${total})` : ` (${n} photos)`}, in listing order. Each photo is labelled "Photo i of ${n}" and photo 1 is the cover image. Look at all of them before you judge anything. A space counts as missing only if it appears in none of the photos, so check every photo before listing a space in missingShots; if you are unsure whether a space appears, do not list it. Only list spaces a guest of this home would expect: the kitchen, living and dining areas, each stated bedroom and bathroom, the exterior and any amenity named in the listing title or details. Do not list spaces you are only guessing exist (garage, laundry, extra rooms).
Return ONLY JSON: {"score": 0-100 overall photo quality for a luxury listing (90+ professional, 70s good, 50s average, below 40 weak), "hero": "strong|ok|weak" (cover photo's pull), "lighting": short, "staging": short, "angles": short, "missingShots": string[] (spaces a guest expects that none of the photos show), "strengths": string[] (max 3), "fixes": string[] (max 3, each concrete and doable), "looksDated": boolean, "confidence": "high|medium|low"}.`;

const imageBlocks = (urls: string[], offset: number, total: number) => urls.flatMap((u, i) => [
  { type: 'text' as const, text: `Photo ${offset + i + 1} of ${total}` },
  { type: 'image' as const, source: { type: 'url' as const, url: u } },
]);

const parseJson = <T,>(text: string): T => { const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in the model reply'); return JSON.parse(m[0]) as T; };

/**
 * Scores a listing from all of its photos. Photos that cannot be loaded are left out and counted, and if too many are unavailable the
 * listing is not scored at all, because a score built on a partial set would blame the owner for spaces that are simply not in the sample.
 * A listing over the 100-image request limit is read in chunks: the first 100 produce the verdict, and the later chunks are used only to
 * cross out any "missing" space that shows up in them.
 */
export async function scoreListingPhotos(client: Anthropic, l: PhotoListing): Promise<PhotoResult> {
  const all = l.photo_urls_all ?? []; const total = Math.max(all.length, l.photo_count ?? 0);
  const result: PhotoResult = { verdict: null, reviewed: 0, total, unreachable: 0, inputTokens: 0, outputTokens: 0 };
  if (!hasAllPhotos(l)) return { ...result, reason: 'The stored photo list is incomplete' };
  const urls = await filterReachable(all); result.reviewed = urls.length; result.unreachable = all.length - urls.length;
  if (urls.length < 3 || result.unreachable > all.length * 0.2) return { ...result, reason: `Only ${urls.length} of ${all.length} photos could be loaded` };

  const chunks: string[][] = []; for (let i = 0; i < urls.length; i += MAX_IMAGES_PER_REQUEST) chunks.push(urls.slice(i, i + MAX_IMAGES_PER_REQUEST));
  const first = await client.messages.create({
    model: PHOTO_MODEL, max_tokens: 1000, temperature: 0, system: system(urls.length, total),
    messages: [{ role: 'user', content: [...imageBlocks(chunks[0], 0, urls.length), { type: 'text' as const, text: `Listing title: "${l.title}"${l.bedrooms != null ? `. It has ${l.bedrooms} bedrooms` : ''}${l.bathrooms != null ? ` and ${l.bathrooms} bathrooms` : ''}. Score these photos.` }] }],
  });
  result.inputTokens += first.usage.input_tokens; result.outputTokens += first.usage.output_tokens;
  const verdict = parseJson<PhotoVerdict>(first.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(''));

  let offset = chunks[0].length;
  for (const chunk of chunks.slice(1)) {
    if (!verdict.missingShots?.length) break;
    const more = await client.messages.create({
      model: PHOTO_MODEL, max_tokens: 300, temperature: 0, system: 'You check vacation-rental photos. Return ONLY JSON: {"present": string[]} listing which of the given spaces are clearly visible in at least one of the photos.',
      messages: [{ role: 'user', content: [...imageBlocks(chunk, offset, urls.length), { type: 'text' as const, text: `Spaces to look for: ${JSON.stringify(verdict.missingShots)}` }] }],
    });
    result.inputTokens += more.usage.input_tokens; result.outputTokens += more.usage.output_tokens;
    const present = new Set(parseJson<{ present: string[] }>(more.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')).present.map(s => s.toLowerCase()));
    verdict.missingShots = verdict.missingShots.filter(s => !present.has(s.toLowerCase()));
    offset += chunk.length;
  }
  return { ...result, verdict };
}

/**
 * Re-reads the pages that hold the given listings so their complete photo lists are stored. The listings feed returns the full image
 * list for each listing, but the pull keeps only the first twelve to stay small. Pages are read in the same order as the original pull, and a market
 * stops as soon as all of its wanted listings were found. Costs one AirDNA request per page.
 */
export async function completePhotoSets(db: SupabaseClient, listings: PhotoListing[], opts: { maxPagesPerMarket?: number; onLog?: (s: string) => void } = {}) {
  const maxPages = opts.maxPagesPerMarket ?? 12; let apiCalls = 0, updated = 0, notFound = 0;
  const byMarket = new Map<string, Set<string>>();
  for (const l of listings) if (!hasAllPhotos(l)) (byMarket.get(l.market) ?? byMarket.set(l.market, new Set()).get(l.market)!).add(l.property_id);
  for (const [market, wanted] of byMarket) {
    const base = { location: market, page_size: '100', bedrooms_min: '3', listing_type: 'entire_place' };
    try {
      for (let page = 0; page < maxPages && wanted.size; page++) {
        const res = await fetchListingsPage({ ...base, offset: String(page * 100) }, () => { apiCalls++; });
        for (const l of res.listings) {
          const id = String(l.property_id); const imgs = Array.isArray(l.images) ? (l.images as string[]) : [];
          if (!wanted.has(id) || !imgs.length) continue;
          await db.from('str_listings').update({ photo_urls_all: imgs, photo_count: imgs.length }).eq('property_id', id);
          wanted.delete(id); updated++;
        }
        if ((page + 1) * 100 >= res.total) break;
      }
    } catch (e) { opts.onLog?.(`${market}: ${(e as Error).message.slice(0, 100)}`); }
    notFound += wanted.size;
    opts.onLog?.(`${market}: ${wanted.size ? `${wanted.size} not found` : 'complete'}`);
  }
  return { apiCalls, updated, notFound };
}
