import { prisma, type User } from '@arremate/database';
import type { CognitoJwtPayload } from '@arremate/auth';

/**
 * Upserts a local User record based on the verified Cognito JWT claims.
 *
 * - First login: creates the local User record with BUYER role by default.
 * - Subsequent logins: reconciles email (in case it changed in Cognito).
 *
 * The `cognitoSub` is used as the stable identity link between Cognito and
 * the local database record.
 */
export async function bootstrapUser(claims: CognitoJwtPayload): Promise<User> {
  const { sub, email } = claims;

  if (!email) {
    throw new Error('Cognito token is missing email claim – ensure the openid+email scope is requested');
  }

  const user = await prisma.user.upsert({
    where: { cognitoSub: sub },
    update: {
      // Keep email in sync in case the user changed it in Cognito.
      email,
    },
    create: {
      cognitoSub: sub,
      email,
      // name can be filled later from the profile endpoint or Cognito claims.
      name: claims['cognito:username'] ?? null,
      // New users always start as BUYER; role promotion happens via admin actions.
      role: 'BUYER',
    },
  });

  return user;
}
