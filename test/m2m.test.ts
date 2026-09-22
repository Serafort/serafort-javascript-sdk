import { describe, it, expect, vi } from 'vitest';
import { M2MModule } from '../src/m2m/m2m.js';
import { AuthenticationError, RateLimitError } from '../src/errors.js';

describe('M2MModule', () => {
  it('should successfully fetch access token via client credentials grant', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'm2m_super_secret_token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    const m2m = new M2MModule({
      endpoint: 'https://auth.example.com',
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const token = await m2m.getAccessToken(['read:users', 'write:users']);
    expect(token).toBe('m2m_super_secret_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://auth.example.com/oauth/token');
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].body).toContain('grant_type=client_credentials');
    expect(callArgs[1].body).toContain('client_id=my-client-id');
    expect(callArgs[1].body).toContain('client_secret=my-client-secret');

    // Second call with same scopes should hit cache without network call
    const cachedToken = await m2m.getAccessToken(['read:users', 'write:users']);
    expect(cachedToken).toBe('m2m_super_secret_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw AuthenticationError on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 'error',
        error: {
          code: 'INVALID_CLIENT',
          message: 'Client authentication failed',
          status: 401,
        },
      }),
    });

    const m2m = new M2MModule({
      endpoint: 'https://auth.example.com',
      clientId: 'bad-client',
      clientSecret: 'bad-secret',
      fetch: mockFetch as unknown as typeof fetch,
    });

    await expect(m2m.getAccessToken()).rejects.toThrow(AuthenticationError);
  });

  it('should retry on 429 rate limit error', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '0' }),
          json: async () => ({
            status: 'error',
            error: { code: 'RATE_LIMIT', message: 'Slow down', status: 429 },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'recovered_token',
          expires_in: 3600,
        }),
      };
    });

    const m2m = new M2MModule({
      endpoint: 'https://auth.example.com',
      clientId: 'client',
      clientSecret: 'secret',
      retryPolicy: { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50 },
      fetch: mockFetch as unknown as typeof fetch,
    });

    const token = await m2m.getAccessToken();
    expect(token).toBe('recovered_token');
    expect(callCount).toBe(2);
  });
});
