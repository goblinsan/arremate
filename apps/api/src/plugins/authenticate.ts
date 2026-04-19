import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractBearerToken, verifyCognitoToken } from '@arremate/auth';
import type { CognitoJwtPayload } from '@arremate/auth';
import { bootstrapUser } from '../services/user-bootstrap.js';
import type { User } from '@arremate/database';

declare module 'fastify' {
  interface FastifyRequest {
    /** Verified Cognito token claims. Populated by authenticate hook. */
    cognitoClaims?: CognitoJwtPayload;
    /** Local User record. Populated by authenticate hook after user bootstrap. */
    currentUser?: User;
  }
}

/**
 * Resolves Cognito environment settings from process.env.
 * Throws if required variables are missing.
 */
function getCognitoConfig() {
  const region = process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_WEB_CLIENT_ID;

  if (!region || !userPoolId) {
    throw new Error(
      'Missing COGNITO_REGION or COGNITO_USER_POOL_ID environment variables',
    );
  }

  return { region, userPoolId, clientId };
}

/**
 * Fastify preHandler hook that validates the Cognito JWT from the
 * Authorization header and populates request.cognitoClaims and
 * request.currentUser.
 *
 * Returns 401 for missing or invalid tokens.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);

  if (!token) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Missing Authorization header' });
  }

  let claims: CognitoJwtPayload;
  try {
    const config = getCognitoConfig();
    claims = await verifyCognitoToken(token, {
      region: config.region,
      userPoolId: config.userPoolId,
      clientId: config.clientId,
      tokenUse: 'access',
    });
  } catch (err) {
    request.log.warn({ err }, 'JWT verification failed');
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  request.cognitoClaims = claims;

  // Bootstrap / refresh the local user record for this identity.
  request.currentUser = await bootstrapUser(claims);
}
