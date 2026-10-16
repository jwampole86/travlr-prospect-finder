import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_LISTINGS = 500;

type JsonObject = Record<string, unknown>;

type RentalRecord = {
  listing_key: string;
  provider_listing_id: string | null;
  zpid: string | null;
  listing_url: string | null;
  listing_name: string | null;
  listing_kind: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  rent_min: number | null;
  rent_max: number | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  bathrooms_min: number | null;
  bathrooms_max: number | null;
  source_search_url: string | null;
  raw_data: JsonObject;
};

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text && text.length <= 1000 ? text : null;
}

function firstValue(objects: Array<JsonObject | null>, keys: string[]): unknown {
  for (const object of objects) {
    if (!object) continue;
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== '')
        return object[key];
    }
  }
  return null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function numberRange(value: unknown): [number | null, number | null] {
  const range = asObject(value);
  if (range) {
    const minimum = numericValue(range.min ?? range.minimum ?? range.low ?? range.value);
    const maximum = numericValue(range.max ?? range.maximum ?? range.high ?? range.value);
    return [minimum, maximum ?? minimum];
  }
  if (typeof value === 'string') {
    const matches = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || [];
    if (matches.length > 1) return [numericValue(matches[0]), numericValue(matches[1])];
  }
  const number = numericValue(value);
  return [number, number];
}

function redactUrlCredentials(value: unknown): unknown {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      for (const parameter of [...url.searchParams.keys()]) {
        if (/^(?:key|api[_-]?key|token|access_token|signature)$/i.test(parameter)) {
          url.searchParams.delete(parameter);
        }
      }
      return url.toString();
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(redactUrlCredentials);
  const object = asObject(value);
  if (object) {
    return Object.fromEntries(
      Object.entries(object).map(([key, entry]) => [key, redactUrlCredentials(entry)])
    );
  }
  return value;
}

function canonicalTruliaUrl(value: unknown, preserveSearch = false): string | null {
  const text = asText(value)?.replace(/[\uFFFD\uFFFE\u00AD]/g, '-');
  if (!text) return null;
  try {
    const url = text.startsWith('/') ? new URL(text, 'https://www.trulia.com') : new URL(text);
    if (
      url.protocol !== 'https:' ||
      !(url.hostname === 'trulia.com' || url.hostname.endsWith('.trulia.com'))
    )
      return null;
    url.hash = '';
    if (!preserveSearch) url.search = '';
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    return url.toString();
  } catch {
    return null;
  }
}

function extractZpid(value: unknown): string | null {
  const text = asText(value);
  return text?.match(/(?:^|\D)(\d+)(?:_(?:zpid|building_id|home_id))?$/i)?.[1] || null;
}

function trackingValue(value: unknown, key: string): unknown {
  if (!Array.isArray(value)) return null;
  const match = value
    .map(asObject)
    .find((entry) => entry && String(entry.key).toLowerCase() === key.toLowerCase());
  return match?.value ?? null;
}

function normalizeListing(value: unknown, sourceSearchUrl: string | null): RentalRecord | null {
  const raw = asObject(value);
  if (!raw) return null;

  const location = asObject(raw.location);
  const metadata = asObject(raw.metadata);
  const typedHomeId = firstValue([raw, metadata], ['typedHomeId']);
  const providerListingId = asText(
    firstValue(
      [raw],
      ['providerListingId', 'listingId', 'listing_id', 'propertyId', 'property_id', 'id']
    ) ??
      trackingValue(raw.tracking, 'rentalPLID') ??
      trackingValue(raw.tracking, 'listingID') ??
      metadata?.legacyIdForSave ??
      (extractZpid(typedHomeId) ? null : typedHomeId)
  );
  const zpid = extractZpid(
    firstValue([raw, metadata], ['zpid', 'homeId', 'home_id']) ?? typedHomeId
  );
  const listingUrl = canonicalTruliaUrl(
    firstValue([raw], ['listingUrl', 'detailUrl', 'canonicalUrl', 'url', 'href', 'webUrl'])
  );

  const listingKey = providerListingId
    ? `id:${providerListingId}`
    : zpid
      ? `zpid:${zpid}`
      : listingUrl
        ? `url:${listingUrl}`
        : null;
  if (!listingKey) return null;

  const addressValue = firstValue(
    [raw, location],
    ['streetAddress', 'address', 'street', 'formattedAddress']
  );
  const addressObject = asObject(addressValue);
  const rent = numberRange(
    firstValue([raw], ['rentRange', 'priceRange', 'rent', 'monthlyRent', 'price'])
  );
  const bedrooms = numberRange(firstValue([raw], ['bedroomRange', 'bedrooms', 'beds']));
  const bathrooms = numberRange(firstValue([raw], ['bathroomRange', 'bathrooms', 'baths']));

  return {
    listing_key: listingKey.slice(0, 2000),
    provider_listing_id: providerListingId,
    zpid,
    listing_url: listingUrl,
    listing_name: asText(
      firstValue(
        [raw, location],
        ['propertyName', 'communityLocation', 'name', 'title', 'buildingName']
      )
    ),
    listing_kind: asText(
      firstValue(
        [raw, metadata],
        ['listingType', 'propertyType', 'type', '__typename', 'unifiedListingType']
      )
    ),
    address: asText(
      addressObject
        ? firstValue([addressObject], ['streetAddress', 'street', 'formattedAddress'])
        : addressValue
    ),
    city: asText(firstValue([raw, location], ['city', 'locality'])),
    state: asText(firstValue([raw, location], ['state', 'stateCode', 'region'])),
    postal_code: asText(firstValue([raw, location], ['postalCode', 'zipCode', 'zip', 'zipcode'])),
    rent_min: rent[0],
    rent_max: rent[1],
    bedrooms_min: bedrooms[0],
    bedrooms_max: bedrooms[1],
    bathrooms_min: bathrooms[0],
    bathrooms_max: bathrooms[1],
    source_search_url: sourceSearchUrl,
    raw_data: redactUrlCredentials(raw) as JsonObject,
  };
}

