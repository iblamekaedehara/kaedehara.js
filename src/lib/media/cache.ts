/**
 * Dedicated media cache with normalized keys and provider-level TTL.
 *
 * cacheGet<T> returns:
 *   - `undefined` when the key is absent OR expired (should fetch)
 *   - `null` when we previously confirmed the provider returned nothing (do not refetch)
 *   - `T` when we have a valid cached result
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 2000;

interface CacheEntry<T> {
  value: T;
  resolvedAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.resolvedAt > CACHE_TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number = CACHE_TTL_MS): void {
  // Evict oldest 20% when at capacity to prevent unbounded memory growth
  if (store.size >= MAX_CACHE_SIZE) {
    const keys = store.keys();
    const evictCount = Math.floor(MAX_CACHE_SIZE * 0.2);
    for (let i = 0; i < evictCount; i++) {
      const next = keys.next();
      if (!next.done) store.delete(next.value);
    }
  }
  // If a shorter TTL is requested, fake the resolvedAt so the entry expires after ttlMs
  const resolvedAt = ttlMs === CACHE_TTL_MS
    ? Date.now()
    : Date.now() - (CACHE_TTL_MS - ttlMs);
  store.set(key, { value, resolvedAt });
}

export function cacheKey(...parts: string[]): string {
  return parts.join(":");
}

/** Deduplicate in-flight requests for the same key. */
const inflight = new Map<string, Promise<unknown>>();

export async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}