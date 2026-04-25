import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { CognitoJwtPayload } from './index.js';

export interface CognitoVerifierOptions {
  region: string;
  userPoolId: string;
  /** Expected audience (app client ID). Required for ID tokens. */
  clientId?: string;
  /** Token use to enforce: "id" | "access". Defaults to "access". */
  tokenUse?: 'id' | 'access';
}

// Cache RemoteJWKSet instances by JWKS URL so the same instance (and its
// built-in key cache) is reused across calls, avoiding repeated network
// round-trips to the Cognito JWKS endpoint on every request.
// Node.js runs in a single-threaded event loop, so a plain Map is safe here.
const jwksInstanceCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getCachedJWKS(jwksUri: URL): ReturnType<typeof createRemoteJWKSet> {
  const key = jwksUri.toString();
  let instance = jwksInstanceCache.get(key);
  if (!instance) {
    instance = createRemoteJWKSet(jwksUri);
    jwksInstanceCache.set(key, instance);
  }
  return instance;
}

/**
 * Verifies a Cognito JWT (ID or access token) using the user pool's JWKS.
 *
 * Throws a `JWTInvalid`, `JWTExpired`, or `JWTClaimValidationFailed` error
 * from `jose` when the token is invalid or expired.
 *
 * @param token - Raw JWT string (without "Bearer " prefix)
 */
export async function verifyCognitoToken(
  token: string,
  options: CognitoVerifierOptions,
): Promise<CognitoJwtPayload> {
  const { region, userPoolId, clientId, tokenUse = 'access' } = options;

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwksUri = new URL(`${issuer}/.well-known/jwks.json`);

  const JWKS = getCachedJWKS(jwksUri);

  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    issuer,
    algorithms: ['RS256'],
  };

  // For ID tokens the audience claim is the app client ID.
  if (tokenUse === 'id' && clientId) {
    verifyOptions.audience = clientId;
  }

  const { payload } = await jwtVerify(token, JWKS, verifyOptions);
  const claims = payload as JWTPayload & CognitoJwtPayload;

  // Validate token_use claim.
  if (claims.token_use !== tokenUse) {
    throw new Error(
      `Invalid token_use: expected "${tokenUse}", got "${claims.token_use}"`,
    );
  }

  // For access tokens, validate client_id instead of aud.
  if (tokenUse === 'access' && clientId && claims.client_id !== clientId) {
    throw new Error(
      `Invalid client_id: expected "${clientId}", got "${claims.client_id}"`,
    );
  }

  return claims;
}
