/**
 * Platform-safe auth primitives.
 *
 * This module contains only types and functions that are safe to use in
 * Node.js, browsers, and React Native / Expo (Hermes engine).  It has no
 * dependency on `jose`, Node.js crypto, or any server-side package.
 *
 * It is the single source of truth imported by both the web / mobile client
 * bundles and the API server so that the type definitions stay in sync.
 */

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Cognito ID-token / access-token claims.
 * Only a subset of standard Cognito claims is listed here.
 */
export interface CognitoJwtPayload {
  sub: string;
  /** Present on ID tokens */
  email?: string;
  /** Present on access tokens */
  username?: string;
  /** Present on ID tokens */
  'cognito:username'?: string;
  /** Group membership (e.g. ["ADMIN", "SELLER"]) */
  'cognito:groups'?: string[];
  /** "id" for ID tokens, "access" for access tokens */
  token_use: 'id' | 'access';
  iss: string;
  /** Audience – app client ID, present on ID tokens */
  aud?: string;
  /** App client ID, present on access tokens */
  client_id?: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
}

/**
 * Decodes a JWT without verifying the signature.
 * For cryptographic verification use `verifyCognitoToken` (API-server only).
 *
 * Platform support: Node.js ≥ 16, all modern browsers, and React Native
 * (Hermes engine).  A Buffer-based fallback is used in Node environments
 * where the global `atob` is not present (Node < 16).
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    // Convert base64url → base64 then decode.
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
    // Use atob when available (browsers, React Native/Hermes, Node ≥ 16),
    // fall back to Buffer for older Node.js runtimes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bufferGlobal = (globalThis as Record<string, any>)['Buffer'] as
      | { from(s: string, enc: string): { toString(enc: string): string } }
      | undefined;
    if (typeof atob !== 'function' && !bufferGlobal) {
      throw new Error('No base64 decoder available: need atob (Node ≥ 16 / browsers / React Native) or Buffer (Node < 16)');
    }
    const json =
      typeof atob === 'function'
        ? atob(padded)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        : bufferGlobal!.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Returns true if the decoded payload is expired. */
export function isTokenExpired(payload: JwtPayload): boolean {
  if (!payload.exp) return false;
  return Date.now() / 1000 > payload.exp;
}

/** Extracts the Bearer token from an Authorization header value. */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
