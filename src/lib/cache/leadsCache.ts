'use client';

/**
 * Lightweight in-memory cache for leads data.
 * Shared across all service calls in the same browser session.
 *
 * TTL: 5 minutes (300 s) — long enough to make page navigation feel instant.
 * Stale-while-revalidate: returns stale data immediately while a background
 * refresh runs, so the UI never blocks on a cache miss.
 */

const CACHE_TTL_MS = 300_000; // 5 minutes
const STALE_GRACE_MS = 60_000; // serve stale for up to 1 extra minute while revalidating

interface Entry<T> { data: T; ts: number; revalidating?: boolean }
const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return null;
  const age = Date.now() - e.ts;
  if (age > CACHE_TTL_MS + STALE_GRACE_MS) {
    store.delete(key);
    return null;
  }
  return e.data;
}

/** Returns true if the cached entry exists but is past its TTL (stale). */
export function cacheIsStale(key: string): boolean {
  const e = store.get(key);
  if (!e) return false;
  return Date.now() - e.ts > CACHE_TTL_MS;
}

/** Mark a key as currently being revalidated to prevent duplicate background fetches. */
export function cacheMarkRevalidating(key: string): void {
  const e = store.get(key);
  if (e) store.set(key, { ...e, revalidating: true });
}

export function cacheIsRevalidating(key: string): boolean {
  return !!(store.get(key) as Entry<unknown> | undefined)?.revalidating;
}

export function cacheSet<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now(), revalidating: false });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheInvalidateAll(): void {
  store.clear();
}

export const CACHE_KEYS = {
  ALL_LEADS: 'leads:all',
  TOP_LEADS: 'leads:top',
  LEAD_BY_ID: (id: string) => `leads:id:${id}`,
  LEAD_COUNTS_BY_STATE: 'leads:counts:state',
} as const;
