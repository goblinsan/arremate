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
 *
 * For ADMIN checks the permanent `role` field is used. For BUYER/SELLER checks
 * the user's `activeRole` (if set) takes precedence over `role`, allowing users
 * with a seller account to switch between profiles without signing out.
 */
export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('currentUser');

    if (!user) {
      return c.json({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' }, 401);
    }

    // ADMIN is always determined by the permanent role field.
    // For BUYER/SELLER the user's activeRole (if set) overrides their base role.
    const effectiveRole: Role = user.role === 'ADMIN' ? 'ADMIN' : (user.activeRole ?? user.role);

    if (!roles.includes(effectiveRole)) {
      return c.json({ statusCode: 403, error: 'Forbidden', message: `Requires role: ${roles.join(' or ')}` }, 403);
    }

    await next();
  });
}
