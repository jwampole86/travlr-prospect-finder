import 'server-only';
import { createHash } from 'node:crypto';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isAllowedImageUrl, type PhotoRef } from './photoRefs';
import { isPublishable } from './rights';

type Db = ReturnType<typeof getSupabaseAdmin>;

export const MEDIA_BUCKET = 'property-media';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

export interface ListingPhotos {
  source: string;
  listingUrl?: string;
  photos?: PhotoRef[];
}

/**
 * Records the photo references of freshly imported listings against their leads. Matches by the listing's own URL, which the
 * importer stores on the lead. Best-effort: a problem here never fails an import. New photos start as "unreviewed".
 */
export async function recordListingPhotos(db: Db, listings: ListingPhotos[]): Promise<{ matched: number; recorded: number }> {
  const withPhotos = listings.filter((l) => l.listingUrl && l.photos?.length);
  if (!withPhotos.length) return { matched: 0, recorded: 0 };
  let matched = 0, recorded = 0;
  try {
    for (let i = 0; i < withPhotos.length; i += 100) {
      const chunk = withPhotos.slice(i, i + 100);
      const { data: leads } = await db.from('leads').select('id, listing_url, organization_id').in('listing_url', chunk.map((l) => l.listingUrl as string));
      const byUrl = new Map<string, { id: string; organization_id: string | null }[]>();
      for (const lead of (leads ?? []) as { id: string; listing_url: string; organization_id: string | null }[]) {
        byUrl.set(lead.listing_url, [...(byUrl.get(lead.listing_url) ?? []), { id: lead.id, organization_id: lead.organization_id }]);
      }
      const rows: Record<string, unknown>[] = [];
      for (const listing of chunk) {
        for (const lead of byUrl.get(listing.listingUrl as string) ?? []) {
          matched++;
          for (const p of listing.photos ?? []) {
            rows.push({
              ...(lead.organization_id ? { organization_id: lead.organization_id } : {}),
              lead_id: lead.id, source: listing.source, source_url: listing.listingUrl, image_url: p.url, image_key: p.key,
              position: p.position, is_hero: p.position === 0,
            });
          }
        }
      }
      if (rows.length) {
        // Existing photos keep their review decision: only new ones are added.
        const { error, count } = await db.from('property_media').upsert(rows, { onConflict: 'organization_id,lead_id,image_key', ignoreDuplicates: true, count: 'exact' });
        if (error) console.warn('[property_media] record failed:', error.message);
        else recorded += count ?? rows.length;
      }
    }
  } catch (err) {
    console.warn('[property_media] record failed:', err instanceof Error ? err.message : err);
  }
  return { matched, recorded };
}

export type MirrorResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Copies one photo into our own storage, so a published gallery does not depend on (or hotlink) the source site. Only allow-listed
 * image hosts are fetched, redirects are refused, and the size and type are checked, because the URL came from a listing provider.
 */
export async function mirrorPhoto(db: Db, media: { id: string; lead_id: string; image_url: string; image_key: string }): Promise<MirrorResult> {
  const fail = async (error: string): Promise<MirrorResult> => {
    await db.from('property_media').update({ mirror_error: error.slice(0, 300) }).eq('id', media.id);
    return { ok: false, error };
  };
  if (!isAllowedImageUrl(media.image_url)) return fail('The photo address is not on an allowed image host.');
  try {
    const res = await fetch(media.image_url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: 'image/jpeg,image/png,image/webp' } });
    if (!res.ok) return fail(`The source answered HTTP ${res.status}.`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return fail(`Not an image (${type || 'no content type'}).`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return fail('The image is too large.');
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES || bytes.length < 500) return fail('The image is too large or empty.');
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const safeLead = createHash('sha1').update(media.lead_id).digest('hex').slice(0, 16);
    const path = `${safeLead}/${media.image_key.replace(/[^a-z0-9_-]/gi, '')}.${ext}`;
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (error) return fail(error.message);
    await db.from('property_media').update({ storage_path: path, mirrored_at: new Date().toISOString(), mirror_error: null }).eq('id', media.id);
    return { ok: true, path };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Download failed.');
  }
}

export interface GalleryPhoto { id: string; url: string; position: number; hero: boolean; source: string; sourceUrl: string | null; basis: string | null; mirrored: boolean }

/** What a NAVEO Homes gallery may show for a lead: cleared, visible photos only, hero first. Mirrored copies get a short-lived link. */
export async function publishableGallery(db: Db, leadId: string, organizationId: string | null): Promise<GalleryPhoto[]> {
  let q = db.from('property_media').select('*').eq('lead_id', leadId).eq('rights_status', 'cleared').eq('hidden', false).order('is_hero', { ascending: false }).order('position');
  if (organizationId) q = q.eq('organization_id', organizationId);
  const { data } = await q;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((m) => isPublishable(m as { rights_status: string; hidden?: boolean }));
  const out: GalleryPhoto[] = [];
  for (const m of rows) {
    let url = String(m.image_url);
    let mirrored = false;
    if (m.storage_path) {
      const { data: signed } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(String(m.storage_path), 3600);
      if (signed?.signedUrl) { url = signed.signedUrl; mirrored = true; }
    }
    out.push({ id: String(m.id), url, position: Number(m.position), hero: !!m.is_hero, source: String(m.source), sourceUrl: (m.source_url as string) ?? null, basis: (m.rights_basis as string) ?? null, mirrored });
  }
  return out;
}
