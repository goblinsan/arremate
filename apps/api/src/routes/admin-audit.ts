import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';

/**
 * Admin audit event browser routes.
 *
 * GET /v1/admin/audit-events – list audit events with optional action/actor filters
 */
export async function adminAuditRoutes(fastify: FastifyInstance): Promise<void> {
  const adminGuard = [authenticate, requireRole('ADMIN')];

  fastify.get('/v1/admin/audit-events', { preHandler: adminGuard }, async (request, reply) => {
    const {
      action,
      actorId,
      page = '1',
      perPage = '20',
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, Number(page));
    const take = Math.min(100, Math.max(1, Number(perPage)));
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (action) {
      // Support partial match so callers can filter by prefix e.g. "DISPUTE"
      where.action = { contains: action, mode: 'insensitive' };
    }
    if (actorId) where.actorId = actorId;

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return reply.send({
      data: items,
      meta: { total, page: pageNum, perPage: take },
    });
  });
}
