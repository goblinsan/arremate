import { createMiddleware } from 'hono/factory';
import { extractBearerToken, verifyCognitoToken } from '@arremate/auth';
import type { CognitoJwtPayload } from '@arremate/auth';
import { bootstrapUser } from '../services/user-bootstrap.js';
import type { AppEnv } from '../types.js';

interface CognitoGetUserResponse {
  Username?: string;
  UserAttributes?: Array<{ Name: string; Value: string }>;
}

async function fetchCognitoUserProfile(region: string, accessToken: string): Promise<{ email?: string; username?: string }> {
  try {
    const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
      },
      body: JSON.stringify({ AccessToken: accessToken }),
    });

    if (!response.ok) return {};
    const body = (await response.json()) as CognitoGetUserResponse;
    const email = body.UserAttributes?.find((attr) => attr.Name === 'email')?.Value;
    return {
      email,
      username: body.Username,
    };
  } catch (err) {
    console.warn('[authenticate] fetchCognitoUserProfile failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

function getCognitoConfig() {
  const region = process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_WEB_CLIENT_ID;

  if (!region || !userPoolId) {
    throw new Error('Missing COGNITO_REGION or COGNITO_USER_POOL_ID environment variables');
  }

  return { region, userPoolId, clientId };
}

/**
 * Hono middleware that validates the Cognito JWT from the Authorization header
 * and populates c.get('cognitoClaims') and c.get('currentUser').
 *
 * Returns 401 for missing or invalid tokens.
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'));

  if (!token) {
    return c.json({ statusCode: 401, error: 'Unauthorized', message: 'Missing Authorization header' }, 401);
  }

  let claims: CognitoJwtPayload;
  let config: ReturnType<typeof getCognitoConfig>;
  try {
    config = getCognitoConfig();
    claims = await verifyCognitoToken(token, {
      region: config.region,
      userPoolId: config.userPoolId,
      clientId: config.clientId,
      tokenUse: 'access',
    });
  } catch {
    return c.json({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }

  if (!claims.email || !claims.username) {
    const profile = await fetchCognitoUserProfile(config.region, token);
    claims = {
      ...claims,
      email: claims.email ?? profile.email,
      username: claims.username ?? profile.username,
    };
  }

  c.set('cognitoClaims', claims);
  let currentUser;
  try {
    currentUser = await bootstrapUser(claims);
  } catch (firstErr) {
    // A single retry absorbs transient DB race/connection failures observed in production.
    try {
      currentUser = await bootstrapUser(claims);
    } catch (secondErr) {
      console.error(
        '[authenticate] bootstrapUser failed',
        {
          requestId: c.req.header('x-request-id') ?? 'unknown',
          url: c.req.url,
          firstError: firstErr instanceof Error ? firstErr.message : String(firstErr),
          secondError: secondErr instanceof Error ? secondErr.message : String(secondErr),
        },
      );
      return c.json(
        {
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Authentication backend temporarily unavailable',
        },
        503,
      );
    }
  }

  c.set('currentUser', currentUser);
  await next();
});
