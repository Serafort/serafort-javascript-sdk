// Core Client
export { SerafortClient } from './client.js';

// Modules
export { M2MModule } from './m2m/m2m.js';
export { M2MTokenCache } from './m2m/cache.js';
export { B2BModule, TokenValidationOptions } from './b2b/b2b.js';
export { JwksClient } from './b2b/jwks.js';

// Errors
export {
  SerafortError,
  AuthenticationError,
  MfaRequiredError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  NetworkError,
} from './errors.js';

// Types & Contracts
export type {
  SerafortConfig,
  RetryConfig,
  UserContext,
  OAuthTokenResponse,
  JWK,
  JWKS,
  ApiErrorDetail,
  ApiErrorEnvelope,
} from './types.js';

// Utilities
export { parseJwt, base64UrlDecode, base64UrlToBytes } from './utils/jwt.js';
export { executeWithRetry } from './utils/retry.js';
