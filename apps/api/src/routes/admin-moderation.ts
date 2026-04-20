import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';

/**
 * Admin moderation routes for seller strikes and user suspensions.
 *
 * POST /v1/admin/users/:id/strikes   – issue a seller strike
 * POST /v1/admin/users/:id/suspend   – suspend a user account
 * POST /v1/admin/users/:id/unsuspend – lift a user suspension
 * GET  /v1/admin/users/:id/moderation-history – get moderation history for a user
 */
export async function adminModerationRoutes(fastify: FastifyInstance): Promise<void> {
  const adminGuard = [authenticate, requireRole('ADMIN')];

  // ─── Issue seller strike ────────────────────────────────────────────────────
  fastify.post('/v1/admin/users/:id/strikes', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.currentUser!;
    const { reason } = (request.body ?? {}) as { reason?: string };

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
    }

    if (user.role !== 'SELLER') {
      return reply.status(422).send({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Strikes can only be issued to sellers',
      });
    }

    const moderationCase = await prisma.moderationCase.create({
      data: {
        userId: id,
        actionType: 'SELLER_STRIKE',
        reason: reason ?? null,
        actorId: admin.id,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    await createAuditEvent({
      action: 'SELLER_STRIKE_ISSUED',
      actorId: admin.id,
      metadata: { targetUserId: id, reason: reason ?? null, moderationCaseId: moderationCase.id },
    });

    return reply.status(201).send(moderationCase);
  });

  // ─── Suspend user ────────────────────────────────────────────────────────────
  fastify.post('/v1/admin/users/:id/suspend', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.currentUser!;
    const { reason } = (request.body ?? {}) as { reason?: string };

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
    }

    if (user.isSuspended) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'User is already suspended',
      });
    }

    const [updatedUser, moderationCase] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { isSuspended: true, suspendedAt: new Date() },
      }),
      prisma.moderationCase.create({
        data: {
          userId: id,
          actionType: 'USER_SUSPENSION',
          reason: reason ?? null,
          actorId: admin.id,
        },
      }),
    ]);

    await createAuditEvent({
      action: 'USER_SUSPENDED',
      actorId: admin.id,
      metadata: { targetUserId: id, reason: reason ?? null, moderationCaseId: moderationCase.id },
    });

    return reply.send({ user: updatedUser, moderationCase });
  });

  // ─── Unsuspend user ──────────────────────────────────────────────────────────
  fastify.post('/v1/admin/users/:id/unsuspend', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.currentUser!;
    const { reason } = (request.body ?? {}) as { reason?: string };

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
    }

    if (!user.isSuspended) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'User is not currently suspended',
      });
    }

    const [updatedUser, moderationCase] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { isSuspended: false, suspendedAt: null },
      }),
      prisma.moderationCase.create({
        data: {
          userId: id,
          actionType: 'USER_UNSUSPENSION',
          reason: reason ?? null,
          actorId: admin.id,
        },
      }),
    ]);

    await createAuditEvent({
      action: 'USER_UNSUSPENDED',
      actorId: admin.id,
      metadata: { targetUserId: id, reason: reason ?? null, moderationCaseId: moderationCase.id },
    });

    return reply.send({ user: updatedUser, moderationCase });
  });

  // ─── Get moderation history for a user (admin) ──────────────────────────────
  fastify.get('/v1/admin/users/:id/moderation-history', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
    }

    const cases = await prisma.moderationCase.findMany({
      where: { userId: id },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ user, cases });
  });
}
