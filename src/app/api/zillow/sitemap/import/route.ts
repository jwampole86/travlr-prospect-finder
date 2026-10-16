import { gunzipSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FEEDS = {
  for_sale_by_agent: {
    shardCount: 34,
    baseUrl: 'https://www.zillow.com/xml/sitemaps/us/hdp/for-sale-by-agent/',
  },
  for_sale_by_owner: {
    shardCount: 1,
    baseUrl: 'https://www.zillow.com/xml/sitemaps/us/hdp/for-sale-by-owner/',
  },
} as const;

type FeedFamily = keyof typeof FEEDS;

type SitemapRecord = {
  zpid: string;
  url: string;
  family: FeedFamily;
  source_sitemap_url: string;
  source_shard: number;
  zillow_lastmod: string | null;
};

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function parseSitemap(xml: string, family: FeedFamily, shard: number, sourceUrl: string) {
  const unique = new Map<string, SitemapRecord>();
  let urlsSeen = 0;

  for (const entry of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = entry[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1];
    if (!loc) continue;
    urlsSeen += 1;

    const urlText = decodeXml(loc.trim());
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlText);
    } catch {
      continue;
    }

    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'www.zillow.com') continue;
    const zpid = parsedUrl.pathname.match(/\/(\d+)_zpid\/?$/i)?.[1];
    if (!zpid) continue;

    const lastmod = entry[1].match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
    const parsedLastmod = lastmod ? new Date(decodeXml(lastmod)) : null;
    unique.set(zpid, {
      zpid,
      url: parsedUrl.toString(),
      family,
      source_sitemap_url: sourceUrl,
      source_shard: shard,
      zillow_lastmod: parsedLastmod && !Number.isNaN(parsedLastmod.getTime()) ? parsedLastmod.toISOString() : null,
    });
  }

  return { records: [...unique.values()], urlsSeen };
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdminActor(request);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  let body: { family?: string; shard?: number; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const family = body.family as FeedFamily;
  if (!Object.hasOwn(FEEDS, family)) {
    return NextResponse.json({ error: 'family must be for_sale_by_agent or for_sale_by_owner.' }, { status: 400 });
  }

  const feed = FEEDS[family];
  const shard = body.shard;
  if (typeof shard !== 'number' || !Number.isInteger(shard) || shard < 0 || shard >= feed.shardCount) {
    return NextResponse.json({ error: `shard must be an integer from 0 to ${feed.shardCount - 1}.` }, { status: 400 });
  }

  const sourceUrl = `${feed.baseUrl}sitemap-${String(shard).padStart(4, '0')}.xml.gz`;

  try {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'TRAVLR Zillow Sitemap Importer/1.0' },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Zillow sitemap returned HTTP ${response.status}.` }, { status: 502 });
    }

    const compressed = Buffer.from(await response.arrayBuffer());
    if (compressed.length > 32 * 1024 * 1024) {
      return NextResponse.json({ error: 'Sitemap exceeds the 32 MB compressed size limit.' }, { status: 413 });
    }

    const xmlBytes = compressed[0] === 0x1f && compressed[1] === 0x8b
      ? gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 })
      : compressed;
    const { records, urlsSeen } = parseSitemap(xmlBytes.toString('utf8'), family, shard, sourceUrl);
    if (urlsSeen === 0 || records.length === 0) {
      return NextResponse.json({ error: 'Sitemap contained no valid Zillow property URLs.' }, { status: 502 });
    }

    if (body.dryRun) {
      return NextResponse.json({
        family,
        shard,
        sourceUrl,
        urlsSeen,
        uniqueZpids: records.length,
        duplicatesInShard: urlsSeen - records.length,
        dryRun: true,
      });
    }

    let upserted = 0;
    for (let index = 0; index < records.length; index += 2000) {
      const { data, error } = await authorization.actor.client.rpc('upsert_zillow_sitemap_page', {
        p_rows: records.slice(index, index + 2000),
      });
      if (error) throw error;
      upserted += Number(data || 0);
    }

    return NextResponse.json({
      family,
      shard,
      sourceUrl,
      urlsSeen,
      uniqueZpids: records.length,
      duplicatesInShard: urlsSeen - records.length,
      upserted,
      dryRun: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error';
    console.error('Zillow sitemap import failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}