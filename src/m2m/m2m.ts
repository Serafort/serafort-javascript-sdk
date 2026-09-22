import { AuthenticationError, RateLimitError, SerafortError, NetworkError } from '../errors.js';
import { SerafortConfig, OAuthTokenResponse, ApiErrorEnvelope } from '../types.js';
import { executeWithRetry } from '../utils/retry.js';
import { M2MTokenCache } from './cache.js';

export class M2MModule {
  private readonly config: SerafortConfig;
  private readonly cache: M2MTokenCache;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SerafortConfig, cache?: M2MTokenCache) {
    this.config = config;
    this.cache = cache ?? new M2MTokenCache();
    this.baseUrl = (config.endpoint || config.baseUrl || 'https://api.serafort.com').replace(/\/+$/, '');
    this.fetchImpl = config.fetch || globalThis.fetch.bind(globalThis);
  }

  /**
   * Retrieves a valid M2M access token.
   * Pulls from memory cache if valid and outside the refresh buffer.
   * If nearing expiration or missing, transparently requests a new token.
   */
  public async getAccessToken(scopes?: string[]): Promise<string> {
    const scopeStr = scopes && scopes.length > 0 ? scopes.sort().join(' ') : '';
    const cacheKey = `m2m:${this.config.clientId || 'default'}:${scopeStr}`;

    return this.cache.getOrFetch(cacheKey, () => this.fetchTokenNetwork(scopeStr), false);
  }

  /**
   * Forces a refresh of the access token, bypassing the cache.
   * Useful when an API endpoint returns 401 due to early revocation.
   */
  public async forceRefreshToken(scopes?: string[]): Promise<string> {
    const scopeStr = scopes && scopes.length > 0 ? scopes.sort().join(' ') : '';
    const cacheKey = `m2m:${this.config.clientId || 'default'}:${scopeStr}`;

    return this.cache.getOrFetch(cacheKey, () => this.fetchTokenNetwork(scopeStr), true);
  }

  /**
   * Clears the in-memory token cache.
   */
  public clearCache(): void {
    this.cache.invalidate();
  }

  /**
   * Performs the HTTP request to the OAuth2 token endpoint using Client Credentials grant.
   */
  private async fetchTokenNetwork(scope: string): Promise<{ accessToken: string; expiresIn: number; scope?: string }> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new AuthenticationError('M2M authentication requires clientId and clientSecret to be configured.');
    }

    const tokenUrl = `${this.baseUrl}/oauth/token`;

    const bodyParams = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (scope) {
      bodyParams.set('scope', scope);
    }

    return executeWithRetry(
      async () => {
        let response: Response;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.config.timeout ?? 10000);

          response = await this.fetchImpl(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: bodyParams.toString(),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
        } catch (err: unknown) {
          throw new NetworkError(`Failed to connect to token endpoint at ${tokenUrl}`, err);
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
          throw new RateLimitError('Rate limit exceeded on token endpoint', isNaN(retryAfterSec!) ? undefined : retryAfterSec);
        }

        if (!response.ok) {
          let errorPayload: ApiErrorEnvelope | undefined;
          try {
            errorPayload = (await response.json()) as ApiErrorEnvelope;
          } catch {
            // Non-JSON error body
          }

          const errorMessage = errorPayload?.error?.message || `OAuth token request failed with status ${response.status}`;
          const errorCode = errorPayload?.error?.code || 'TOKEN_REQUEST_FAILED';

          if (response.status === 401 || response.status === 400) {
            throw new AuthenticationError(errorMessage, errorCode);
          }

          throw new SerafortError(errorMessage, errorCode, response.status);
        }

        const data = (await response.json()) as OAuthTokenResponse;

        if (!data.access_token) {
          throw new SerafortError('OAuth token endpoint response did not contain access_token', 'INVALID_RESPONSE');
        }

        return {
          accessToken: data.access_token,
          expiresIn: data.expires_in || 3600,
          scope: data.scope,
        };
      },
      { retryConfig: this.config.retryPolicy }
    );
  }
}
