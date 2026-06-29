// In-memory caches + rate limiter for the PUBLIC sitter endpoints.
//
// SERVERLESS CAVEAT: on Vercel these live per warm lambda instance — they cut
// repeated DB/signing cost during clustered, warm-instance traffic (a real sit)
// but are NOT a durable cross-instance store. For hard cross-instance
// guarantees (especially rate limiting) add a shared store (Upstash/Redis) or
// Vercel edge rate limiting. Pure module (no imports) so it stays a singleton
// and is safe to import anywhere.
//
// SECURITY: token VALIDATION is never cached (see sitter.functions
// loadSitByToken — it always re-reads the sit row), so revoke/expiry hard-fails
// immediately regardless of anything cached here. Everything cached here is
// keyed by sit id / storage path and only reached AFTER a fresh token check.

type Entry<T> = { value: T; exp: number };

class TtlCache<T> {
  private m = new Map<string, Entry<T>>();
  get(key: string): T | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.exp <= Date.now()) { this.m.delete(key); return undefined; }
    return e.value;
  }
  set(key: string, value: T, ttlMs: number): void {
    this.m.set(key, { value, exp: Date.now() + ttlMs });
    if (this.m.size > 5000) this.prune();
  }
  delete(key: string): void { this.m.delete(key); }
  deletePrefix(prefix: string): void {
    for (const k of this.m.keys()) if (k.startsWith(prefix)) this.m.delete(k);
  }
  private prune(): void {
    const now = Date.now();
    for (const [k, e] of this.m) if (e.exp <= now) this.m.delete(k);
  }
}

// Signed media URLs (clip iframe / photo) keyed by ref/path. TTL must stay under
// the 1-hour signed-URL lifetime so a cached URL never outlives its signature.
export const mediaCache = new TtlCache<string>();
export const MEDIA_TTL_MS = 55 * 60 * 1000;

// Slow-changing sitter context payload keyed by `${sitId}:${birdId}`. Short TTL:
// mutable parts (task completions, today's log) are fetched fresh and NOT cached.
export const contextCache = new TtlCache<any>();
export const CONTEXT_TTL_MS = 20 * 1000;

// Bird ids per sit (effectively immutable during a sit).
export const sitBirdsCache = new TtlCache<string[]>();
export const SITBIRDS_TTL_MS = 60 * 1000;

// Static guide cards — identical for everyone.
export const guideCache = new TtlCache<any>();
export const GUIDE_TTL_MS = 5 * 60 * 1000;

// Drop everything cached for one sit (called when a token is found revoked/
// expired — defensive; the fresh token check already prevents serving it).
export function purgeSit(sitId: string): void {
  contextCache.deletePrefix(`${sitId}:`);
  sitBirdsCache.delete(sitId);
}

// ---- Fixed-window rate limiter (in-memory, per key) -----------------------
type Window = { count: number; reset: number };
const buckets = new Map<string, Window>();

/** Returns true when this hit EXCEEDS the limit in the current window. */
export function overLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || w.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return false;
  }
  w.count += 1;
  return w.count > limit;
}
