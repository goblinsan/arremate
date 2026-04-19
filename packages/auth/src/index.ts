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
 * For verification use a proper JWT library (e.g. jose) in the API.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    // Convert base64url → base64 then decode. atob is available in Node ≥16 and all browsers.
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
    const json = atob(padded);
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

export { verifyCognitoToken } from './cognito-verifier.js';
export type { CognitoVerifierOptions } from './cognito-verifier.js';
