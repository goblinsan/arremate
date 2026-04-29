import { Hono } from 'hono';
import { withPrisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_PLATFORMS = ['IOS', 'ANDROID'] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

function isValidPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (VALID_PLATFORMS as readonly string[]).includes(value);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /v1/devices
 *
 * Registers (or updates) a push notification device token for the authenticated
 * buyer.  Idempotent: re-registering an existing token for the same user is a
 * no-op; re-registering an existing token claimed by a different user
 * re-assigns it to the current user (device transfer after re-install).
 *
 * Body: { token: string, platform: "IOS" | "ANDROID" }
 */
app.post('/v1/devices', authenticate, async (c) => {
  const user = c.get('currentUser');
  const body = await c.req.json<{ token?: unknown; platform?: unknown }>().catch(() => null);

  if (!body) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token.trim() : null;
  if (!token) {
    return c.json({ statusCode: 422, error: 'Unprocessable Entity', message: 'token is required' }, 422);
  }
  if (token.length > 512) {
    return c.json({ statusCode: 422, error: 'Unprocessable Entity', message: 'token must be 512 characters or fewer' }, 422);
  }
  if (!isValidPlatform(body.platform)) {
    return c.json({ statusCode: 422, error: 'Unprocessable Entity', message: 'platform must be IOS or ANDROID' }, 422);
  }

  const record = await withPrisma((prisma) =>
    prisma.deviceToken.upsert({
      where: { token },
      create: { userId: user.id, token, platform: body.platform as Platform },
      update: { userId: user.id, platform: body.platform as Platform },
    }),
  );

  return c.json(record, 201);
});

/**
 * DELETE /v1/devices/:token
 *
 * Unregisters a push notification device token for the authenticated user.
 * Returns 204 on success, 404 if the token does not exist or belongs to a
 * different user.
 */
app.delete('/v1/devices/:token', authenticate, async (c) => {
  const user = c.get('currentUser');
  const tokenParam = c.req.param('token');

  const existing = await withPrisma((prisma) =>
    prisma.deviceToken.findUnique({ where: { token: tokenParam } }),
  );

  if (!existing || existing.userId !== user.id) {
    return c.json({ statusCode: 404, error: 'Not Found', message: 'Device token not found' }, 404);
  }

  await withPrisma((prisma) => prisma.deviceToken.delete({ where: { token: tokenParam } }));

  return new Response(null, { status: 204 });
});

/**
 * GET /v1/me/notification-preferences
 *
 * Returns the notification preferences for the authenticated user.
 * Creates a default record on first access.
 */
app.get('/v1/me/notification-preferences', authenticate, async (c) => {
  const user = c.get('currentUser');

  const prefs = await withPrisma((prisma) =>
    prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
  );

  return c.json(prefs);
});

/**
 * PATCH /v1/me/notification-preferences
 *
 * Updates one or more notification preference flags for the authenticated user.
 * All fields are optional; only provided fields are updated.
 *
 * Body: {
 *   showStartingSoon?: boolean,
 *   sellerLive?: boolean,
 *   claimExpiring?: boolean,
 *   paymentConfirmed?: boolean,
 *   orderShipped?: boolean,
 * }
 */
app.patch('/v1/me/notification-preferences', authenticate, async (c) => {
  const user = c.get('currentUser');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);

  if (!body) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const BOOLEAN_FIELDS = [
    'showStartingSoon',
    'sellerLive',
    'claimExpiring',
    'paymentConfirmed',
    'orderShipped',
  ] as const;

  const data: Partial<Record<(typeof BOOLEAN_FIELDS)[number], boolean>> = {};

  for (const field of BOOLEAN_FIELDS) {
    if (field in body) {
      if (typeof body[field] !== 'boolean') {
        return c.json(
          { statusCode: 422, error: 'Unprocessable Entity', message: `${field} must be a boolean` },
          422,
        );
      }
      data[field] = body[field] as boolean;
    }
  }

  const prefs = await withPrisma((prisma) =>
    prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    }),
  );

  return c.json(prefs);
});

export { app as deviceRoutes };
