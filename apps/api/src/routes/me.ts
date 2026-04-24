import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

/**
 * GET /v1/me
 *
 * Returns the local User record and role for the currently authenticated user.
 * Requires a valid Cognito access token in the Authorization header.
 */
app.get('/v1/me', authenticate, (c) => {
  const user = c.get('currentUser');
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
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

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: rawName || null },
  });

  return c.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

export { app as meRoutes };
