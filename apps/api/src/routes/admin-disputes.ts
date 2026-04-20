import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';

/**
 * Admin dispute management routes.
 *
 * GET  /v1/admin/disputes           – list disputes (with optional status/reason filter)
 * GET  /v1/admin/disputes/:id       – get dispute detail with order and user context
 * POST /v1/admin/disputes/:id/resolve – resolve a dispute with a resolution note
 *
 * Buyer-facing:
 * POST /v1/orders/:orderId/dispute  – raise a dispute on a paid order
 */
export async function adminDisputeRoutes(fastify: FastifyInstance): Promise<void> {
  const adminGuard = [authenticate, requireRole('ADMIN')];
  const authGuard = [authenticate];

  // ─── Raise a dispute (buyer) ────────────────────────────────────────────────
  fastify.post('/v1/orders/:orderId/dispute', { preHandler: authGuard }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const user = request.currentUser!;
    const { reason, description } = (request.body ?? {}) as {
      reason?: string;
      description?: string;
    };

    if (!reason) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'reason is required' });
    }

    const validReasons = ['ITEM_NOT_RECEIVED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'OTHER'];
    if (!validReasons.includes(reason)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `reason must be one of: ${validReasons.join(', ')}`,
      });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
    }

    if (order.buyerId !== user.id && user.role !== 'ADMIN') {
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' });
    }

    if (!['PAID', 'REFUNDED'].includes(order.status)) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Can only raise a dispute on a paid order',
      });
    }

    const dispute = await prisma.dispute.create({
      data: {
        orderId,
        raisedById: user.id,
        reason: reason as 'ITEM_NOT_RECEIVED' | 'ITEM_NOT_AS_DESCRIBED' | 'PAYMENT_ISSUE' | 'OTHER',
        description: description ?? null,
      },
      include: {
        order: { select: { id: true, totalCents: true, status: true } },
        raisedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await createAuditEvent({
      action: 'DISPUTE_RAISED',
      actorId: user.id,
      metadata: { disputeId: dispute.id, orderId, reason },
    });

    return reply.status(201).send(dispute);
  });

  // ─── List disputes (admin) ──────────────────────────────────────────────────
  fastify.get('/v1/admin/disputes', { preHandler: adminGuard }, async (request, reply) => {
    const {
      status,
      reason,
      page = '1',
      perPage = '20',
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, Number(page));
    const take = Math.min(100, Math.max(1, Number(perPage)));
    const skip = (pageNum - 1) * take;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (reason) where.reason = reason;

    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          order: { select: { id: true, totalCents: true, status: true } },
          raisedBy: { select: { id: true, name: true, email: true } },
          resolvedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.dispute.count({ where }),
    ]);

    return reply.send({
      data: items,
      meta: { total, page: pageNum, perPage: take },
    });
  });

  // ─── Get dispute detail (admin) ─────────────────────────────────────────────
  fastify.get('/v1/admin/disputes/:id', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, name: true, email: true } },
            seller: { select: { id: true, name: true, email: true } },
            lines: true,
            payments: { select: { id: true, status: true, amountCents: true, providerId: true } },
          },
        },
        raisedBy: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!dispute) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Dispute not found' });
    }

    return reply.send(dispute);
  });

  // ─── Resolve dispute (admin) ─────────────────────────────────────────────────
  fastify.post('/v1/admin/disputes/:id/resolve', { preHandler: adminGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.currentUser!;
    const { resolution } = (request.body ?? {}) as { resolution?: string };

    const dispute = await prisma.dispute.findUnique({ where: { id } });

    if (!dispute) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Dispute not found' });
    }

    if (['RESOLVED', 'CLOSED'].includes(dispute.status)) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `Cannot resolve a dispute with status: ${dispute.status}`,
      });
    }

    const updated = await prisma.dispute.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedById: admin.id,
        resolution: resolution ?? null,
        resolvedAt: new Date(),
      },
      include: {
        order: { select: { id: true, totalCents: true, status: true } },
        raisedBy: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await createAuditEvent({
      action: 'DISPUTE_RESOLVED',
      actorId: admin.id,
      metadata: { disputeId: id, resolution: resolution ?? null },
    });

    return reply.send(updated);
  });
}
