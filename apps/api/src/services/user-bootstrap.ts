import { prisma, type User } from '@arremate/database';
import type { CognitoJwtPayload } from '@arremate/auth';

function parseNormalizedEmailList(raw: string | undefined): Set<string> {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function shouldBeAdmin(claims: CognitoJwtPayload, email: string): boolean {
  const groups = claims['cognito:groups'] ?? [];
  if (groups.includes('ADMIN')) return true;
  const allowlist = parseNormalizedEmailList(process.env.ADMIN_BOOTSTRAP_EMAILS);
  return allowlist.has(email.toLowerCase());
}

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
  const { sub } = claims;

  const email = claims.email
    ?? claims.username
    ?? claims['cognito:username']
    ?? `${sub}@users.arremate.local`;

  const adminPromotion = shouldBeAdmin(claims, email);

  const user = await prisma.user.upsert({
    where: { cognitoSub: sub },
    update: {
      // Keep email in sync in case the user changed it in Cognito.
      email,
      ...(adminPromotion ? { role: 'ADMIN' as const } : {}),
    },
    create: {
      cognitoSub: sub,
      email,
      // name can be filled later from the profile endpoint or Cognito claims.
      name: claims['cognito:username'] ?? claims.username ?? null,
      // New users always start as BUYER; role promotion happens via admin actions.
      role: adminPromotion ? 'ADMIN' : 'BUYER',
    },
  });

  return user;
}
