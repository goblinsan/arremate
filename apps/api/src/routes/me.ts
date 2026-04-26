import { Hono } from 'hono';
import { Prisma, withPrisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

const legacyMeSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isMissingActiveRoleColumnError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError
    && err.code === 'P2022'
    && String(err.meta?.column ?? '').includes('activeRole');
}

/**
 * GET /v1/me
 *
 * Returns the local User record and role for the currently authenticated user.
 * Requires a valid Cognito access token in the Authorization header.
 *
 * `activeRole` reflects which profile is currently active (null means the base
 * `role` is active). `isSeller` indicates whether the user has an approved
 * seller account and may switch to the seller profile.
 */
app.get('/v1/me', authenticate, (c) => {
  const user = c.get('currentUser');
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    activeRole: user.activeRole ?? null,
    isSeller: user.role === 'SELLER' || user.role === 'ADMIN',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * PATCH /v1/me
 *
 * Updates editable fields on the local User record for the currently
 * authenticated user.
 */
app.patch('/v1/me', authenticate, async (c) => {
  const user = c.get('currentUser');
  const body = await c.req.json<{ name?: string | null }>().catch(() => null);

  if (!body) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : null;
  if (rawName && rawName.length > 120) {
    return c.json({ statusCode: 422, error: 'Unprocessable Entity', message: 'name must be 120 characters or fewer' }, 422);
  }

  const updated = await withPrisma((prisma) => prisma.user.update({
    where: { id: user.id },
    data: { name: rawName || null },
  })).catch(async (err) => {
    if (!isMissingActiveRoleColumnError(err)) throw err;
    const legacyUser = await withPrisma((prisma) => prisma.user.update({
      where: { id: user.id },
      data: { name: rawName || null },
      select: legacyMeSelect,
    }));
    return {
      ...legacyUser,
      activeRole: null,
    };
  });

  return c.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    activeRole: updated.activeRole ?? null,
    isSeller: updated.role === 'SELLER' || updated.role === 'ADMIN',
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

/**
 * POST /v1/me/switch-profile
 *
 * Switches the authenticated user's active profile between BUYER and SELLER.
 * Only users with role SELLER (or ADMIN) may activate the seller profile.
 * Switching to BUYER is available to all authenticated users.
 */
app.post('/v1/me/switch-profile', authenticate, async (c) => {
  const user = c.get('currentUser');
  const body = await c.req.json<{ role: 'BUYER' | 'SELLER' }>().catch(() => null);

  if (!body || !['BUYER', 'SELLER'].includes(body.role)) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'body.role must be BUYER or SELLER' }, 400);
  }

  if (body.role === 'SELLER' && !['SELLER', 'ADMIN'].includes(user.role)) {
    return c.json({ statusCode: 403, error: 'Forbidden', message: 'You do not have an approved seller account' }, 403);
  }

  const updated = await withPrisma((prisma) => prisma.user.update({
    where: { id: user.id },
    data: { activeRole: body.role },
  })).catch((err) => {
    if (!isMissingActiveRoleColumnError(err)) throw err;
    return null;
  });

  if (!updated) {
    return c.json({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Profile switching is unavailable until the database schema is updated',
    }, 503);
  }

  return c.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    activeRole: updated.activeRole ?? null,
    isSeller: updated.role === 'SELLER' || updated.role === 'ADMIN',
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

export { app as meRoutes };
