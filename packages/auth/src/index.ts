export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Decodes a JWT without verifying the signature.
 * For verification use a proper JWT library (e.g. jose) in the API.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payloadB64] = token.split('.');
    const json = Buffer.from(payloadB64, 'base64url').toString('utf-8');
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
