import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@arremate/database';

/**
 * Returns a Fastify preHandler hook that enforces role-based access.
 *
 * Usage:
 *   fastify.get('/admin-only', { preHandler: [authenticate, requireRole('ADMIN')] }, handler)
 *
 * The hook must run **after** `authenticate` so that `request.currentUser` is
 * already populated.
 *
 * Returns 403 when the authenticated user does not have the required role.
 */
export function requireRole(...roles: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.currentUser;

    if (!user) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' });
    }

    if (!roles.includes(user.role)) {
      return reply
        .status(403)
        .send({ statusCode: 403, error: 'Forbidden', message: `Requires role: ${roles.join(' or ')}` });
    }
  };
}
