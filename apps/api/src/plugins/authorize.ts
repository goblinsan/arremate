import { createMiddleware } from 'hono/factory';
import type { Role } from '@arremate/database';
import type { AppEnv } from '../types.js';

/**
 * Returns a Hono middleware that enforces role-based access.
 *
 * Usage:
 *   app.get('/admin-only', authenticate, requireRole('ADMIN'), handler)
 *
 * Must run **after** `authenticate` so that c.get('currentUser') is populated.
 */
export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('currentUser');

    if (!user) {
      return c.json({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ statusCode: 403, error: 'Forbidden', message: `Requires role: ${roles.join(' or ')}` }, 403);
    }

    await next();
  });
}