function getListings(
  payload: unknown
): { listings: unknown[]; reportedTotal: number | null; sourceSearchUrl: string | null } | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data) || root;
  const listings = Array.isArray(data.listings)
    ? data.listings
    : Array.isArray(root.listings)
      ? root.listings
      : null;
  if (!listings) return null;

  const reportedTotal = numericValue(data.total ?? data.totalResults ?? root.total);
  const sourceSearchUrl = canonicalTruliaUrl(
    data.url ?? data.searchUrl ?? data.queryUrl ?? root.url ?? root.searchUrl ?? root.queryUrl,
    true
  );
  return { listings, reportedTotal, sourceSearchUrl };
}

function deduplicate(records: RentalRecord[]): RentalRecord[] {
  const byIdentity = new Map<string, RentalRecord>();
  const aliases = new Map<string, string>();

  for (const record of records) {
    const identityValues = [
      record.provider_listing_id ? `id:${record.provider_listing_id}` : null,
      record.zpid ? `zpid:${record.zpid}` : null,
      record.listing_url ? `url:${record.listing_url}` : null,
    ].filter((value): value is string => Boolean(value));
    const existingKey = identityValues.map((value) => aliases.get(value)).find(Boolean);
    if (existingKey) {
      const existing = byIdentity.get(existingKey)!;
      byIdentity.set(existingKey, {
        ...existing,
        ...record,
        provider_listing_id: record.provider_listing_id || existing.provider_listing_id,
        zpid: record.zpid || existing.zpid,
        listing_url: record.listing_url || existing.listing_url,
      });
      for (const identity of identityValues) aliases.set(identity, existingKey);
      continue;
    }

    byIdentity.set(record.listing_key, record);
    for (const identity of identityValues) aliases.set(identity, record.listing_key);
  }

  return [...byIdentity.values()];
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdminActor(request);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'JSON import must be smaller than 12 MB.' }, { status: 413 });
  }

  let body: JsonObject;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'JSON import must be smaller than 12 MB.' },
        { status: 413 }
      );
    }
    body = JSON.parse(text) as JsonObject;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const extracted = getListings(body.payload);
  if (!extracted) {
    return NextResponse.json(
      { error: 'Expected a Trulia response with a data.listings array.' },
      { status: 400 }
    );
  }
  if (extracted.listings.length > MAX_LISTINGS) {
    return NextResponse.json(
      { error: `Import up to ${MAX_LISTINGS} listings per request.` },
      { status: 413 }
    );
  }

  const normalized = extracted.listings
    .map((listing) => normalizeListing(listing, extracted.sourceSearchUrl))
    .filter((record): record is RentalRecord => record !== null);
  const records = deduplicate(normalized);
  const skippedMissingIdentity = extracted.listings.length - normalized.length;
  const dryRun = body.dryRun === true;

  if (!dryRun && records.length === 0) {
    return NextResponse.json(
      { error: 'No listings had a stable provider ID, zpid, or Trulia listing URL.' },
      { status: 422 }
    );
  }

  let upserted = 0;
  if (!dryRun) {
    for (let index = 0; index < records.length; index += 100) {
      const { data, error } = await authorization.actor.client.rpc('upsert_trulia_rental_page', {
        p_rows: records.slice(index, index + 100),
      });
      if (error) {
        console.error('Trulia rental staging import failed:', error.message);
        return NextResponse.json(
          { error: 'Could not save the Trulia rental batch.' },
          { status: 500 }
        );
      }
      upserted += Number(data || 0);
    }
  }

  return NextResponse.json({
    received: extracted.listings.length,
    uniqueListings: records.length,
    duplicatesInPayload: normalized.length - records.length,
    skippedMissingIdentity,
    reportedTotal: extracted.reportedTotal,
    sourceSearchUrl: extracted.sourceSearchUrl,
    upserted: dryRun ? null : upserted,
    dryRun,
  });
}
