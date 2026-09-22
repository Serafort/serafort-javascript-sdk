export interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in seconds
  scope?: string;
}

/**
 * High-concurrency, Promise-safe in-memory cache for Machine-to-Machine (M2M) access tokens.
 * Automatically refreshes before expiration and coalesces concurrent refresh requests
 * to avoid thundering-herd problems against the IAM server.
 */
export class M2MTokenCache {
  private cache = new Map<string, CachedToken>();
  private inFlightRequests = new Map<string, Promise<string>>();

  /**
   * Refresh window buffer in seconds (default: 300s = 5 minutes).
   * A token expiring within this window will be refreshed proactively.
   */
  private readonly refreshBufferSeconds: number;

  constructor(refreshBufferSeconds = 300) {
    this.refreshBufferSeconds = refreshBufferSeconds;
  }

  /**
   * Retrieves a cached token if valid, or invokes the refresher function.
   * If a fetch is already in flight for the given cache key, coalesces into that existing promise.
   */
  public async getOrFetch(
    cacheKey: string,
    refresher: () => Promise<{ accessToken: string; expiresIn: number; scope?: string }>,
    force = false
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    if (!force) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt - this.refreshBufferSeconds > now) {
        return cached.accessToken;
      }
    }

    // Coalesce in-flight requests for the same cache key
    const existingInFlight = this.inFlightRequests.get(cacheKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const fetchPromise = (async () => {
      try {
        const response = await refresher();
        const expiresAt = now + response.expiresIn;

        this.cache.set(cacheKey, {
          accessToken: response.accessToken,
          expiresAt,
          scope: response.scope,
        });

        return response.accessToken;
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Invalidates cached token for a specific cache key or clears all.
   */
  public invalidate(cacheKey?: string): void {
    if (cacheKey) {
      this.cache.delete(cacheKey);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Returns current cached item metadata (for diagnostics and testing).
   */
  public get(cacheKey: string): CachedToken | undefined {
    return this.cache.get(cacheKey);
  }
}
