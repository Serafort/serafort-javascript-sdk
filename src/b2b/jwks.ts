import { AuthenticationError, NetworkError } from '../errors.js';
import { JWK, JWKS, SerafortConfig } from '../types.js';

export class JwksClient {
  private readonly jwksUrl: string;
  private readonly fetchImpl: typeof fetch;
  private cachedKeys: Map<string, CryptoKey> = new Map();
  private lastFetchedAt = 0;
  private readonly cacheTtlMs: number;

  constructor(config: SerafortConfig, cacheTtlMs = 3600_000) {
    const baseUrl = (config.endpoint || config.baseUrl || 'https://api.serafort.com').replace(/\/+$/, '');
    this.jwksUrl = `${baseUrl}/.well-known/jwks.json`;
    this.fetchImpl = config.fetch || globalThis.fetch.bind(globalThis);
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Retrieves the CryptoKey matching the key ID (kid) from cache, or fetches from the JWKS endpoint.
   */
  public async getVerificationKey(kid?: string, alg = 'RS256'): Promise<CryptoKey> {
    const now = Date.now();
    const isCacheExpired = now - this.lastFetchedAt > this.cacheTtlMs;

    if (this.cachedKeys.size > 0 && !isCacheExpired) {
      if (kid && this.cachedKeys.has(kid)) {
        return this.cachedKeys.get(kid)!;
      }
      // If no kid specified but we have exactly 1 key cached, return it
      if (!kid && this.cachedKeys.size === 1) {
        return Array.from(this.cachedKeys.values())[0]!;
      }
    }

    // Refresh keys from JWKS endpoint
    await this.refreshJwks();

    if (kid && this.cachedKeys.has(kid)) {
      return this.cachedKeys.get(kid)!;
    }

    if (!kid && this.cachedKeys.size > 0) {
      return Array.from(this.cachedKeys.values())[0]!;
    }

    throw new AuthenticationError(
      `No matching public key found in JWKS for kid "${kid || 'unspecified'}" and alg "${alg}".`,
      'KEY_NOT_FOUND'
    );
  }

  /**
   * Refreshes public keys from the JWKS endpoint and imports them as CryptoKeys.
   */
  public async refreshJwks(): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.jwksUrl, {
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      throw new NetworkError(`Failed to fetch JWKS from ${this.jwksUrl}`, err);
    }

    if (!response.ok) {
      throw new AuthenticationError(`Failed to fetch JWKS (status ${response.status})`, 'JWKS_FETCH_FAILED');
    }

    const jwks = (await response.json()) as JWKS;
    if (!jwks.keys || !Array.isArray(jwks.keys)) {
      throw new AuthenticationError('Invalid JWKS response format: "keys" array missing', 'INVALID_JWKS');
    }

    const newKeys = new Map<string, CryptoKey>();

    for (const key of jwks.keys) {
      if (!key.kid) continue;
      try {
        const cryptoKey = await this.importJwk(key);
        newKeys.set(key.kid, cryptoKey);
      } catch {
        // Skip keys with unsupported algorithms or malformed structures
      }
    }

    this.cachedKeys = newKeys;
    this.lastFetchedAt = Date.now();
  }

  /**
   * Imports a raw JWK into a Web Crypto CryptoKey.
   */
  public async importJwk(key: JWK): Promise<CryptoKey> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new AuthenticationError('Web Crypto API (crypto.subtle) is not available in this environment.');
    }

    const alg = key.alg || (key.kty === 'RSA' ? 'RS256' : 'ES256');

    let importAlgorithm: RsaHashedImportParams | EcKeyImportParams;

    if (alg.startsWith('RS')) {
      const hashName = alg === 'RS384' ? 'SHA-384' : alg === 'RS512' ? 'SHA-512' : 'SHA-256';
      importAlgorithm = {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: hashName },
      };
    } else if (alg.startsWith('ES')) {
      const namedCurve = alg === 'ES384' ? 'P-384' : alg === 'ES512' ? 'P-521' : 'P-256';
      importAlgorithm = {
        name: 'ECDSA',
        namedCurve,
      };
    } else {
      throw new AuthenticationError(`Unsupported key algorithm: ${alg}`);
    }

    return subtle.importKey(
      'jwk',
      key,
      importAlgorithm,
      false, // non-extractable
      ['verify']
    );
  }
}
