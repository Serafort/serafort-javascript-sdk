import { RateLimitError, NetworkError } from '../errors.js';
import { RetryConfig } from '../types.js';

export interface ExecuteWithRetryOptions {
  retryConfig?: RetryConfig;
  signal?: AbortSignal;
}

/**
 * Executes an async operation with exponential backoff and jitter on retryable errors
 * (HTTP 429, 502, 503, 504, and transient network errors).
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: ExecuteWithRetryOptions = {}
): Promise<T> {
  const maxRetries = options.retryConfig?.maxRetries ?? 3;
  const initialDelay = options.retryConfig?.initialDelayMs ?? 500;
  const maxDelay = options.retryConfig?.maxDelayMs ?? 5000;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }

      const isRetryable = isErrorRetryable(err);
      if (!isRetryable) {
        throw err;
      }

      // Check if aborted
      if (options.signal?.aborted) {
        throw new NetworkError('Request aborted by caller', options.signal.reason);
      }

      let delay = initialDelay * Math.pow(2, attempt - 1);
      // If error is RateLimitError and provides retryAfterSeconds, respect it if within reason
      if (err instanceof RateLimitError && err.retryAfterSeconds) {
        delay = Math.max(delay, err.retryAfterSeconds * 1000);
      }

      // Add jitter: +/- 20%
      const jitter = delay * (0.8 + Math.random() * 0.4);
      const cappedDelay = Math.min(jitter, maxDelay);

      await sleep(cappedDelay, options.signal);
    }
  }
}

function isErrorRetryable(err: unknown): boolean {
  if (err instanceof RateLimitError) {
    return true;
  }
  if (err instanceof NetworkError) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout')
    ) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new NetworkError('Request aborted while sleeping', signal.reason));
    }

    const timer = setTimeout(() => {
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new NetworkError('Request aborted', signal.reason));
        },
        { once: true }
      );
    }
  });
}
