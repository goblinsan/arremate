/**
 * Mobile-safe re-exports from @arremate/auth.
 *
 * This entry point exposes only the utilities that are safe to import in
 * React Native / Expo bundles.  It intentionally omits `verifyCognitoToken`
 * (and its `jose` / Node.js crypto dependencies) which is API-server-only.
 *
 * The mobile tsconfig.json maps `@arremate/auth` to this file so that the
 * TypeScript checker never pulls in server-only modules.
 */
export {
  decodeJwtPayload,
  isTokenExpired,
  extractBearerToken,
} from './base.js';

export type {
  JwtPayload,
  CognitoJwtPayload,
  AuthTokens,
} from './base.js';
