import { prisma, Prisma, type User } from '@arremate/database';
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

  try {
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // First check: is there already a record for this Cognito identity?
      const bySub = await prisma.user.findUnique({ where: { cognitoSub: sub } });
      if (bySub) return bySub;

      // Second check: a local account with this email exists but has no cognitoSub
      // (e.g. the user previously registered via username/password and is now
      // signing in with a federated provider for the first time). Link the
      // Cognito identity to that existing account so the user gets seamless access.
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        if (!byEmail.cognitoSub) {
          return prisma.user.update({
            where: { id: byEmail.id },
            data: {
              cognitoSub: sub,
              ...(adminPromotion ? { role: 'ADMIN' as const } : {}),
            },
          });
        }
        // The email is claimed by an account that is already linked to a
        // *different* Cognito identity – this is a genuine collision.
        console.warn(
          '[bootstrapUser] P2002: email already linked to a different cognitoSub',
          { sub, email },
        );
      } else {
        // No record found for either cognitoSub or email despite the constraint
        // error – unexpected data inconsistency.
        console.warn('[bootstrapUser] P2002 conflict but no user found for cognitoSub or email:', { sub, email });
      }
    }
    throw err;
  }
}
