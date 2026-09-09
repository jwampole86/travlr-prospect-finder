/**
 * Anthropic Batch Validation Service
 * - In-memory deduplication by lead fingerprint
 * - Batches concurrent validation calls per agent assignment batch
 * - Exponential backoff on rate limits (429)
 * - Coalesces identical in-flight requests
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';

// ─── In-memory deduplication store ───────────────────────────────────────────
// fingerprint → Promise<ValidationResult>
const IN_FLIGHT: Map<string, Promise<ValidationResult>> = new Map();

// fingerprint → { result, expiresAt }
const MEMORY_CACHE: Map<string, { result: ValidationResult; expiresAt: number }> = new Map();

const MEMORY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ValidationResult {
  leadId: string;
  ownershipConfidence: number | null;
  marketCompConfidence: number | null;
  overallConfidence: number | null;
  recommendation: 'accept' | 'review' | 'reject';
  anomalies: string[];
  cacheHit: boolean;
}

export interface BatchValidationRequest {
  leadId: string;
  address: string;
  city: string;
  state: string;
}

// ─── Fingerprint builder ──────────────────────────────────────────────────────
function buildFingerprint(req: BatchValidationRequest): string {
  return [
    req.address.toLowerCase().replace(/\s+/g, ' ').trim(),
    req.city.toLowerCase().trim(),
    req.state.toLowerCase().trim(),
  ].join('|');
}

// ─── Exponential backoff fetch ────────────────────────────────────────────────
async function fetchWithBackoff(
  url: string,
  body: Record<string, unknown>,
  maxRetries = 4,
): Promise<Response> {
  let delay = 500; // ms
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < maxRetries) {
      // Rate limited — back off exponentially with jitter
      const jitter = Math.random() * 200;
      await new Promise(r => setTimeout(r, delay + jitter));
      delay = Math.min(delay * 2, 16000); // cap at 16s
      continue;
    }

    return res;
  }
  throw new Error('Max retries exceeded for Anthropic validation');
}

// ─── Single lead validation with dedup ───────────────────────────────────────
async function validateSingle(req: BatchValidationRequest): Promise<ValidationResult> {
  const fingerprint = buildFingerprint(req);

  // 1. Check memory cache
  const cached = MEMORY_CACHE.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cacheHit: true };
  }

  // 2. Coalesce in-flight requests for same fingerprint
  const inFlight = IN_FLIGHT.get(fingerprint);
  if (inFlight) {
    return inFlight;
  }

  // 3. Fire new request
  const promise = (async (): Promise<ValidationResult> => {
    try {
      const res = await fetchWithBackoff(`${BASE_URL}/api/enrichment/validate-and-score`, {
        leadId: req.leadId,
      });

      if (!res.ok) {
        throw new Error(`Validation API returned ${res.status}`);
      }

      const data = await res.json();

      const result: ValidationResult = {
        leadId: req.leadId,
        ownershipConfidence: data.ownershipConfidence ?? null,
        marketCompConfidence: data.marketCompConfidence ?? null,
        overallConfidence: data.overallConfidence ?? null,
        recommendation: data.recommendation ?? 'review',
        anomalies: data.anomalies ?? [],
        cacheHit: data.cacheHit ?? false,
      };

      // Store in memory cache
      MEMORY_CACHE.set(fingerprint, {
        result,
        expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
      });

      return result;
    } finally {
      IN_FLIGHT.delete(fingerprint);
    }
  })();

  IN_FLIGHT.set(fingerprint, promise);
  return promise;
}

// ─── Batch validation ─────────────────────────────────────────────────────────
// Deduplicates by fingerprint, fires concurrent requests for unique leads,
// respects concurrency limit to avoid hammering the API.
export async function validateBatch(
  requests: BatchValidationRequest[],
  concurrency = 5,
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  // Deduplicate by fingerprint — keep first occurrence per fingerprint
  const seen = new Set<string>();
  const unique: BatchValidationRequest[] = [];
  const fingerprintToLeadIds = new Map<string, string[]>();

  for (const req of requests) {
    const fp = buildFingerprint(req);
    if (!fingerprintToLeadIds.has(fp)) {
      fingerprintToLeadIds.set(fp, []);
    }
    fingerprintToLeadIds.get(fp)!.push(req.leadId);

    if (!seen.has(fp)) {
      seen.add(fp);
      unique.push(req);
    }
  }

  // Process in chunks of `concurrency`
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(r => validateSingle(r)));

    for (let j = 0; j < chunk.length; j++) {
      const req = chunk[j];
      const fp = buildFingerprint(req);
      const outcome = settled[j];

      if (outcome.status === 'fulfilled') {
        // Map result back to all lead IDs sharing this fingerprint
        const leadIds = fingerprintToLeadIds.get(fp) ?? [req.leadId];
        for (const lid of leadIds) {
          results.set(lid, { ...outcome.value, leadId: lid });
        }
      }
      // On rejection, skip — caller decides how to handle missing results
    }
  }

  return results;
}

// ─── HubSpot sync deduplication ──────────────────────────────────────────────
// Prevents duplicate HubSpot sync calls for the same lead within a batch.

const HUBSPOT_IN_FLIGHT: Map<string, Promise<void>> = new Map();
const HUBSPOT_SYNCED: Set<string> = new Set();

export async function syncLeadToHubSpotDeduped(
  leadId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Already synced in this session
  if (HUBSPOT_SYNCED.has(leadId)) return;

  // Coalesce in-flight
  const inFlight = HUBSPOT_IN_FLIGHT.get(leadId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const res = await fetchWithBackoff(`${BASE_URL}/api/hubspot/sync-metrics`, {
        action: 'push_metrics',
        leadId,
        ...payload,
      });

      if (res.ok) {
        HUBSPOT_SYNCED.add(leadId);
      }
    } finally {
      HUBSPOT_IN_FLIGHT.delete(leadId);
    }
  })();

  HUBSPOT_IN_FLIGHT.set(leadId, promise);
  return promise;
}

export async function syncBatchToHubSpot(
  leads: Array<{ leadId: string; payload: Record<string, unknown> }>,
  concurrency = 3,
): Promise<void> {
  // Deduplicate by leadId
  const unique = leads.filter(l => !HUBSPOT_SYNCED.has(l.leadId));
  const seen = new Set<string>();
  const deduped = unique.filter(l => {
    if (seen.has(l.leadId)) return false;
    seen.add(l.leadId);
    return true;
  });

  for (let i = 0; i < deduped.length; i += concurrency) {
    const chunk = deduped.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map(l => syncLeadToHubSpotDeduped(l.leadId, l.payload)));
  }
}

// ─── Cache management ─────────────────────────────────────────────────────────
export function clearMemoryCache(): void {
  MEMORY_CACHE.clear();
  IN_FLIGHT.clear();
  HUBSPOT_SYNCED.clear();
  HUBSPOT_IN_FLIGHT.clear();
}

export function getMemoryCacheStats(): {
  cachedFingerprints: number;
  inFlightRequests: number;
  hubspotSynced: number;
} {
  return {
    cachedFingerprints: MEMORY_CACHE.size,
    inFlightRequests: IN_FLIGHT.size,
    hubspotSynced: HUBSPOT_SYNCED.size,
  };
}
