import { prisma, Prisma, type User } from '@arremate/database';
import type { CognitoJwtPayload } from '@arremate/auth';

const legacyUserSelect = {
  id: true,
  cognitoSub: true,
  email: true,
  name: true,
  role: true,
  isSuspended: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type LegacyUserRecord = Prisma.UserGetPayload<{ select: typeof legacyUserSelect }>;

function isMissingActiveRoleColumnError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError
    && err.code === 'P2022'
    && String(err.meta?.column ?? '').includes('activeRole');
}

function withNullActiveRole(user: LegacyUserRecord): User {
  return {
    ...user,
    activeRole: null,
  };
}

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
 *
 * Fast path: if the user already exists and neither the email nor the role
 * needs updating, the record is returned immediately without a write query.
 */
export async function bootstrapUser(claims: CognitoJwtPayload): Promise<User> {
  const { sub } = claims;

  const email = claims.email
    ?? claims.username
    ?? claims['cognito:username']
    ?? `${sub}@users.arremate.local`;

  const adminPromotion = shouldBeAdmin(claims, email);

  // Fast path: avoid a DB write on every request for existing, up-to-date users.
  try {
    const existing = await prisma.user.findUnique({ where: { cognitoSub: sub } });
    if (existing) {
      const emailUpToDate = existing.email === email;
      const roleUpToDate = !adminPromotion || existing.role === 'ADMIN';
      if (emailUpToDate && roleUpToDate) {
        return existing;
      }
    }
  } catch (fastPathErr) {
    if (!isMissingActiveRoleColumnError(fastPathErr)) throw fastPathErr;
    // Legacy schema without activeRole column – fall through to the upsert
    // which handles the same error via legacyUserSelect.
  }

  try {
    return await prisma.user.upsert({
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
  } catch (err) {
    if (isMissingActiveRoleColumnError(err)) {
      const legacyUser = await prisma.user.upsert({
        where: { cognitoSub: sub },
        update: {
          email,
          ...(adminPromotion ? { role: 'ADMIN' as const } : {}),
        },
        create: {
          cognitoSub: sub,
          email,
          name: claims['cognito:username'] ?? claims.username ?? null,
          role: adminPromotion ? 'ADMIN' : 'BUYER',
        },
        select: legacyUserSelect,
      });

      return withNullActiveRole(legacyUser);
    }

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
          try {
            const linked = await prisma.user.update({
              where: { id: byEmail.id },
              data: {
                cognitoSub: sub,
                ...(adminPromotion ? { role: 'ADMIN' as const } : {}),
              },
            });

            return linked;
          } catch (linkErr) {
            if (isMissingActiveRoleColumnError(linkErr)) {
              const linked = await prisma.user.update({
                where: { id: byEmail.id },
                data: {
                  cognitoSub: sub,
                  ...(adminPromotion ? { role: 'ADMIN' as const } : {}),
                },
                select: legacyUserSelect,
              });

              return withNullActiveRole(linked);
            }

            // A concurrent request may have already linked this cognitoSub.
            if (linkErr instanceof Prisma.PrismaClientKnownRequestError && linkErr.code === 'P2002') {
              const linked = await prisma.user.findUnique({ where: { cognitoSub: sub } });
              if (linked) return linked;
            }
            throw linkErr;
          }
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
