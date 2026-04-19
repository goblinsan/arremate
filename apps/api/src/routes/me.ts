import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/authenticate.js';

/**
 * GET /v1/me
 *
 * Returns the local User record and role for the currently authenticated user.
 * Requires a valid Cognito access token in the Authorization header.
 */
export async function meRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/v1/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!;

      return reply.send({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    },
  );
}
