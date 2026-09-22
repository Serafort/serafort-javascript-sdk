import { AuthenticationError } from '../errors.js';
import { SerafortConfig, UserContext } from '../types.js';
import { parseJwt } from '../utils/jwt.js';
import { JwksClient } from './jwks.js';

export interface TokenValidationOptions {
  /** Expected JWT issuer (iss) */
  expectedIssuer?: string;
  /** Expected JWT audience (aud) */
  expectedAudience?: string;
  /** Allowed clock tolerance in seconds (default: 60s) */
  clockToleranceSeconds?: number;
  /** If true, skips cryptographic signature verification (ONLY for offline dev/testing) */
  skipSignatureCheck?: boolean;
}

export class B2BModule {
  public readonly config: SerafortConfig;
  private readonly jwksClient: JwksClient;
  private readonly baseUrl: string;

  constructor(config: SerafortConfig, jwksClient?: JwksClient) {
    this.config = config;
    this.jwksClient = jwksClient ?? new JwksClient(config);
    this.baseUrl = (config.endpoint || config.baseUrl || 'https://api.serafort.com').replace(/\/+$/, '');
  }

  /**
   * Validates a JWT token locally: checks signature against cached JWKS, verifies expiration,
   * issuer, and audience, and decodes claims into a strongly-typed UserContext.
   */
  public async validateToken(token: string, options: TokenValidationOptions = {}): Promise<UserContext> {
    const decoded = parseJwt<Record<string, unknown>>(token);
    const now = Math.floor(Date.now() / 1000);
    const clockTolerance = options.clockToleranceSeconds ?? 60;

    const payload = decoded.payload;

    // 1. Expiration check
    if (typeof payload['exp'] === 'number') {
      if (payload['exp'] + clockTolerance < now) {
        throw new AuthenticationError('Token has expired.', 'TOKEN_EXPIRED');
      }
    }

    // 2. Not before check
    if (typeof payload['nbf'] === 'number') {
      if (payload['nbf'] - clockTolerance > now) {
        throw new AuthenticationError('Token not yet valid.', 'TOKEN_NOT_YET_VALID');
      }
    }

    // 3. Issuer check
    const expectedIssuer = options.expectedIssuer || this.baseUrl;
    if (expectedIssuer && typeof payload['iss'] === 'string') {
      if (payload['iss'] !== expectedIssuer) {
        throw new AuthenticationError(
          `Invalid token issuer. Expected "${expectedIssuer}", received "${payload['iss']}".`,
          'INVALID_ISSUER'
        );
      }
    }

    // 4. Audience check
    if (options.expectedAudience && payload['aud']) {
      const aud = Array.isArray(payload['aud']) ? payload['aud'] : [payload['aud']];
      if (!aud.includes(options.expectedAudience)) {
        throw new AuthenticationError(
          `Invalid token audience. Expected "${options.expectedAudience}".`,
          'INVALID_AUDIENCE'
        );
      }
    }

    // 5. Cryptographic signature check (Web Crypto API)
    if (!options.skipSignatureCheck) {
      const subtle = globalThis.crypto?.subtle;
      if (!subtle) {
        throw new AuthenticationError('Web Crypto API (crypto.subtle) is not available to verify JWT signature.');
      }

      const kid = decoded.header.kid;
      const alg = decoded.header.alg || 'RS256';

      const cryptoKey = await this.jwksClient.getVerificationKey(kid, alg);

      let verifyAlgorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
      if (alg.startsWith('RS')) {
        verifyAlgorithm = { name: 'RSASSA-PKCS1-v1_5' };
      } else if (alg.startsWith('ES')) {
        verifyAlgorithm = { name: 'ECDSA', hash: { name: alg === 'ES384' ? 'SHA-384' : alg === 'ES512' ? 'SHA-512' : 'SHA-256' } };
      } else {
        throw new AuthenticationError(`Unsupported JWT algorithm for signature verification: ${alg}`);
      }

      const isValid = await subtle.verify(
        verifyAlgorithm,
        cryptoKey,
        decoded.signature as unknown as BufferSource,
        decoded.signingInput as unknown as BufferSource
      );

      if (!isValid) {
        throw new AuthenticationError('JWT signature verification failed.', 'INVALID_SIGNATURE');
      }
    }

    // 6. Map into UserContext
    return this.mapClaimsToUserContext(payload);
  }

  /**
   * Checks if the user context contains a specific granular permission.
   * Supports wildcard matching (e.g. "org:*" matches "org:read").
   */
  public hasPermission(userContext: UserContext, requiredPermission: string): boolean {
    if (!userContext.permissions || userContext.permissions.length === 0) {
      return false;
    }

    if (userContext.permissions.includes('*') || userContext.permissions.includes(requiredPermission)) {
      return true;
    }

    return userContext.permissions.some((perm) => {
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -2);
        return requiredPermission.startsWith(prefix);
      }
      return false;
    });
  }

  /**
   * Checks if the user context contains a specific role.
   */
  public hasRole(userContext: UserContext, requiredRole: string): boolean {
    return Array.isArray(userContext.roles) && userContext.roles.includes(requiredRole);
  }

  /**
   * Constructs the Enterprise SSO Login URL for a specific tenant/organization.
   */
  public getLoginUrl(tenantId: string, redirectUri: string, options: { state?: string; connection?: string } = {}): string {
    const url = new URL(`${this.baseUrl}/api/auth/sso/login`);
    url.searchParams.set('tenant_id', tenantId);
    url.searchParams.set('redirect_uri', redirectUri);

    if (options.state) {
      url.searchParams.set('state', options.state);
    }
    if (options.connection) {
      url.searchParams.set('connection', options.connection);
    }

    return url.toString();
  }

  /**
   * Maps un-enveloped JWT claims to standard UserContext.
   */
  private mapClaimsToUserContext(claims: Record<string, unknown>): UserContext {
    const userId = String(claims['sub'] || claims['id'] || claims['user_id'] || '');
    const tenantId = String(
      claims['tenant_id'] ||
      claims['org_id'] ||
      claims['tid'] ||
      (claims['app_metadata'] as Record<string, unknown> | undefined)?.['tenant_id'] ||
      ''
    );
    const email = claims['email'] ? String(claims['email']) : undefined;

    // Roles extraction
    let roles: string[] = [];
    if (Array.isArray(claims['roles'])) {
      roles = claims['roles'].map(String);
    } else if (typeof claims['role'] === 'string') {
      roles = [claims['role']];
    } else if (typeof claims['roles'] === 'string') {
      roles = claims['roles'].split(',').map((r) => r.trim());
    }

    // Permissions extraction
    let permissions: string[] = [];
    if (Array.isArray(claims['permissions'])) {
      permissions = claims['permissions'].map(String);
    } else if (typeof claims['scope'] === 'string') {
      permissions = claims['scope'].split(' ').map((s) => s.trim()).filter(Boolean);
    }

    return {
      userId,
      tenantId,
      email,
      roles,
      permissions,
      claims,
    };
  }
}
