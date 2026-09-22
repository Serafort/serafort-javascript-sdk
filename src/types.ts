/**
 * Configuration options for initializing the Serafort SDK client.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries?: number;
  /** Initial retry delay in milliseconds. Default: 500ms */
  initialDelayMs?: number;
  /** Maximum retry delay in milliseconds. Default: 5000ms */
  maxDelayMs?: number;
}

export interface SerafortConfig {
  /** Base URL of the Serafort IAM backend (e.g. "https://auth.acme.com" or "http://localhost:3333") */
  endpoint?: string;
  /** Alias for endpoint */
  baseUrl?: string;
  /** Client identifier for Machine-to-Machine (M2M) authentication */
  clientId?: string;
  /** Client secret for Machine-to-Machine (M2M) authentication */
  clientSecret?: string;
  /** Publishable key for client-side and B2B public operations (starts with pk_live_ or pk_test_) */
  publishableKey?: string;
  /** Domain identifier (e.g. "auth.acme.com") */
  domain?: string;
  /** Request timeout in milliseconds. Default: 10,000ms */
  timeout?: number;
  /** Custom retry policy configuration for network resilience */
  retryPolicy?: RetryConfig;
  /** Custom fetch function implementation (defaults to global fetch) */
  fetch?: typeof fetch;
}

/**
 * Resolved user security context decoded from a verified JWT token.
 */
export interface UserContext {
  /** The unique user identifier */
  userId: string;
  /** The tenant or organization identifier */
  tenantId: string;
  /** The primary email address of the user, if available */
  email?: string;
  /** Assigned roles (e.g. ["admin", "billing_manager"]) */
  roles: string[];
  /** Granted granular permissions (e.g. ["org:read", "billing:write"]) */
  permissions: string[];
  /** Raw decoded JWT payload claims */
  claims: Record<string, unknown>;
}

/**
 * OAuth2 token response payload from /oauth/token.
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

/**
 * Standard JSON Web Key (JWK) structure according to RFC 7517.
 */
export interface JWK {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  [key: string]: unknown;
}

/**
 * Standard JSON Web Key Set (JWKS) structure according to RFC 7517.
 */
export interface JWKS {
  keys: JWK[];
}

/**
 * Standard API error detail item.
 */
export interface ApiErrorDetail {
  field?: string;
  message: string;
  rule?: string;
}

/**
 * Standard Serafort API response error envelope.
 */
export interface ApiErrorEnvelope {
  status: 'error';
  error: {
    code: string;
    message: string;
    status: number;
    details?: ApiErrorDetail[];
  };
}
