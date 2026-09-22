import { AuthenticationError } from '../errors.js';

export interface DecodedJwt<T = Record<string, unknown>> {
  header: {
    alg: string;
    typ?: string;
    kid?: string;
    [key: string]: unknown;
  };
  payload: T;
  signature: Uint8Array;
  signingInput: Uint8Array;
}

/**
 * Decodes a base64url-encoded string into raw Uint8Array bytes.
 */
export function base64UrlToBytes(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64url'));
  }

  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) {
    base64 += '==';
  } else if (pad === 3) {
    base64 += '=';
  }

  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes a base64url-encoded string into a UTF-8 string.
 */
export function base64UrlDecode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }

  const bytes = base64UrlToBytes(str);
  return new TextDecoder().decode(bytes);
}

/**
 * Parses and separates the JWT into header, payload, signature, and signing input.
 */
export function parseJwt<T = Record<string, unknown>>(token: string): DecodedJwt<T> {
  if (!token || typeof token !== 'string') {
    throw new AuthenticationError('JWT token must be a non-empty string.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthenticationError('Invalid JWT format: token must contain exactly 3 dot-separated parts.');
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  try {
    const headerJson = base64UrlDecode(headerB64);
    const header = JSON.parse(headerJson) as DecodedJwt['header'];

    const payloadJson = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadJson) as T;

    const signature = base64UrlToBytes(signatureB64);
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    return {
      header,
      payload,
      signature,
      signingInput,
    };
  } catch (err: unknown) {
    if (err instanceof AuthenticationError) throw err;
    throw new AuthenticationError(`Failed to parse JWT token: ${err instanceof Error ? err.message : String(err)}`);
  }
}
