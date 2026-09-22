import { describe, it, expect, vi } from 'vitest';
import { M2MTokenCache } from '../src/m2m/cache.js';

describe('M2MTokenCache', () => {
  it('should return cached token if still within valid window', async () => {
    const cache = new M2MTokenCache(300); // 5 min buffer
    const mockRefresher = vi.fn().mockResolvedValue({
      accessToken: 'token_123',
      expiresIn: 3600,
    });

    const token1 = await cache.getOrFetch('test-key', mockRefresher);
    const token2 = await cache.getOrFetch('test-key', mockRefresher);

    expect(token1).toBe('token_123');
    expect(token2).toBe('token_123');
    expect(mockRefresher).toHaveBeenCalledTimes(1);
  });

  it('should proactively refresh if token is within buffer window', async () => {
    const cache = new M2MTokenCache(300); // 5 min buffer (300s)
    let count = 0;
    const mockRefresher = vi.fn().mockImplementation(async () => {
      count++;
      return {
        accessToken: `token_${count}`,
        expiresIn: count === 1 ? 200 : 3600, // First token expires in 200s, which is < 300s buffer!
      };
    });

    const token1 = await cache.getOrFetch('test-key', mockRefresher);
    expect(token1).toBe('token_1');

    // Second call should detect token is within buffer and re-fetch
    const token2 = await cache.getOrFetch('test-key', mockRefresher);
    expect(token2).toBe('token_2');
    expect(mockRefresher).toHaveBeenCalledTimes(2);
  });

  it('should coalesce concurrent calls into a single refresh request (anti-thundering herd)', async () => {
    const cache = new M2MTokenCache(300);
    let executionCount = 0;

    const mockRefresher = vi.fn().mockImplementation(async () => {
      executionCount++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        accessToken: `token_exec_${executionCount}`,
        expiresIn: 3600,
      };
    });

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      cache.getOrFetch('shared-key', mockRefresher),
      cache.getOrFetch('shared-key', mockRefresher),
      cache.getOrFetch('shared-key', mockRefresher),
      cache.getOrFetch('shared-key', mockRefresher),
      cache.getOrFetch('shared-key', mockRefresher),
    ]);

    expect(results).toEqual([
      'token_exec_1',
      'token_exec_1',
      'token_exec_1',
      'token_exec_1',
      'token_exec_1',
    ]);
    expect(mockRefresher).toHaveBeenCalledTimes(1);
  });

  it('should bypass cache when force=true', async () => {
    const cache = new M2MTokenCache(300);
    let count = 0;
    const mockRefresher = vi.fn().mockImplementation(async () => {
      count++;
      return { accessToken: `token_${count}`, expiresIn: 3600 };
    });

    const t1 = await cache.getOrFetch('key', mockRefresher, false);
    expect(t1).toBe('token_1');

    const t2 = await cache.getOrFetch('key', mockRefresher, true);
    expect(t2).toBe('token_2');
    expect(mockRefresher).toHaveBeenCalledTimes(2);
  });
});
