import { ApiErrorDetail } from './types.js';

/**
 * Base exception class for all Serafort SDK errors.
 */
export class SerafortError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: ApiErrorDetail[];

  constructor(message: string, code = 'SERAFORT_ERROR', status = 500, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'SerafortError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Authentication failed (invalid credentials, expired session, invalid JWT signature).
 */
export class AuthenticationError extends SerafortError {
  constructor(message = 'Authentication failed or session is invalid.', code = 'AUTHENTICATION_ERROR', details: ApiErrorDetail[] = []) {
    super(message, code, 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Multi-Factor Authentication required to complete access.
 */
export class MfaRequiredError extends SerafortError {
  public readonly challengeId?: string;
  public readonly supportedMethods?: string[];

  constructor(
    message = 'Multi-factor authentication required.',
    challengeId?: string,
    supportedMethods?: string[],
    details: ApiErrorDetail[] = []
  ) {
    super(message, 'MFA_REQUIRED', 403, details);
    this.name = 'MfaRequiredError';
    this.challengeId = challengeId;
    this.supportedMethods = supportedMethods;
  }
}

/**
 * Request payload failed validation checks.
 */
export class ValidationError extends SerafortError {
  constructor(message = 'Validation failed on input parameters.', details: ApiErrorDetail[] = []) {
    super(message, 'VALIDATION_ERROR', 422, details);
    this.name = 'ValidationError';
  }
}

/**
 * Rate limit exceeded (HTTP 429).
 */
export class RateLimitError extends SerafortError {
  public readonly retryAfterSeconds?: number;

  constructor(message = 'Rate limit exceeded. Please slow down requests.', retryAfterSeconds?: number, details: ApiErrorDetail[] = []) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Requested resource or tenant does not exist.
 */
export class NotFoundError extends SerafortError {
  constructor(message = 'Resource not found.', code = 'NOT_FOUND', details: ApiErrorDetail[] = []) {
    super(message, code, 404, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Network failure, client-side timeout, or host unreachable.
 */
export class NetworkError extends SerafortError {
  constructor(message = 'Failed to connect to Serafort IAM service.', cause?: unknown) {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
    if (cause) {
      this.cause = cause;
    }
  }
}
