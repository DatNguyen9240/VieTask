/**
 * In-memory cache with TTL expiration, periodic cleanup, and max-size eviction.
 *
 * Prevents memory leaks by:
 *  1. Periodically sweeping expired entries (every CACHE_CLEANUP_INTERVAL_MS)
 *  2. Evicting oldest entries when the cache exceeds CACHE_MAX_SIZE
 */

import { CACHE_TTL_MS, CACHE_MAX_SIZE, CACHE_CLEANUP_INTERVAL_MS } from "../config.js";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
  createdAt: number;
}

const store = new Map<string, CacheEntry>();

/** Periodic cleanup timer — sweeps expired entries. */
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS);

// Allow the process to exit even if the timer is active
if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
  cleanupTimer.unref();
}

/**
 * Get a cached value by key. Returns undefined if not found or expired.
 */
export function cacheGet(key: string): unknown | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Set a cached value with automatic TTL expiration.
 * If the cache exceeds MAX_SIZE, the oldest entry is evicted.
 */
export function cacheSet(key: string, data: unknown): void {
  // Evict oldest entry if at capacity
  if (store.size >= CACHE_MAX_SIZE && !store.has(key)) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, entry] of store) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  store.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
    createdAt: Date.now(),
  });
}

/** Get current cache size (for testing/monitoring). */
export function cacheSize(): number {
  return store.size;
}

/** Clear all cache entries (for testing). */
export function cacheClear(): void {
  store.clear();
}
